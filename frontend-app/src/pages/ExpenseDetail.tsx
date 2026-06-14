import { useState, useEffect } from 'react';
import { useParams, useSearchParams, Link, useNavigate } from 'react-router-dom';
import { expenseService } from '../services/expense.service';
import { groupService } from '../services/group.service';
import { useAuth } from '../context/AuthContext';
import { Expense, Group, CreateExpenseData } from '../types';
import { Layout } from '../components/Layout';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { ExpenseForm } from '../components/ExpenseForm';

const SPLIT_LABELS: Record<string, string> = {
  EQUAL: 'Equal Split',
  EXACT: 'Exact Amounts',
  PERCENTAGE: 'Percentage Split',
  SHARE: 'Share-based Split',
};

export function ExpenseDetail() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const groupId = searchParams.get('groupId') ?? '';
  const navigate = useNavigate();
  const { user } = useAuth();

  const [expense, setExpense] = useState<Expense | null>(null);
  const [group, setGroup] = useState<Group | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (id) loadExpense();
  }, [id]);

  useEffect(() => {
    if (groupId) loadGroup();
  }, [groupId]);

  const loadExpense = async () => {
    try {
      const data = await expenseService.getExpense(id!);
      setExpense(data.expense);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load expense');
    } finally {
      setIsLoading(false);
    }
  };

  const loadGroup = async () => {
    try {
      const data = await groupService.getGroup(groupId);
      setGroup(data.group);
    } catch (err) {
      console.error('Failed to load group');
    }
  };

  const handleUpdate = async (data: CreateExpenseData) => {
    setSubmitting(true);
    try {
      const updated = await expenseService.updateExpense(id!, data);
      setExpense(updated.expense);
      setIsEditing(false);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update expense');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this expense?')) return;
    try {
      await expenseService.deleteExpense(id!);
      navigate(`/expenses?groupId=${groupId}`);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete expense');
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex justify-center items-center min-h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500" />
        </div>
      </Layout>
    );
  }

  if (!expense) {
    return (
      <Layout>
        <Card>
          <p className="text-red-400">Expense not found</p>
        </Card>
      </Layout>
    );
  }

  const isPayer = expense.paidById === user?.id;
  const members = group?.members.map((m) => m.user) ?? [];

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <Link
              to={`/expenses?groupId=${groupId}`}
              className="text-primary-500 hover:text-primary-400 text-sm"
            >
              ← Back to Expenses
            </Link>
            <h2 className="text-2xl font-bold text-white mt-1">Expense Details</h2>
          </div>
          {isPayer && !isEditing && (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setIsEditing(true)}>
                Edit
              </Button>
              <Button variant="danger" onClick={handleDelete}>
                Delete
              </Button>
            </div>
          )}
        </div>

        {error && (
          <div className="p-3 rounded-lg text-sm bg-red-900/30 text-red-400 border border-red-800">
            {error}
          </div>
        )}

        {isEditing ? (
          <Card>
            <h3 className="text-xl font-semibold text-white mb-4">Edit Expense</h3>
            <ExpenseForm
              groupId={groupId}
              groupMembers={members}
              initialData={expense}
              onSubmit={handleUpdate}
              onCancel={() => setIsEditing(false)}
              isLoading={submitting}
            />
          </Card>
        ) : (
          <>
            <Card>
              <div className="space-y-4">
                <div>
                  <h3 className="text-2xl font-bold text-white">{expense.description}</h3>
                  <p className="text-gray-400 text-sm mt-1">
                    {new Date(expense.date).toLocaleDateString('en-IN', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-800">
                  <div>
                    <p className="text-gray-500 text-sm">Total Amount</p>
                    <p className="text-white text-2xl font-semibold">
                      ₹{Number(expense.totalAmount).toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-sm">Split Type</p>
                    <p className="text-white font-medium">{SPLIT_LABELS[expense.splitType]}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-sm">Paid By</p>
                    <p className="text-white font-medium">{expense.paidBy.name}</p>
                    <p className="text-gray-400 text-xs">{expense.paidBy.email}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-sm">Group</p>
                    <Link
                      to={`/groups/${expense.groupId}`}
                      className="text-primary-500 hover:text-primary-400 font-medium"
                    >
                      {expense.group.name}
                    </Link>
                  </div>
                </div>
              </div>
            </Card>

            <Card>
              <h3 className="text-xl font-semibold text-white mb-4">
                Split Details ({expense.participants.length} participants)
              </h3>

              <div className="space-y-2">
                {expense.participants.map((p) => {
                  const displayName = p.user?.name ?? p.guestName ?? 'Guest';
                  const displayEmail = p.user?.email ?? p.guestEmail ?? '';
                  const isGuest = !p.userId;

                  return (
                    <div
                      key={p.id}
                      className="flex items-center justify-between p-3 bg-gray-800 rounded-lg border border-gray-700"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-white font-medium">{displayName}</p>
                          {isGuest && (
                            <span className="text-xs px-2 py-0.5 bg-gray-700 text-gray-400 rounded">
                              Guest
                            </span>
                          )}
                        </div>
                        {displayEmail && (
                          <p className="text-gray-400 text-sm">{displayEmail}</p>
                        )}
                      </div>

                      <div className="text-right">
                        <p className="text-white font-semibold text-lg">
                          ₹{Number(p.amountOwed).toFixed(2)}
                        </p>
                        {expense.splitType === 'PERCENTAGE' && p.splitMetadata?.percentage && (
                          <p className="text-gray-500 text-xs">{p.splitMetadata.percentage}%</p>
                        )}
                        {expense.splitType === 'SHARE' && p.splitMetadata?.shares && (
                          <p className="text-gray-500 text-xs">
                            {p.splitMetadata.shares} share{Number(p.splitMetadata.shares) !== 1 ? 's' : ''}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Show balance summary */}
              <div className="mt-6 pt-4 border-t border-gray-800">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Total</span>
                  <span className="text-white font-semibold text-lg">
                    ₹{expense.participants
                      .reduce((sum, p) => sum + Number(p.amountOwed), 0)
                      .toFixed(2)}
                  </span>
                </div>
              </div>
            </Card>
          </>
        )}
      </div>
    </Layout>
  );
}
