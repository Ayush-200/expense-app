import { Response } from 'express';
import { prisma } from '../config/database';
import { AuthRequest } from '../types';
import {
  calculateBalances,
  calculateSettlements,
} from '../utils/settlementCalculator';

export const getGroupBalances = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params; // groupId
    const userId = req.user!.id;

    // Verify membership
    const membership = await prisma.groupMember.findFirst({
      where: { groupId: id, userId, leftAt: null },
    });
    if (!membership) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Fetch all expenses with participants
    const expenses = await prisma.expense.findMany({
      where: { groupId: id },
      include: {
        paidBy: { select: { id: true, name: true } },
        participants: {
          include: {
            user: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (expenses.length === 0) {
      return res.json({ balances: [], settlements: [], totalExpenses: 0 });
    }

    // Shape data for calculator
    const shaped = expenses.map((e) => ({
      paidById: e.paidById,
      paidByName: e.paidBy.name,
      totalAmount: Number(e.totalAmount),
      participants: e.participants.map((p) => ({
        userId: p.userId ?? undefined,
        guestName: p.guestName ?? undefined,
        guestEmail: p.guestEmail ?? undefined,
        userName: p.user?.name,
        amountOwed: Number(p.amountOwed),
      })),
    }));

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
