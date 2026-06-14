import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Card } from '../components/Card';
import { Button } from '../components/Button';

export function Dashboard() {
  const { user } = useAuth();

  return (
    <Layout>
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-white">Welcome back, {user?.name}!</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <h3 className="text-lg font-semibold text-white mb-2">Your Account</h3>
            <div className="space-y-2 mb-4">
              <p className="text-gray-300">
                <span className="text-gray-500">Name:</span> {user?.name}
              </p>
              <p className="text-gray-300">
                <span className="text-gray-500">Email:</span> {user?.email}
              </p>
            </div>
          </Card>

          <Card>
            <h3 className="text-lg font-semibold text-white mb-2">Quick Actions</h3>
            <div className="flex flex-col gap-3">
              <Link to="/groups">
                <Button variant="primary" className="w-full">View Your Groups</Button>
              </Link>
              <Link to="/groups/create">
                <Button variant="secondary" className="w-full">Create New Group</Button>
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
