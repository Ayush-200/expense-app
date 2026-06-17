import { Response } from 'express';
import { prisma } from '../config/database';
import { createExpenseSchema, updateExpenseSchema } from '../validations/expense.validation';
import { calculateSplits, SplitType } from '../utils/splitCalculator';
import { AuthRequest } from '../types';

// Shared include for consistent response shape
const expenseInclude = {
  paidBy: { select: { id: true, name: true, email: true } },
  participants: {
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { id: 'asc' as const },
  },
  group: { select: { id: true, name: true } },
};

export const createExpense = async (req: AuthRequest, res: Response) => {
  try {
    const data = createExpenseSchema.parse(req.body);
    const userId = req.user!.id;

    // Verify user is an active member of the group
    const membership = await prisma.groupMember.findFirst({
      where: { groupId: data.groupId, userId, leftAt: null },
    });
    if (!membership) {
      return res.status(403).json({ message: 'You are not a member of this group' });
    }

    // Calculate each participant's share — throws on invalid splits
    const calculated = calculateSplits(
      data.totalAmount,
      data.splitType as SplitType,
      data.participants
    );

    const expense = await prisma.expense.create({
      data: {
        groupId: data.groupId,
        paidById: userId,
        description: data.description,
        totalAmount: data.totalAmount,
        splitType: data.splitType,
        date: data.date ? new Date(data.date) : new Date(),
        participants: {
          create: calculated.map((p) => ({
            userId: p.userId ?? null,
            guestName: p.guestName ?? null,
            guestEmail: p.guestEmail ?? null,
            amountOwed: p.amountOwed,
            splitMetadata: p.splitMetadata as any,
          })),
        },
      },
      include: expenseInclude,
    });

    res.status(201).json({ message: 'Expense created', expense });
  } catch (error) {
    throw error;
  }
};

export const getExpenses = async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.query;
    const userId = req.user!.id;

    if (!groupId) {
      return res.status(400).json({ message: 'groupId query param is required' });
    }

    // Verify membership
    const membership = await prisma.groupMember.findFirst({
      where: { groupId: groupId as string, userId, leftAt: null },
    });
    if (!membership) {
      return res.status(403).json({ message: 'You are not a member of this group' });
    }

    const expenses = await prisma.expense.findMany({
      where: { groupId: groupId as string },
      include: expenseInclude,
      orderBy: { date: 'desc' },
    });

    res.json({ expenses });
  } catch (error) {
    throw error;
  }
};

export const getExpense = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const expense = await prisma.expense.findUnique({
      where: { id },
      include: expenseInclude,
    });

    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    // Verify user is a member of the expense's group
    const membership = await prisma.groupMember.findFirst({
      where: { groupId: expense.groupId, userId, leftAt: null },
    });
    if (!membership) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json({ expense });
  } catch (error) {
    throw error;
  }
};

export const updateExpense = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const data = updateExpenseSchema.parse(req.body);

    const existing = await prisma.expense.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    // Only the person who paid can edit
    if (existing.paidById !== userId) {
      return res.status(403).json({ message: 'Only the payer can edit this expense' });
    }

    const totalAmount = data.totalAmount ?? Number(existing.totalAmount);
    const splitType = (data.splitType ?? existing.splitType) as SplitType;

    let participantData = undefined;
    if (data.participants) {
      const calculated = calculateSplits(totalAmount, splitType, data.participants);
      participantData = {
        // Delete old participants and recreate
        deleteMany: {},
        create: calculated.map((p) => ({
          userId: p.userId ?? null,
          guestName: p.guestName ?? null,
          guestEmail: p.guestEmail ?? null,
          amountOwed: p.amountOwed,
          splitMetadata: p.splitMetadata as any,
        })),
      };
    }

    const expense = await prisma.expense.update({
      where: { id },
      data: {
        description: data.description,
        totalAmount: data.totalAmount,
        splitType: data.splitType,
        date: data.date ? new Date(data.date) : undefined,
        participants: participantData,
      },
      include: expenseInclude,
    });

    res.json({ message: 'Expense updated', expense });
  } catch (error) {
    throw error;
  }
};

export const getExpenseParticipants = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const expense = await prisma.expense.findUnique({
      where: { id },
      select: { id: true, groupId: true },
    });
    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    const membership = await prisma.groupMember.findFirst({
      where: { groupId: expense.groupId, userId, leftAt: null },
    });
    if (!membership) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const participants = await prisma.expenseParticipant.findMany({
      where: { expenseId: id },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { id: 'asc' as const },
    });

    res.json({ participants });
  } catch (error) {
    throw error;
  }
};

export const deleteExpense = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const existing = await prisma.expense.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    if (existing.paidById !== userId) {
      return res.status(403).json({ message: 'Only the payer can delete this expense' });
    }

    await prisma.expense.delete({ where: { id } });

    res.json({ message: 'Expense deleted' });
  } catch (error) {
    throw error;
  }
};
