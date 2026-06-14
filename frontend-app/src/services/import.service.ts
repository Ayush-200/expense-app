import axios from 'axios';
import { API_URL } from '../config/api';

const api = axios.create({ baseURL: API_URL });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export interface ImportResult {
  message: string;
  summary: {
    total: number;
    created: number;
    failed: number;
  };
  created: Array<{ row: number; expenseId: string }>;
  errors?: string[];
}

export const importService = {
  async importExpenses(groupId: string, file: File): Promise<ImportResult> {
    const formData = new FormData();
    formData.append('file', file);

    const res = await api.post<ImportResult>(
      `/import/expenses/${groupId}`,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
      }
    );
    return res.data;
  },

  async downloadTemplate(): Promise<Blob> {
    const res = await api.get('/import/template', {
      responseType: 'blob',
    });
    return res.data;
  },
};
