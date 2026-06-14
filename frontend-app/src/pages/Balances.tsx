import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { settlementService, BalanceEntry, Settlement } from '../services/settlement.service';
import { groupService } from '../services/group.service';
import { useAuth } from '../context/AuthContext';
import { Group } from '../types';
import { Layout } from '../components/Layout';
import { Card } from '../components/Card';

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

  useEffect(() => {
    if (!groupId) return;
    loadAll();
  }, [groupId]);

  const loadAll = async () => {
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

  // Split balances into owed-to-me, i-owe, settled
  const myBalance = balances.find((b) => b.userId === user?.id);
  const othersBalance = balances.filter((b) => b.userId !== user?.id);

  return (
    <Layout>
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

        {/* Summary card */}
        <Card>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-gray-500 text-sm">Total Expenses</p>
              <p className="text-white text-2xl font-bold">₹{totalExpenses.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-gray-500 text-sm">You Paid</p>
              <p className="text-white text-2xl font-bold">₹{(myBalance?.paid ?? 0).toFixed(2)}</p>
            </div>
            <div>
              <p className="text-gray-500 text-sm">Your Share</p>
              <p className="text-white text-2xl font-bold">₹{(myBalance?.owes ?? 0).toFixed(2)}</p>
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
                  Paid ₹{myBalance.paid.toFixed(2)} · Owe ₹{myBalance.owes.toFixed(2)}
                </p>
              </div>
              <div className="text-right">
                {myBalance.net > 0 ? (
                  <p className="text-green-400 font-bold text-xl">+₹{myBalance.net.toFixed(2)}</p>
                ) : myBalance.net < 0 ? (
                  <p className="text-red-400 font-bold text-xl">-₹{Math.abs(myBalance.net).toFixed(2)}</p>
                ) : (
                  <p className="text-gray-400 font-bold text-xl">Settled up</p>
                )}
                <p className="text-gray-500 text-xs">
                  {myBalance.net > 0 ? 'you are owed' : myBalance.net < 0 ? 'you owe' : ''}
                </p>
              </div>
            </div>
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
                      Paid ₹{b.paid.toFixed(2)} · Owes ₹{b.owes.toFixed(2)}
                    </p>
                  </div>
                  <div className="text-right">
                    {b.net > 0 ? (
                      <p className="text-green-400 font-semibold">+₹{b.net.toFixed(2)}</p>
                    ) : b.net < 0 ? (
                      <p className="text-red-400 font-semibold">-₹{Math.abs(b.net).toFixed(2)}</p>
                    ) : (
                      <p className="text-gray-400 font-semibold">₹0.00</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Settlements — minimal transactions to clear all debts */}
        <Card>
          <h3 className="text-lg font-semibold text-white mb-1">Suggested Settlements</h3>
          <p className="text-gray-500 text-sm mb-4">
            Minimum transactions to settle all debts
          </p>

          {settlements.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-green-400 font-semibold text-lg">All settled up! 🎉</p>
              <p className="text-gray-500 text-sm mt-1">No outstanding balances</p>
            </div>
          ) : (
            <div className="space-y-2">
              {settlements.map((s, i) => {
                const isInvolvedAsFrom = s.fromUserId === user?.id;
                const isInvolvedAsTo = s.toUserId === user?.id;

                return (
                  <div
                    key={i}
                    className={`flex items-center gap-3 p-3 rounded-lg border ${
                      isInvolvedAsFrom
                        ? 'bg-red-900/20 border-red-800'
                        : isInvolvedAsTo
                        ? 'bg-green-900/20 border-green-800'
                        : 'bg-gray-800 border-gray-700'
                    }`}
                  >
                    {/* From */}
                    <div className="flex-1 text-right">
                      <p
                        className={`font-medium ${
                          isInvolvedAsFrom ? 'text-red-300' : 'text-white'
                        }`}
                      >
                        {isInvolvedAsFrom ? 'You' : s.fromName}
                      </p>
                    </div>

                    {/* Arrow + amount */}
                    <div className="flex flex-col items-center px-2">
                      <span className="text-gray-500 text-xs mb-0.5">pays</span>
                      <div className="flex items-center gap-1">
                        <span className="text-gray-600">→</span>
                      </div>
                      <span
                        className={`font-bold text-sm ${
                          isInvolvedAsFrom
                            ? 'text-red-400'
                            : isInvolvedAsTo
                            ? 'text-green-400'
                            : 'text-white'
                        }`}
                      >
                        ₹{s.amount.toFixed(2)}
                      </span>
                    </div>

                    {/* To */}
                    <div className="flex-1">
                      <p
                        className={`font-medium ${
                          isInvolvedAsTo ? 'text-green-300' : 'text-white'
                        }`}
                      >
                        {isInvolvedAsTo ? 'You' : s.toName}
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
