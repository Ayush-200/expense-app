import { Response } from 'express';
import { prisma } from '../config/database';
import { AuthRequest } from '../types';
import {
  calculateBalances,
  calculateSettlements,
} from '../utils/settlementCalculator';

const expenseIncludeForCalculation = {
  paidBy: { select: { id: true, name: true } },
  participants: {
    include: { user: { select: { id: true, name: true } } },
  },
} as const;

function shapeExpenses(expenses: any[]) {
  return expenses.map((e) => ({
    id: e.id,
    description: e.description,
    date: e.date instanceof Date ? e.date.toISOString() : String(e.date),
    splitType: e.splitType,
    paidById: e.paidById,
    paidByName: e.paidBy.name,
    totalAmount: Number(e.totalAmount),
    participants: e.participants.map((p: any) => ({
      userId: p.userId ?? undefined,
      guestName: p.guestName ?? undefined,
      guestEmail: p.guestEmail ?? undefined,
      userName: p.user?.name,
      amountOwed: Number(p.amountOwed),
    })),
  }));
}

/**
 * GET /settlements/groups/:id/balances
 * Returns group-wise balances, simplified settlements, and per-expense breakdown.
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

    const expenses = await prisma.expense.findMany({
      where: { groupId: id },
      include: expenseIncludeForCalculation,
      orderBy: { date: 'asc' },
    });

    if (expenses.length === 0) {
      return res.json({ balances: [], settlements: [], totalExpenses: 0 });
    }

    const shaped = shapeExpenses(expenses);
    const balancesMap = calculateBalances(shaped);
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

    // All active groups this user belongs to
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
      const expenses = await prisma.expense.findMany({
        where: { groupId: m.groupId },
        include: expenseIncludeForCalculation,
        orderBy: { date: 'asc' },
      });

      if (expenses.length === 0) continue;

      const shaped = shapeExpenses(expenses);
      const balancesMap = calculateBalances(shaped);
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
