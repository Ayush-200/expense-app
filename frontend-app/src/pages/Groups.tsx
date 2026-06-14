import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { groupService } from '../services/group.service';
import { Group } from '../types';
import { Layout } from '../components/Layout';
import { Card } from '../components/Card';
import { Button } from '../components/Button';

export function Groups() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadGroups();
  }, []);

  const loadGroups = async () => {
    try {
      const data = await groupService.getGroups();
      setGroups(data.groups);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load groups');
    } finally {
      setIsLoading(false);
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

  return (
    <Layout>
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-white">Your Groups</h2>
        <Link to="/groups/create">
          <Button variant="primary">Create Group</Button>
        </Link>
      </div>

      {error && (
        <div className="p-3 rounded-lg text-sm bg-red-900/30 text-red-400 border border-red-800">
          {error}
        </div>
      )}

      {groups.length === 0 ? (
        <Card>
          <div className="text-center py-8">
            <p className="text-gray-400 mb-4">You haven't joined any groups yet</p>
            <Link to="/groups/create">
              <Button variant="primary">Create Your First Group</Button>
            </Link>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.map((group) => (
            <Link key={group.id} to={`/groups/${group.id}`}>
              <Card className="hover:border-primary-500 transition-colors cursor-pointer h-full">
                <h3 className="text-xl font-semibold text-white mb-2">{group.name}</h3>
                {group.description && (
                  <p className="text-gray-400 text-sm mb-4 line-clamp-2">{group.description}</p>
                )}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">
                    {group._count?.members || group.members.length} members
                  </span>
                  <span className="text-gray-500">
                    by {group.createdBy.name}
                  </span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
    </Layout>
  );
}
