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

export interface CreateGroupData {
  name: string;
  description?: string;
}

export interface AddMemberData {
  userId: string;
}
