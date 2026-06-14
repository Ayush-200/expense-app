import axios from 'axios';
import { API_URL } from '../config/api';
import { User } from '../types';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const userService = {
  async getUsers(): Promise<{ users: User[] }> {
    const response = await api.get<{ users: User[] }>('/users');
    return response.data;
  },
};
