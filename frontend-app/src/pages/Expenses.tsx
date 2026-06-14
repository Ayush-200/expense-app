import { useState, useEffect } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { expenseService } from '../services/expense.service';
import { groupService } from '../services/group.service';
import { useAuth } from '../context/AuthContext';
import { Expense, Group } from '../types';
import { Layout } from '../components/Layout';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { ExpenseForm } from '../components/ExpenseForm';
import { ImportExpensesModal } from '../components/ImportExpensesModal';
import { CreateExpenseData } from '../types';

const SPLIT_LABELS: Record<string, string> = {
  EQUAL: 'Equal',
  EXACT: 'Exact',
  PERCENTAGE: '%',
  SHARE: 'Shares',
};

export function Expenses() {
  const [searchParams] = useSearchParams();
  const groupId = searchParams.get('groupId') ?? '';
  const navigate = useNavigate();
  const { user } = useAuth();

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [group, setGroup] = useState<Group | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!groupId) return;
    loadAll();
  }, [groupId]);

  const loadAll = async () => {
    try {
      const [expData, grpData] = await Promise.all([
        expenseService.getExpenses(groupId),
        groupService.getGroup(groupId),
      ]);
      setExpenses(expData.expenses);
      setGroup(grpData.group);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load expenses');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async (data: CreateExpenseData) => {
    setSubmitting(true);
    try {
      await expenseService.createExpense(data);
      setShowForm(false);
      await loadAll();
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this expense?')) return;
    try {
      await expenseService.deleteExpense(id);
      setExpenses((prev) => prev.filter((e) => e.id !== id));
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete expense');
    }
  };

  if (!groupId) {
    return (
      <Layout>
        <p className="text-gray-400">No group selected. <Link to="/groups" className="text-primary-500">Go to groups</Link></p>
      </Layout>
    );
  }

  if (isLoading) {
    return (
      <Layout>
        <div className="flex justify-center items-center min-h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500" />
        </div>
      </Layout>
    );
  }

  const members = group?.members.map((m) => m.user) ?? [];

  return (
    <Layout>
      {showImport && (
        <ImportExpensesModal
          groupId={groupId}
          onClose={() => setShowImport(false)}
          onSuccess={() => {
            setShowImport(false);
            loadAll();
          }}
        />
      )}

      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <Link to={`/groups/${groupId}`} className="text-primary-500 hover:text-primary-400 text-sm">
              ← {group?.name}
            </Link>
            <h2 className="text-2xl font-bold text-white mt-1">Expenses</h2>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowImport(true)}
              className="px-3 py-2 text-sm text-gray-300 hover:text-white border border-gray-600 rounded-lg hover:border-gray-500"
            >
              📥 Import CSV
            </button>
            <Link to={`/balances?groupId=${groupId}`}>
              <Button variant="secondary">Balances</Button>
            </Link>
            <Button variant="primary" onClick={() => setShowForm(true)}>
              Add Expense
            </Button>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-lg text-sm bg-red-900/30 text-red-400 border border-red-800">{error}</div>
        )}

        {showForm && (
          <Card>
            <h3 className="text-xl font-semibold text-white mb-4">New Expense</h3>
            <ExpenseForm
              groupId={groupId}
              groupMembers={members}
              onSubmit={handleCreate}
              onCancel={() => setShowForm(false)}
              isLoading={submitting}
            />
          </Card>
        )}

        {expenses.length === 0 && !showForm ? (
          <Card>
            <div className="text-center py-8">
              <p className="text-gray-400 mb-4">No expenses yet</p>
              <Button variant="primary" onClick={() => setShowForm(true)}>
                Add First Expense
              </Button>
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            {expenses.map((expense) => (
              <Card key={expense.id} className="flex items-center justify-between gap-4">
                <div
                  className="flex-1 cursor-pointer"
                  onClick={() => navigate(`/expenses/${expense.id}?groupId=${groupId}`)}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs px-2 py-0.5 bg-gray-800 text-gray-400 rounded border border-gray-700">
                      {SPLIT_LABELS[expense.splitType]}
                    </span>
                    <p className="text-white font-medium">{expense.description}</p>
                  </div>
                  <p className="text-gray-400 text-sm mt-1">
                    Paid by {expense.paidBy.name} · {new Date(expense.date).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-white font-semibold text-lg">₹{Number(expense.totalAmount).toFixed(2)}</p>
                  <p className="text-gray-500 text-xs">{expense.participants.length} participants</p>
                </div>
                {expense.paidById === user?.id && (
                  <button
                    onClick={() => handleDelete(expense.id)}
                    className="text-red-500 hover:text-red-400 text-lg leading-none ml-2"
                    title="Delete expense"
                  >
                    ×
                  </button>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
