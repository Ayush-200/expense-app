import { z } from 'zod';

export const createGroupSchema = z.object({
  name: z
    .string()
    .min(2, 'Group name must be at least 2 characters')
    .max(100, 'Group name must not exceed 100 characters'),
  description: z
    .string()
    .max(500, 'Description must not exceed 500 characters')
    .optional(),
});

export const addMemberSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
});

export const addMembersSchema = z.object({
  userIds: z.array(z.string().min(1)).min(1, 'At least one user ID is required'),
});

export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type AddMemberInput = z.infer<typeof addMemberSchema>;
