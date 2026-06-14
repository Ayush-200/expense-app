import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { groupService } from '../services/group.service';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Layout } from '../components/Layout';

export function CreateGroup() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    description: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      await groupService.createGroup(formData);
      navigate('/groups');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create group');
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  return (
    <Layout>
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <Link to="/groups" className="text-primary-500 hover:text-primary-400 text-sm">
          ← Back to Groups
        </Link>
      </div>

      <Card>
        <h2 className="text-2xl font-bold text-white mb-6">Create New Group</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Group Name"
            name="name"
            type="text"
            required
            value={formData.name}
            onChange={handleChange}
            placeholder="e.g., Trip to Goa, Apartment Rent"
          />

          <div className="w-full">
            <label htmlFor="description" className="block text-sm font-medium text-gray-300 mb-1">
              Description (Optional)
            </label>
            <textarea
              id="description"
              name="description"
              rows={4}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-white"
              value={formData.description}
              onChange={handleChange}
              placeholder="What is this group for?"
            />
          </div>

          {error && (
            <div className="p-3 rounded-lg text-sm bg-red-900/30 text-red-400 border border-red-800">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <Button type="submit" variant="primary" isLoading={isLoading} className="flex-1">
              Create Group
            </Button>
            <Link to="/groups" className="flex-1">
              <Button type="button" variant="secondary" className="w-full">
                Cancel
              </Button>
            </Link>
          </div>
        </form>
      </Card>
    </div>
    </Layout>
  );
}
