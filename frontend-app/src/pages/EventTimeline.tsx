import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { expenseService } from '../services/expense.service';
import { groupService } from '../services/group.service';
import { Expense, Group } from '../types';
import { Layout } from '../components/Layout';
import { Card } from '../components/Card';
import { formatDate } from '../utils/date';

interface ParticipantState {
  name: string;
  totalPaid: number;
  totalOwed: number;
}

export function EventTimeline() {
  const [searchParams] = useSearchParams();
  const groupId = searchParams.get('groupId') ?? '';
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [group, setGroup] = useState<Group | null>(null);
  const [isLoading, setIsLoading] = useState(true);
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
      const sorted = [...expData.expenses].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );
      setExpenses(sorted);
      setGroup(grpData.group);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  };

  const allMemberNames = useMemo(() => {
    if (!group) return [];
    return group.members
      .filter((m) => !m.leftAt)
      .map((m) => m.user.name);
  }, [group]);

  const timeline = useMemo(() => {
    const balances: Record<string, ParticipantState> = {};

    for (const name of allMemberNames) {
      balances[name] = { name, totalPaid: 0, totalOwed: 0 };
    }

    return expenses.map((exp, idx) => {
      const totalAmount = Number(exp.totalAmount);
      const payerName = exp.paidBy.name;

      if (!balances[payerName]) {
        balances[payerName] = { name: payerName, totalPaid: 0, totalOwed: 0 };
      }
      balances[payerName].totalPaid += totalAmount;

      for (const p of exp.participants) {
        const name = p.user?.name ?? p.guestName ?? 'Guest';
        const amountOwed = Number(p.amountOwed);
        if (!balances[name]) {
          balances[name] = { name, totalPaid: 0, totalOwed: 0 };
        }
        balances[name].totalOwed += amountOwed;
      }

      const snapshots = Object.values(balances)
        .filter((b) => b.totalPaid !== 0 || b.totalOwed !== 0)
        .map((b) => ({
          name: b.name,
          totalPaid: b.totalPaid,
          totalOwed: b.totalOwed,
          net: b.totalPaid - b.totalOwed,
        }))
        .sort((a, b) => b.net - a.net);

      return {
        index: idx + 1,
        description: exp.description,
        date: exp.date,
        totalAmount,
        payerName,
        splitType: exp.splitType,
        participantDetails: exp.participants.map((p) => ({
          name: p.user?.name ?? p.guestName ?? 'Guest',
          amountOwed: Number(p.amountOwed),
        })),
        balances: snapshots,
      };
    });
  }, [expenses, allMemberNames]);

  if (!groupId) {
    return (
      <Layout>
        <p className="text-gray-400">No group selected. <Link to="/groups" className="text-primary-500">Go to groups</Link></p>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <Link to={`/groups/${groupId}`} className="text-primary-500 hover:text-primary-400 text-sm">
            ← {group?.name}
          </Link>
          <h2 className="text-2xl font-bold text-white mt-1">Event Timeline</h2>
          <p className="text-gray-500 text-sm mt-1">
            Running net balance after each event. Positive = others owe them. Negative = they owe others.
          </p>
        </div>

        {error && (
          <div className="p-3 rounded-lg text-sm bg-red-900/30 text-red-400 border border-red-800">{error}</div>
        )}

        {isLoading ? (
          <div className="flex justify-center items-center min-h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500" />
          </div>
        ) : timeline.length === 0 ? (
          <Card>
            <div className="text-center py-8">
              <p className="text-gray-400">No expenses yet</p>
            </div>
          </Card>
        ) : (
          <div className="space-y-2">
            {timeline.map((event) => (
              <Card key={event.index}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 bg-gray-800 text-gray-400 rounded border border-gray-700">
                      #{event.index}
                    </span>
                    <p className="text-white font-medium">{event.description}</p>
                  </div>
                  <p className="text-gray-400 text-sm">{formatDate(event.date)}</p>
                </div>

                <div className="text-sm text-gray-400 mb-2">
                  Paid by <span className="text-white">{event.payerName}</span> · ₹{event.totalAmount.toFixed(2)} · {event.participantDetails.length} participants
                </div>

                <details className="group">
                  <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-300">
                    Show per-participant details for this event
                  </summary>
                  <div className="mt-2 mb-3 pl-2 border-l-2 border-gray-700 space-y-1">
                    {event.participantDetails.map((pd) => (
                      <div key={pd.name} className="text-xs text-gray-400 flex justify-between">
                        <span>{pd.name}</span>
                        <span className="font-mono">₹{pd.amountOwed.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </details>

                <div className="bg-gray-850 rounded border border-gray-700 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-500 border-b border-gray-700">
                        <th className="text-left py-1.5 px-2">Participant</th>
                        <th className="text-right py-1.5 px-2">Total Paid</th>
                        <th className="text-right py-1.5 px-2">Total Owed</th>
                        <th className="text-right py-1.5 px-2">Net Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {event.balances.map((b) => (
                        <tr key={b.name} className="border-b border-gray-800/30">
                          <td className="py-1 px-2 text-white">{b.name}</td>
                          <td className="py-1 px-2 text-right text-gray-300 font-mono">₹{b.totalPaid.toFixed(2)}</td>
                          <td className="py-1 px-2 text-right text-gray-300 font-mono">₹{b.totalOwed.toFixed(2)}</td>
                          <td className={`py-1 px-2 text-right font-mono font-medium ${
                            b.net >= 0 ? 'text-green-400' : 'text-red-400'
                          }`}>
                            {b.net >= 0 ? '+' : ''}₹{b.net.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
