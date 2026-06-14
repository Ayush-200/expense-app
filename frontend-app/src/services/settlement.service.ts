import axios from 'axios';
import { API_URL } from '../config/api';

const api = axios.create({ baseURL: API_URL });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export interface ExpenseContribution {
  expenseId: string;
  description: string;
  date: string;
  totalAmount: number;
  splitType: string;
  paidAmount: number;
  owedAmount: number;
  /** positive = this person came out ahead; negative = they owe more than they paid */
  net: number;
}

export interface BalanceEntry {
  userId?: string;
  guestName?: string;
  name: string;
  paid: number;
  owes: number;
  net: number;
  contributions: ExpenseContribution[];
}

export interface Settlement {
  fromUserId?: string;
  fromName: string;
  fromGuestName?: string;
  toUserId?: string;
  toName: string;
  amount: number;
}

export interface BalancesResponse {
  balances: BalanceEntry[];
  settlements: Settlement[];
  totalExpenses: number;
}

export interface GroupBalanceSummary {
  groupId: string;
  groupName: string;
  net: number;
  paid: number;
  owes: number;
}

export interface MyBalancesResponse {
  groupSummaries: GroupBalanceSummary[];
  totalNet: number;
  totalPaid: number;
  totalOwes: number;
}

export const settlementService = {
  async getGroupBalances(groupId: string): Promise<BalancesResponse> {
    const res = await api.get<BalancesResponse>(`/settlements/groups/${groupId}/balances`);
    return res.data;
  },

  async getMyBalances(): Promise<MyBalancesResponse> {
    const res = await api.get<MyBalancesResponse>('/settlements/me');
    return res.data;
  },
};
