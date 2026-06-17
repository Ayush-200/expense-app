import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { groupService } from '../services/group.service';
import { userService } from '../services/user.service';
import { useAuth } from '../context/AuthContext';
import { Group, User, GroupMember } from '../types';
import { formatDate } from '../utils/date';
import { Layout } from '../components/Layout';
import { Card } from '../components/Card';
import { Button } from '../components/Button';

export function GroupDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const [group, setGroup] = useState<Group | null>(null);
  const [history, setHistory] = useState<GroupMember[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddMember, setShowAddMember] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    if (id) {
      loadGroup();
      loadUsers();
    }
  }, [id]);

  const loadGroup = async () => {
    try {
      const data = await groupService.getGroup(id!);
      setGroup(data.group);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load group');
    } finally {
      setIsLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const data = await userService.getUsers();
      setAllUsers(data.users);
    } catch (err) {
      console.error('Failed to load users');
    }
  };

  const loadHistory = async () => {
    try {
      const data = await groupService.getMembershipHistory(id!);
      setHistory(data.history);
      setShowHistory(true);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load history');
    }
  };

  const handleAddMembers = async () => {
    if (selectedUserIds.length === 0) return;

    try {
      const result = await groupService.addMembers(id!, selectedUserIds);
      setSuccessMessage(result.message);
      setShowAddMember(false);
      setSelectedUserIds([]);
      loadGroup();
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to add members');
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!confirm('Are you sure you want to remove this member?')) return;

    try {
      await groupService.removeMember(id!, memberId);
      setSuccessMessage('Member removed successfully');
      loadGroup();
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to remove member');
    }
  };

  const handleLeaveGroup = async () => {
    if (!confirm('Are you sure you want to leave this group?')) return;

    try {
      await groupService.leaveGroup(id!);
      navigate('/groups');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to leave group');
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex justify-center items-center min-h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
        </div>
      </Layout>
    );
  }

  if (!group) {
    return (
      <Layout>
        <Card>
          <p className="text-red-400">Group not found</p>
        </Card>
      </Layout>
    );
  }

  const availableUsers = allUsers.filter(
    (u) => !group.members.some((m) => m.userId === u.id)
  );

  const isCreator = group.createdById === currentUser?.id;

  return (
    <Layout>
    <div className="space-y-6">
      <div className="mb-6">
        <Link to="/groups" className="text-primary-500 hover:text-primary-400 text-sm">
          ← Back to Groups
        </Link>
      </div>

      {error && (
        <div className="p-3 rounded-lg text-sm bg-red-900/30 text-red-400 border border-red-800">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="p-3 rounded-lg text-sm bg-green-900/30 text-green-400 border border-green-800">
          {successMessage}
        </div>
      )}

      <Card>
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-2xl font-bold text-white">{group.name}</h2>
            {group.description && (
              <p className="text-gray-400 mt-2">{group.description}</p>
            )}
            <p className="text-gray-500 text-sm mt-2">
              Created by {group.createdBy.name}
            </p>
          </div>
          <div className="flex gap-2">
            <Link to={`/expenses?groupId=${group.id}`}>
              <Button variant="primary">View Expenses</Button>
            </Link>
            <Link to={`/balances?groupId=${group.id}`}>
              <Button variant="secondary">Balances</Button>
            </Link>
            <Link to={`/events?groupId=${group.id}`}>
              <Button variant="secondary">Event Timeline</Button>
            </Link>
            {!isCreator && (
              <Button variant="danger" onClick={handleLeaveGroup}>
                Leave Group
              </Button>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-semibold text-white">
            Members ({group.members.length})
          </h3>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={loadHistory}>
              View History
            </Button>
            <Button variant="primary" onClick={() => setShowAddMember(!showAddMember)}>
              Add Member
            </Button>
          </div>
        </div>

        {showAddMember && (
          <div className="mb-4 p-4 bg-gray-800 rounded-lg border border-gray-700">
            <h4 className="text-white font-medium mb-3">Add Members</h4>
            {availableUsers.length === 0 ? (
              <p className="text-gray-400 text-sm">All users are already members</p>
            ) : (
              <div>
                <div className="max-h-48 overflow-y-auto space-y-1 mb-3 border border-gray-700 rounded p-2 bg-gray-900">
                  {availableUsers.map((user) => {
                    const checked = selectedUserIds.includes(user.id);
                    return (
                      <label
                        key={user.id}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-sm ${
                          checked ? 'bg-primary-900/40 text-white' : 'text-gray-300 hover:bg-gray-800'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setSelectedUserIds((prev) =>
                              checked ? prev.filter((id) => id !== user.id) : [...prev, user.id]
                            );
                          }}
                          className="rounded border-gray-600"
                        />
                        {user.name} <span className="text-gray-500">({user.email})</span>
                      </label>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">
                    {selectedUserIds.length} selected
                  </span>
                  <div className="flex gap-2">
                    <Button variant="primary" onClick={handleAddMembers} disabled={selectedUserIds.length === 0}>
                      Add Selected
                    </Button>
                    <Button variant="secondary" onClick={() => setShowAddMember(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="space-y-2">
          {group.members.map((member) => (
            <div
              key={member.id}
              className="flex justify-between items-center p-3 bg-gray-800 rounded-lg border border-gray-700"
            >
              <div>
                <p className="text-white font-medium">{member.user.name}</p>
                <p className="text-gray-400 text-sm">{member.user.email}</p>
              </div>
              <div className="flex items-center gap-3">
                {member.userId === group.createdById && (
                  <span className="text-xs bg-primary-900/30 text-primary-400 px-2 py-1 rounded border border-primary-800">
                    Creator
                  </span>
                )}
                {member.userId !== group.createdById && (
                  <Button
                    variant="danger"
                    onClick={() => handleRemoveMember(member.userId)}
                    className="text-sm py-1"
                  >
                    Remove
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {showHistory && (
        <Card>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-semibold text-white">Membership History</h3>
            <Button variant="secondary" onClick={() => setShowHistory(false)}>
              Hide
            </Button>
          </div>

          <div className="space-y-2">
            {history.map((record) => (
              <div
                key={record.id}
                className="p-3 bg-gray-800 rounded-lg border border-gray-700"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-white font-medium">{record.user.name}</p>
                    <p className="text-gray-400 text-sm">{record.user.email}</p>
                  </div>
                  <div className="text-right text-sm">
                    <p className="text-gray-400">
                      Joined: {formatDate(record.joinedAt)}
                    </p>
                    {record.leftAt && (
                      <p className="text-red-400">
                        Left: {formatDate(record.leftAt)}
                      </p>
                    )}
                    {!record.leftAt && (
                      <p className="text-green-400">Active</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
    </Layout>
  );
}
