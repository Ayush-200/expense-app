export type SplitType = 'EQUAL' | 'PERCENTAGE' | 'SHARE';

export interface User {
  id: string;
  name: string;
  email: string;
}

export interface AuthResponse {
  message: string;
  token: string;
  user: User;
}

export interface RegisterData {
  name: string;
  email: string;
  password: string;
}

export interface LoginData {
  email: string;
  password: string;
}

export interface Group {
  id: string;
  name: string;
  description?: string;
  createdById: string;
  createdBy: User;
  createdAt: string;
  updatedAt: string;
  members: GroupMember[];
  _count?: {
    members: number;
  };
}

export interface GroupMember {
  id: string;
  groupId: string;
  userId: string;
  joinedAt: string;
  leftAt?: string | null;
  user: User;
}

export interface AddMemberData {
  userId: string;
}

export interface CreateGroupData {
  name: string;
  description?: string;
}

export interface ExpenseParticipant {
  id: string;
  expenseId: string;
  userId?: string;
  guestName?: string;
  guestEmail?: string;
  amountOwed: string;
  splitMetadata?: Record<string, unknown>;
  user?: User;
}

export interface Expense {
  id: string;
  groupId: string;
  group: { id: string; name: string };
  paidById: string;
  paidBy: User;
  description: string;
  totalAmount: string;
  splitType: SplitType;
  date: string;
  createdAt: string;
  updatedAt: string;
  participants: ExpenseParticipant[];
}

export interface ParticipantInput {
  userId?: string;
  guestName?: string;
  guestEmail?: string;
  exactAmount?: number;
  percentage?: number;
  shares?: number;
}

export interface CreateExpenseData {
  groupId: string;
  description: string;
  totalAmount: number;
  splitType: SplitType;
  date?: string;
  participants: ParticipantInput[];
}
