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

export interface SettlementContribution {
  settlementId: string;
  date: string;
  fromUserName: string;
  toUserName: string;
  amount: number;
  note?: string;
  /** positive if your balance improved (you paid off debt or someone paid you), negative if your balance decreased (you received payment and are owed less) */
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
  settlementContributions: SettlementContribution[];
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

export interface SettlementRecord {
  id: string;
  groupId: string;
  fromUserId: string;
  toUserId: string;
  amount: string;
  note?: string;
  date: string;
  createdAt: string;
  fromUser: { id: string; name: string };
  toUser: { id: string; name: string };
}

export interface SettlementHistoryResponse {
  settlements: SettlementRecord[];
}

export interface CreateSettlementData {
  toUserId: string;
  amount: number;
  note?: string;
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

  async getSettlementHistory(groupId: string): Promise<SettlementHistoryResponse> {
    const res = await api.get<SettlementHistoryResponse>(`/settlements/groups/${groupId}/history`);
    return res.data;
  },

  async createSettlement(groupId: string, data: CreateSettlementData): Promise<{ message: string; settlement: SettlementRecord }> {
    const res = await api.post(`/settlements/groups/${groupId}`, data);
    return res.data;
  },

  async deleteSettlement(settlementId: string): Promise<{ message: string }> {
    const res = await api.delete(`/settlements/${settlementId}`);
    return res.data;
  },
};
