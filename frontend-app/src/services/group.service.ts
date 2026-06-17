import axios from 'axios';
import { API_URL } from '../config/api';
import { Group, CreateGroupData, GroupMember } from '../types';

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

export const groupService = {
  async createGroup(data: CreateGroupData): Promise<{ message: string; group: Group }> {
    const response = await api.post<{ message: string; group: Group }>('/groups', data);
    return response.data;
  },

  async getGroups(): Promise<{ groups: Group[] }> {
    const response = await api.get<{ groups: Group[] }>('/groups');
    return response.data;
  },

  async getGroup(id: string): Promise<{ group: Group }> {
    const response = await api.get<{ group: Group }>(`/groups/${id}`);
    return response.data;
  },

  async addMembers(groupId: string, userIds: string[]): Promise<{ message: string; memberships: GroupMember[]; skipped: number }> {
    const response = await api.post<{ message: string; memberships: GroupMember[]; skipped: number }>(
      `/groups/${groupId}/members`,
      { userIds }
    );
    return response.data;
  },

  async removeMember(groupId: string, memberId: string): Promise<{ message: string }> {
    const response = await api.delete<{ message: string }>(`/groups/${groupId}/members/${memberId}`);
    return response.data;
  },

  async leaveGroup(groupId: string): Promise<{ message: string }> {
    const response = await api.post<{ message: string }>(`/groups/${groupId}/leave`);
    return response.data;
  },

  async getMembershipHistory(groupId: string): Promise<{ history: GroupMember[] }> {
    const response = await api.get<{ history: GroupMember[] }>(`/groups/${groupId}/history`);
    return response.data;
  },
};
