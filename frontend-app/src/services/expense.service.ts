import axios from 'axios';
import { API_URL } from '../config/api';
import { Expense, CreateExpenseData } from '../types';

const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const expenseService = {
  async createExpense(data: CreateExpenseData): Promise<{ expense: Expense }> {
    const res = await api.post<{ expense: Expense }>('/expenses', data);
    return res.data;
  },

  async getExpenses(groupId: string): Promise<{ expenses: Expense[] }> {
    const res = await api.get<{ expenses: Expense[] }>('/expenses', {
      params: { groupId },
    });
    return res.data;
  },

  async getExpense(id: string): Promise<{ expense: Expense }> {
    const res = await api.get<{ expense: Expense }>(`/expenses/${id}`);
    return res.data;
  },

  async updateExpense(id: string, data: Partial<CreateExpenseData>): Promise<{ expense: Expense }> {
    const res = await api.put<{ expense: Expense }>(`/expenses/${id}`, data);
    return res.data;
  },

  async deleteExpense(id: string): Promise<void> {
    await api.delete(`/expenses/${id}`);
  },
};
