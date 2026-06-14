import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  settlementService,
  BalanceEntry,
  Settlement,
  ExpenseContribution,
} from '../services/settlement.service';
import { groupService } from '../services/group.service';
import { useAuth } from '../context/AuthContext';
import { Group } from '../types';
import { Layout } from '../components/Layout';
import { Card } from '../components/Card';

// ── helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `₹${Math.abs(n).toFixed(2)}`;
}

// ── Expense breakdown modal (Rohan's requirement) ──────────────────────────────

function ContributionBreakdown({
  entry,
  onClose,
}: {
  entry: BalanceEntry;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-gray-900 border-b border-gray-700 px-5 py-4 flex justify-between items-center">
          <div>
            <p className="text-white font-semibold">{entry.name}</p>
            <p className="text-gray-400 text-sm">Expense breakdown</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="p-5 space-y-3">
          {entry.contributions.length === 0 ? (
            <p className="text-gray-500 text-sm">No expenses found.</p>
          ) : (
            entry.contributions.map((c: ExpenseContribution) => (
              <div
                key={c.expenseId}
                className="bg-gray-800 border border-gray-700 rounded-lg p-3"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-white text-sm font-medium">{c.description}</p>
                    <p className="text-gray-500 text-xs mt-0.5">
                      {new Date(c.date).toLocaleDateString()} ·{' '}
                      <span className="uppercase">{c.splitType}</span> split ·{' '}
                      total {fmt(c.totalAmount)}
                    </p>
                  </div>
                  <span
                    className={`text-sm font-bold ml-2 ${
                      c.net > 0
                        ? 'text-green-400'
                        : c.net < 0
                        ? 'text-red-400'
                        : 'text-gray-400'
                    }`}
                  >
                    {c.net > 0 ? '+' : ''}{c.net.toFixed(2)}
                  </span>
                </div>
                <div className="mt-2 flex gap-4 text-xs text-gray-400">
                  {c.paidAmount > 0 && <span>Paid {fmt(c.paidAmount)}</span>}
                  {c.owedAmount > 0 && <span>Share {fmt(c.owedAmount)}</span>}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Summary row */}
        <div className="sticky bottom-0 bg-gray-900 border-t border-gray-700 px-5 py-3 flex justify-between text-sm">
          <span className="text-gray-400">Net balance</span>
          <span
            className={`font-bold ${
              entry.net > 0
                ? 'text-green-400'
                : entry.net < 0
                ? 'text-red-400'
                : 'text-gray-400'
            }`}
          >
            {entry.net >= 0 ? '+' : ''}{entry.net.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export function Balances() {
  const [searchParams] = useSearchParams();
  const groupId = searchParams.get('groupId') ?? '';
  const { user } = useAuth();

  const [balances, setBalances] = useState<BalanceEntry[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [group, setGroup] = useState<Group | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [breakdown, setBreakdown] = useState<BalanceEntry | null>(null);

  useEffect(() => {
    if (!groupId) return;
    loadAll();
  }, [groupId]);

  const loadAll = async () => {
    setIsLoading(true);
    setError('');
    try {
      const [balData, grpData] = await Promise.all([
        settlementService.getGroupBalances(groupId),
        groupService.getGroup(groupId),
      ]);
      setBalances(balData.balances);
      setSettlements(balData.settlements);
      setTotalExpenses(balData.totalExpenses);
      setGroup(grpData.group);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load balances');
    } finally {
      setIsLoading(false);
    }
  };

  if (!groupId) {
    return (
      <Layout>
        <p className="text-gray-400">
          No group selected.{' '}
          <Link to="/groups" className="text-primary-500">Go to groups</Link>
        </p>
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

  const myBalance = balances.find((b) => b.userId === user?.id);
  const othersBalance = balances.filter((b) => b.userId !== user?.id);

  return (
    <Layout>
      {breakdown && (
        <ContributionBreakdown entry={breakdown} onClose={() => setBreakdown(null)} />
      )}

      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <Link
              to={`/groups/${groupId}`}
              className="text-primary-500 hover:text-primary-400 text-sm"
            >
              ← {group?.name}
            </Link>
            <h2 className="text-2xl font-bold text-white mt-1">Balances</h2>
          </div>
          <Link
            to={`/expenses?groupId=${groupId}`}
            className="text-sm text-primary-500 hover:text-primary-400"
          >
            View Expenses →
          </Link>
        </div>

        {error && (
          <div className="p-3 rounded-lg text-sm bg-red-900/30 text-red-400 border border-red-800">
            {error}
          </div>
        )}

        {/* Summary */}
        <Card>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-gray-500 text-sm">Total Expenses</p>
              <p className="text-white text-2xl font-bold">{fmt(totalExpenses)}</p>
            </div>
            <div>
              <p className="text-gray-500 text-sm">You Paid</p>
              <p className="text-white text-2xl font-bold">{fmt(myBalance?.paid ?? 0)}</p>
            </div>
            <div>
              <p className="text-gray-500 text-sm">Your Share</p>
              <p className="text-white text-2xl font-bold">{fmt(myBalance?.owes ?? 0)}</p>
            </div>
          </div>
        </Card>

        {/* My balance */}
        {myBalance && (
          <Card>
            <h3 className="text-lg font-semibold text-white mb-3">Your Balance</h3>
            <div
              className={`flex items-center justify-between p-4 rounded-lg border ${
                myBalance.net > 0
                  ? 'bg-green-900/20 border-green-800'
                  : myBalance.net < 0
                  ? 'bg-red-900/20 border-red-800'
                  : 'bg-gray-800 border-gray-700'
              }`}
            >
              <div>
                <p className="text-white font-semibold">{myBalance.name} (You)</p>
                <p className="text-gray-400 text-sm">
                  Paid {fmt(myBalance.paid)} · Owe {fmt(myBalance.owes)}
                </p>
              </div>
              <div className="text-right">
                {myBalance.net > 0 ? (
                  <p className="text-green-400 font-bold text-xl">+{fmt(myBalance.net)}</p>
                ) : myBalance.net < 0 ? (
                  <p className="text-red-400 font-bold text-xl">-{fmt(myBalance.net)}</p>
                ) : (
                  <p className="text-gray-400 font-bold text-xl">Settled up</p>
                )}
                <p className="text-gray-500 text-xs">
                  {myBalance.net > 0 ? 'you are owed' : myBalance.net < 0 ? 'you owe' : ''}
                </p>
              </div>
            </div>
            {myBalance.contributions.length > 0 && (
              <button
                onClick={() => setBreakdown(myBalance)}
                className="mt-3 text-xs text-primary-400 hover:text-primary-300 underline"
              >
                See expense breakdown ({myBalance.contributions.length} expenses) →
              </button>
            )}
          </Card>
        )}

        {/* All member balances */}
        {othersBalance.length > 0 && (
          <Card>
            <h3 className="text-lg font-semibold text-white mb-3">All Balances</h3>
            <div className="space-y-2">
              {othersBalance.map((b, i) => (
                <div
                  key={b.userId ?? `guest-${i}`}
                  className="flex items-center justify-between p-3 bg-gray-800 rounded-lg border border-gray-700"
                >
                  <div>
                    <p className="text-white font-medium">
                      {b.name}
                      {!b.userId && (
                        <span className="ml-2 text-xs text-gray-500 bg-gray-700 px-1.5 py-0.5 rounded">
                          Guest
                        </span>
                      )}
                    </p>
                    <p className="text-gray-500 text-xs">
                      Paid {fmt(b.paid)} · Owes {fmt(b.owes)}
                    </p>
                    {b.contributions.length > 0 && (
                      <button
                        onClick={() => setBreakdown(b)}
                        className="text-xs text-primary-400 hover:text-primary-300 underline mt-0.5"
                      >
                        Why? ({b.contributions.length} expenses)
                      </button>
                    )}
                  </div>
                  <div className="text-right">
                    {b.net > 0 ? (
                      <p className="text-green-400 font-semibold">+{fmt(b.net)}</p>
                    ) : b.net < 0 ? (
                      <p className="text-red-400 font-semibold">-{fmt(b.net)}</p>
                    ) : (
                      <p className="text-gray-400 font-semibold">₹0.00</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Simplified settlements — Aisha's view */}
        <Card>
          <h3 className="text-lg font-semibold text-white mb-1">Settlements</h3>
          <p className="text-gray-500 text-sm mb-4">
            Minimum transactions to clear all debts
          </p>

          {settlements.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-green-400 font-semibold text-lg">All settled up 🎉</p>
              <p className="text-gray-500 text-sm mt-1">No outstanding balances</p>
            </div>
          ) : (
            <div className="space-y-2">
              {settlements.map((s, i) => {
                const isFrom = s.fromUserId === user?.id;
                const isTo = s.toUserId === user?.id;

                return (
                  <div
                    key={i}
                    className={`flex items-center gap-3 p-3 rounded-lg border ${
                      isFrom
                        ? 'bg-red-900/20 border-red-800'
                        : isTo
                        ? 'bg-green-900/20 border-green-800'
                        : 'bg-gray-800 border-gray-700'
                    }`}
                  >
                    {/* Payer */}
                    <div className="flex-1 text-right">
                      <p className={`font-medium ${isFrom ? 'text-red-300' : 'text-white'}`}>
                        {isFrom ? 'You' : s.fromName}
                        {s.fromGuestName && (
                          <span className="ml-1 text-xs text-gray-500">(guest)</span>
                        )}
                      </p>
                    </div>

                    {/* Arrow + amount */}
                    <div className="flex flex-col items-center px-2 min-w-[80px]">
                      <span className="text-gray-500 text-xs">pays</span>
                      <span
                        className={`font-bold text-sm ${
                          isFrom ? 'text-red-400' : isTo ? 'text-green-400' : 'text-white'
                        }`}
                      >
                        {fmt(s.amount)}
                      </span>
                      <span className="text-gray-600 text-lg leading-none">→</span>
                    </div>

                    {/* Receiver */}
                    <div className="flex-1">
                      <p className={`font-medium ${isTo ? 'text-green-300' : 'text-white'}`}>
                        {isTo ? 'You' : s.toName}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </Layout>
  );
}
