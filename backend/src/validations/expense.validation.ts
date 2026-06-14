import { z } from 'zod';

const participantBase = z.object({
  userId: z.string().optional(),
  guestName: z.string().min(1).optional(),
  guestEmail: z.string().email().optional(),
  exactAmount: z.number().positive().optional(),
  percentage: z.number().positive().optional(),
  shares: z.number().positive().optional(),
}).refine(
  (p) => p.userId || p.guestName,
  { message: 'Each participant must have a userId or guestName' }
);

export const createExpenseSchema = z.object({
  groupId: z.string().min(1, 'Group ID is required'),
  description: z.string().min(1, 'Description is required').max(255),
  totalAmount: z.number().positive('Amount must be positive'),
  splitType: z.enum(['EQUAL', 'EXACT', 'PERCENTAGE', 'SHARE']),
  date: z.string().optional(),
  participants: z.array(participantBase).min(1, 'At least one participant is required'),
});

export const updateExpenseSchema = createExpenseSchema.partial().extend({
  participants: z.array(participantBase).min(1).optional(),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
