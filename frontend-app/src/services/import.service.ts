import axios from 'axios';
import { API_URL } from '../config/api';

const api = axios.create({ baseURL: API_URL });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export type AnomalySeverity = 'ERROR' | 'WARNING' | 'INFO';

export type AnomalyType =
  | 'DUPLICATE_EXPENSE'
  | 'INCONSISTENT_NAME'
  | 'MISSING_PAYER'
  | 'SETTLEMENT_AS_EXPENSE'
  | 'MISSING_CURRENCY'
  | 'CURRENCY_CONVERSION'
  | 'NEGATIVE_AMOUNT'
  | 'INVALID_DATE'
  | 'AMBIGUOUS_DATE'
  | 'SPLIT_INCONSISTENCY'
  | 'INVALID_MEMBER_FOR_DATE'
  | 'GUEST_PARTICIPANT'
  | 'PAYER_NOT_MEMBER'
  | 'PERCENTAGE_MISMATCH';

export interface Anomaly {
  rowNumber: number;
  severity: AnomalySeverity;
  anomalyType: AnomalyType;
  field?: string;
  message: string;
  originalValue?: string;
  suggestedValue?: string;
  canAutoFix: boolean;
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
  [key: string]: any;
}

export interface DetailRow {
  rowNumber: number;
  anomalies: Anomaly[];
  rowData: CSVRow;
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
  details: DetailRow[];
}

export interface JobMember {
  id: string;
  name: string;
  email: string;
  joinedAt: string;
  leftAt: string | null;
}

export interface ImportJobResponse {
  job: {
    id: string;
    groupId: string;
    userId: string;
    fileName: string;
    status: string;
    totalRows: number;
    processedRows: number;
    successfulRows: number;
    failedRows: number;
    rowData: CSVRow[];
    anomalies: Array<{
      id: string;
      importJobId: string;
      rowNumber: number;
      severity: string;
      anomalyType: string;
      field: string | null;
      message: string;
      originalValue: string | null;
      suggestedValue: string | null;
      resolution: string | null;
      rowData: CSVRow;
    }>;
  };
  members: JobMember[];
}

export type ResolutionMap = Record<number, {
  payerId?: string;
  date?: string;
  currency?: string;
  exchangeRate?: number;
  isSettlement?: boolean;
  payeeId?: string;
  skip?: boolean;
  confirmedDuplicate?: boolean;
  splitType?: string;
  participantShares?: string;
  participants?: string;
}>;

export const importService = {
  async uploadAndValidate(groupId: string, file: File, exchangeRate?: number): Promise<ImportReport> {
    const formData = new FormData();
    formData.append('file', file);
    if (exchangeRate) {
      formData.append('exchangeRate', exchangeRate.toString());
    }

    const res = await api.post<ImportReport>(
      `/import/expenses/${groupId}`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return res.data;
  },

  async getImportJob(jobId: string): Promise<ImportJobResponse> {
    const res = await api.get<ImportJobResponse>(`/import/jobs/${jobId}`);
    return res.data;
  },

  async confirmImport(jobId: string, resolutions: ResolutionMap): Promise<{ message: string; job: any }> {
    const res = await api.post<{ message: string; job: any }>(`/import/jobs/${jobId}/confirm`, { resolutions });
    return res.data;
  },

  async downloadTemplate(): Promise<Blob> {
    const res = await api.get('/import/template', { responseType: 'blob' });
    return res.data;
  },
};
