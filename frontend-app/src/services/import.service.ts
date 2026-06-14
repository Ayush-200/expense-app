import axios from 'axios';
import { API_URL } from '../config/api';

const api = axios.create({ baseURL: API_URL });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export interface Anomaly {
  id?: string;
  rowNumber: number;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  anomalyType: string;
  field?: string;
  message: string;
  originalValue?: string;
  suggestedValue?: string;
  resolution?: string;
}

export interface CSVRow {
  date: string;
  description: string;
  paidBy: string;
  amount: string;
  currency?: string;
  splitType?: string;
  participants?: string;
  participantShares?: string;
  type?: string;
}

export interface ImportReport {
  importJobId: string;
  status: 'COMPLETED' | 'FAILED' | 'REQUIRES_APPROVAL';
  totalRows: number;
  processedRows: number;
  successfulRows: number;
  failedRows: number;
  anomalies: {
    errors: number;
    warnings: number;
    info: number;
    byType: Record<string, number>;
  };
  summary: string;
  details: Array<{
    rowNumber: number;
    anomalies: Anomaly[];
    rowData: CSVRow;
  }>;
}

export interface GroupMember {
  id: string;
  name: string;
  email: string;
  joinedAt: string;
  leftAt: string | null;
}

export interface ImportJobDetails {
  job: {
    id: string;
    groupId: string;
    userId: string;
    fileName: string;
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'REQUIRES_APPROVAL';
    totalRows: number;
    processedRows: number;
    successfulRows: number;
    failedRows: number;
    rowData: CSVRow[];
    anomalies: Anomaly[];
  };
  members: GroupMember[];
}

export interface Resolution {
  payerId?: string;
  date?: string;
  currency?: string;
  exchangeRate?: number;
  isSettlement?: boolean;
  payeeId?: string;
  skip?: boolean;
  confirmedDuplicate?: boolean;
}

export const importService = {
  async importExpenses(groupId: string, file: File): Promise<ImportReport> {
    const formData = new FormData();
    formData.append('file', file);

    const res = await api.post<ImportReport>(
      `/import/expenses/${groupId}`,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
      }
    );
    return res.data;
  },

  async getImportJob(jobId: string): Promise<ImportJobDetails> {
    const res = await api.get<ImportJobDetails>(`/import/jobs/${jobId}`);
    return res.data;
  },

  async confirmImport(jobId: string, resolutions: Record<number, Resolution>): Promise<{ message: string }> {
    const res = await api.post<{ message: string }>(`/import/jobs/${jobId}/confirm`, {
      resolutions,
    });
    return res.data;
  },

  async downloadTemplate(): Promise<Blob> {
    const res = await api.get('/import/template', {
      responseType: 'blob',
    });
    return res.data;
  },
};
