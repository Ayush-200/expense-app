import axios from 'axios';
import { API_URL } from '../config/api';

const api = axios.create({ baseURL: API_URL });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export interface BalanceEntry {
  userId?: string;
  guestName?: string;
  name: string;
  paid: number;
  owes: number;
  net: number;
}

export interface Settlement {
  fromUserId?: string;
  fromName: string;
  toUserId?: string;
  toName: string;
  amount: number;
}

export interface BalancesResponse {
  balances: BalanceEntry[];
  settlements: Settlement[];
  totalExpenses: number;
}

export const settlementService = {
  async getGroupBalances(groupId: string): Promise<BalancesResponse> {
    const res = await api.get<BalancesResponse>(`/settlements/groups/${groupId}/balances`);
    return res.data;
  },
};
