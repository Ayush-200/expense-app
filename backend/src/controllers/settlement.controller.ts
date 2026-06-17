import { Response } from 'express';
import { prisma } from '../config/database';
import { AuthRequest } from '../types';
import {
  calculateBalances,
  calculateSettlements,
  SettlementForCalculation,
} from '../utils/settlementCalculator';

const expenseIncludeForCalculation = {
  paidBy: { select: { id: true, name: true } },
  participants: {
    include: { user: { select: { id: true, name: true } } },
    orderBy: { id: 'asc' as const },
  },
} as const;

const settlementIncludeForCalculation = {
  fromUser: { select: { id: true, name: true } },
  toUser: { select: { id: true, name: true } },
} as const;

interface MembershipPeriod {
  userId: string;
  joinedAt: Date;
  leftAt: Date | null;
}

function wasMemberAt(memberships: MembershipPeriod[], userId: string, date: Date): boolean {
  const member = memberships.find(m => m.userId === userId);
  if (!member) return false;
  if (date < member.joinedAt) return false;
  if (member.leftAt && date > member.leftAt) return false;
  return true;
}

function shapeExpenses(expenses: any[], memberships: MembershipPeriod[]) {
  return expenses.map((e) => {
    const expenseDate = e.date instanceof Date ? e.date : new Date(e.date);
    return {
      id: e.id,
      description: e.description,
      date: expenseDate.toISOString(),
      splitType: e.splitType,
      paidById: e.paidById,
      paidByName: e.paidBy.name,
      totalAmount: Number(e.totalAmount),
      participants: e.participants
        .filter((p: any) => {
          // Guests are always included (they don't have membership)
          if (!p.userId) return true;
          return wasMemberAt(memberships, p.userId, expenseDate);
        })
        .map((p: any) => ({
          userId: p.userId ?? undefined,
          guestName: p.guestName ?? undefined,
          guestEmail: p.guestEmail ?? undefined,
          userName: p.user?.name,
          amountOwed: Number(p.amountOwed),
        })),
    };
  });
}

function shapeSettlements(settlements: any[]): SettlementForCalculation[] {
  return settlements.map((s) => ({
    id: s.id,
    date: s.date instanceof Date ? s.date.toISOString() : String(s.date),
    fromUserId: s.fromUserId,
    fromUserName: s.fromUser.name,
    toUserId: s.toUserId,
    toUserName: s.toUser.name,
    amount: Number(s.amount),
    currency: s.currency || 'INR',
    note: s.note ?? undefined,
  }));
}

/**
 * GET /settlements/groups/:id/balances
 * Returns group-wise balances, simplified settlements, and per-expense breakdown.
 * Now includes actual settlement records in balance calculation.
 */
export const getGroupBalances = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const membership = await prisma.groupMember.findFirst({
      where: { groupId: id, userId, leftAt: null },
    });
    if (!membership) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const [expenses, settlementsRecords, allMembers] = await Promise.all([
      prisma.expense.findMany({
        where: { groupId: id },
        include: expenseIncludeForCalculation,
        orderBy: { date: 'asc' },
      }),
      prisma.settlement.findMany({
        where: { groupId: id },
        include: settlementIncludeForCalculation,
        orderBy: { date: 'asc' },
      }),
      prisma.groupMember.findMany({
        where: { groupId: id },
        select: { userId: true, joinedAt: true, leftAt: true },
      }),
    ]);

    const memberships: MembershipPeriod[] = allMembers.map(m => ({
      userId: m.userId,
      joinedAt: m.joinedAt,
      leftAt: m.leftAt,
    }));

    if (expenses.length === 0 && settlementsRecords.length === 0) {
      return res.json({ balances: [], settlements: [], totalExpenses: 0 });
    }

    const shapedExpenses = shapeExpenses(expenses, memberships);
    const shapedSettlements = shapeSettlements(settlementsRecords);
    const balancesMap = calculateBalances(shapedExpenses, shapedSettlements);
    const settlements = calculateSettlements(balancesMap);

    const totalExpenses = expenses.reduce(
      (sum, e) => sum + Number(e.totalAmount),
      0
    );

    res.json({
      balances: Array.from(balancesMap.values()),
      settlements,
      totalExpenses: Math.round(totalExpenses * 100) / 100,
    });
  } catch (error) {
    throw error;
  }
};

/**
 * GET /settlements/me
 * Individual balance summary across all groups the user belongs to.
 */
export const getMyBalances = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const memberships = await prisma.groupMember.findMany({
      where: { userId, leftAt: null },
      include: { group: { select: { id: true, name: true } } },
    });

    const groupSummaries: Array<{
      groupId: string;
      groupName: string;
      net: number;
      paid: number;
      owes: number;
    }> = [];

    for (const m of memberships) {
      const [expenses, settlementsRecords, groupMembers] = await Promise.all([
        prisma.expense.findMany({
          where: { groupId: m.groupId },
          include: expenseIncludeForCalculation,
          orderBy: { date: 'asc' },
        }),
        prisma.settlement.findMany({
          where: { groupId: m.groupId },
          include: settlementIncludeForCalculation,
          orderBy: { date: 'asc' },
        }),
        prisma.groupMember.findMany({
          where: { groupId: m.groupId },
          select: { userId: true, joinedAt: true, leftAt: true },
        }),
      ]);

      if (expenses.length === 0 && settlementsRecords.length === 0) continue;

      const groupMemberships: MembershipPeriod[] = groupMembers.map(gm => ({
        userId: gm.userId,
        joinedAt: gm.joinedAt,
        leftAt: gm.leftAt,
      }));
      const shapedExpenses = shapeExpenses(expenses, groupMemberships);
      const shapedSettlements = shapeSettlements(settlementsRecords);
      const balancesMap = calculateBalances(shapedExpenses, shapedSettlements);
      const userEntry = balancesMap.get(userId);

      if (!userEntry) continue;

      groupSummaries.push({
        groupId: m.groupId,
        groupName: m.group.name,
        net: userEntry.net,
        paid: userEntry.paid,
        owes: userEntry.owes,
      });
    }

    const totalNet = Math.round(
      groupSummaries.reduce((s, g) => s + g.net, 0) * 100
    ) / 100;
    const totalPaid = Math.round(
      groupSummaries.reduce((s, g) => s + g.paid, 0) * 100
    ) / 100;
    const totalOwes = Math.round(
      groupSummaries.reduce((s, g) => s + g.owes, 0) * 100
    ) / 100;

    res.json({ groupSummaries, totalNet, totalPaid, totalOwes });
  } catch (error) {
    throw error;
  }
};

/**
 * POST /settlements/groups/:id
 * Record a settlement payment between users in a group.
 */
export const createSettlement = async (req: AuthRequest, res: Response) => {
  try {
    const { id: groupId } = req.params;
    const { toUserId, amount, currency, note } = req.body;
    const fromUserId = req.user!.id;

    if (!toUserId || !amount || amount <= 0) {
      return res.status(400).json({
        message: 'toUserId and positive amount are required',
      });
    }

    if (fromUserId === toUserId) {
      return res.status(400).json({
        message: 'Cannot settle with yourself',
      });
    }

    // Verify both users are active members
    const [fromMember, toMember] = await Promise.all([
      prisma.groupMember.findFirst({
        where: { groupId, userId: fromUserId, leftAt: null },
      }),
      prisma.groupMember.findFirst({
        where: { groupId, userId: toUserId, leftAt: null },
      }),
    ]);

    if (!fromMember) {
      return res.status(403).json({ message: 'You are not a member of this group' });
    }
    if (!toMember) {
      return res.status(400).json({ message: 'Recipient is not a member of this group' });
    }

    const settlement = await prisma.settlement.create({
      data: {
        groupId,
        fromUserId,
        toUserId,
        amount,
        currency: (currency || 'INR').toUpperCase(),
        note: note ?? null,
      },
      include: settlementIncludeForCalculation,
    });

    res.status(201).json({ message: 'Settlement recorded', settlement });
  } catch (error) {
    throw error;
  }
};

/**
 * GET /settlements/groups/:id/history
 * Get settlement history for a group.
 */
export const getSettlementHistory = async (req: AuthRequest, res: Response) => {
  try {
    const { id: groupId } = req.params;
    const userId = req.user!.id;

    const membership = await prisma.groupMember.findFirst({
      where: { groupId, userId, leftAt: null },
    });
    if (!membership) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const settlements = await prisma.settlement.findMany({
      where: { groupId },
      include: settlementIncludeForCalculation,
      orderBy: { date: 'desc' },
    });

    res.json({ settlements });
  } catch (error) {
    throw error;
  }
};

/**
 * DELETE /settlements/:settlementId
 * Delete a settlement record (only by the person who created it).
 */
export const deleteSettlement = async (req: AuthRequest, res: Response) => {
  try {
    const { settlementId } = req.params;
    const userId = req.user!.id;

    const settlement = await prisma.settlement.findUnique({
      where: { id: settlementId },
    });

    if (!settlement) {
      return res.status(404).json({ message: 'Settlement not found' });
    }

    // Only the payer can delete
    if (settlement.fromUserId !== userId) {
      return res.status(403).json({
        message: 'Only the person who made the payment can delete it',
      });
    }

    await prisma.settlement.delete({ where: { id: settlementId } });

    res.json({ message: 'Settlement deleted' });
  } catch (error) {
    throw error;
  }
};
