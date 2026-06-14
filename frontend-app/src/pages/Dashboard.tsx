import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/Card';
import { Button } from '../components/Button';

export function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-black">
      <nav className="bg-gray-900 shadow-lg border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-xl font-bold text-white">Splitwise Clone</h1>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-300">
                Welcome, {user?.name}!
              </span>
              <Button variant="secondary" onClick={handleLogout}>
                Logout
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <Card>
            <h2 className="text-2xl font-bold text-white mb-4">Dashboard</h2>
            <div className="space-y-4">
              <div>
                <p className="text-gray-300">
                  <span className="font-medium text-white">Name:</span> {user?.name}
                </p>
                <p className="text-gray-300">
                  <span className="font-medium text-white">Email:</span> {user?.email}
                </p>
                <p className="text-gray-300">
                  <span className="font-medium text-white">User ID:</span> {user?.id}
                </p>
              </div>

              <div className="pt-4 border-t border-gray-800">
                <p className="text-gray-300">
                  This is a protected route. Only authenticated users can see this page.
                </p>
                <p className="text-gray-400 text-sm mt-2">
                  Groups and expenses features will be implemented in the next phase.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}
