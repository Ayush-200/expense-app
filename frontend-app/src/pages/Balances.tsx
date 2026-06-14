import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  settlementService,
  BalanceEntry,
  Settlement,
  ExpenseContribution,
  SettlementContribution,
  SettlementRecord,
} from '../services/settlement.service';
import { groupService } from '../services/group.service';
import { useAuth } from '../context/AuthContext';
import { Group } from '../types';
import { Layout } from '../components/Layout';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';

// ── helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `₹${Math.abs(n).toFixed(2)}`;
}

// ── Expense & settlement breakdown modal ───────────────────────────────────────

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
            <p className="text-gray-400 text-sm">Transaction breakdown</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Expenses */}
          {entry.contributions.length > 0 && (
            <div>
              <h4 className="text-white text-sm font-semibold mb-2">Expenses</h4>
              <div className="space-y-2">
                {entry.contributions.map((c: ExpenseContribution) => (
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
                ))}
              </div>
            </div>
          )}

          {/* Settlements */}
          {entry.settlementContributions.length > 0 && (
            <div>
              <h4 className="text-white text-sm font-semibold mb-2">Settlements</h4>
              <div className="space-y-2">
                {entry.settlementContributions.map((s: SettlementContribution) => (
                  <div
                    key={s.settlementId}
                    className="bg-gray-800 border border-gray-700 rounded-lg p-3"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-white text-sm">
                          {s.fromUserName} → {s.toUserName}
                        </p>
                        <p className="text-gray-500 text-xs mt-0.5">
                          {new Date(s.date).toLocaleDateString()}
                          {s.note && ` · ${s.note}`}
                        </p>
                      </div>
                      <span
                        className={`text-sm font-bold ml-2 ${
                          s.net > 0 ? 'text-green-400' : 'text-red-400'
                        }`}
                      >
                        {s.net > 0 ? '+' : ''}{fmt(s.net)}
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-gray-400">
                      {s.fromUserName} paid {s.toUserName}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {entry.contributions.length === 0 && entry.settlementContributions.length === 0 && (
            <p className="text-gray-500 text-sm">No transactions found.</p>
          )}
        </div>

        {/* Summary */}
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

// ── Record settlement modal ────────────────────────────────────────────────────

function RecordSettlementModal({
  groupId,
  balances,
  currentUserId,
  onClose,
  onSuccess,
}: {
  groupId: string;
  balances: BalanceEntry[];
  currentUserId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [toUserId, setToUserId] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const eligibleRecipients = balances.filter(
    (b) => b.userId && b.userId !== currentUserId
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!toUserId || !amount) return;

    setIsSubmitting(true);
    setError('');
    try {
      await settlementService.createSettlement(groupId, {
        toUserId,
        amount: parseFloat(amount),
        note: note || undefined,
      });
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to record settlement');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-gray-700 px-5 py-4 flex justify-between items-center">
          <h3 className="text-white font-semibold">Record Settlement</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white text-xl leading-none"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 rounded-lg text-sm bg-red-900/30 text-red-400 border border-red-800">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm text-gray-400 mb-1">Pay to</label>
            <select
              value={toUserId}
              onChange={(e) => setToUserId(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-white rounded-lg focus:border-primary-500 focus:outline-none"
              required
            >
              <option value="">Select a member</option>
              {eligibleRecipients.map((b) => (
                <option key={b.userId} value={b.userId}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <Input
            type="number"
            step="0.01"
            min="0.01"
            label="Amount (₹)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />

          <Input
            type="text"
            label="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Cash payment"
          />

          <div className="flex gap-3">
            <Button type="button" onClick={onClose} className="flex-1 bg-gray-700">
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="flex-1">
              {isSubmitting ? 'Recording...' : 'Record'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Settlement history modal ───────────────────────────────────────────────────

function SettlementHistoryModal({
  groupId,
  currentUserId,
  onClose,
  onDelete,
}: {
  groupId: string;
  currentUserId: string;
  onClose: () => void;
  onDelete: () => void;
}) {
  const [settlements, setSettlements] = useState<SettlementRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const data = await settlementService.getSettlementHistory(groupId);
      setSettlements(data.settlements);
    } catch (err) {
      console.error('Failed to load settlement history', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (settlementId: string) => {
    if (!confirm('Delete this settlement record?')) return;
    try {
      await settlementService.deleteSettlement(settlementId);
      setSettlements(settlements.filter((s) => s.id !== settlementId));
      onDelete();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to delete settlement');
    }
  };

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
          <h3 className="text-white font-semibold">Settlement History</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="p-5">
          {isLoading ? (
            <p className="text-gray-400 text-sm">Loading...</p>
          ) : settlements.length === 0 ? (
            <p className="text-gray-400 text-sm">No settlements recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {settlements.map((s) => {
                const isFrom = s.fromUserId === currentUserId;
                const isTo = s.toUserId === currentUserId;

                return (
                  <div
                    key={s.id}
                    className={`p-3 rounded-lg border ${
                      isFrom
                        ? 'bg-red-900/10 border-red-800'
                        : isTo
                        ? 'bg-green-900/10 border-green-800'
                        : 'bg-gray-800 border-gray-700'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-white text-sm">
                          {isFrom ? 'You' : s.fromUser.name} paid{' '}
                          {isTo ? 'you' : s.toUser.name}
                        </p>
                        <p className="text-gray-500 text-xs mt-0.5">
                          {new Date(s.date).toLocaleDateString()}
                          {s.note && ` · ${s.note}`}
                        </p>
                      </div>
                      <div className="text-right">
                        <p
                          className={`font-semibold ${
                            isFrom ? 'text-red-400' : isTo ? 'text-green-400' : 'text-white'
                          }`}
                        >
                          {fmt(parseFloat(s.amount))}
                        </p>
                        {isFrom && (
                          <button
                            onClick={() => handleDelete(s.id)}
                            className="text-xs text-gray-500 hover:text-red-400 mt-1"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

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
      {showRecordModal && (
        <RecordSettlementModal
          groupId={groupId}
          balances={balances}
          currentUserId={user?.id ?? ''}
          onClose={() => setShowRecordModal(false)}
          onSuccess={() => {
            setShowRecordModal(false);
            loadAll();
          }}
        />
      )}
      {showHistoryModal && (
        <SettlementHistoryModal
          groupId={groupId}
          currentUserId={user?.id ?? ''}
          onClose={() => setShowHistoryModal(false)}
          onDelete={loadAll}
        />
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
          <div className="flex gap-2">
            <button
              onClick={() => setShowHistoryModal(true)}
              className="text-sm text-gray-400 hover:text-white"
            >
              History
            </button>
            <Link
              to={`/expenses?groupId=${groupId}`}
              className="text-sm text-primary-500 hover:text-primary-400"
            >
              Expenses →
            </Link>
          </div>
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
            {(myBalance.contributions.length > 0 || myBalance.settlementContributions.length > 0) && (
              <button
                onClick={() => setBreakdown(myBalance)}
                className="mt-3 text-xs text-primary-400 hover:text-primary-300 underline"
              >
                See transaction breakdown →
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
                    {(b.contributions.length > 0 || b.settlementContributions.length > 0) && (
                      <button
                        onClick={() => setBreakdown(b)}
                        className="text-xs text-primary-400 hover:text-primary-300 underline mt-0.5"
                      >
                        Why?
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

        {/* Simplified settlements */}
        <Card>
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="text-lg font-semibold text-white">Settlements</h3>
              <p className="text-gray-500 text-sm">
                Minimum transactions to clear remaining debts
              </p>
            </div>
            <Button onClick={() => setShowRecordModal(true)} className="text-sm py-1.5">
              Record Payment
            </Button>
          </div>

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
                    <div className="flex-1 text-right">
                      <p className={`font-medium ${isFrom ? 'text-red-300' : 'text-white'}`}>
                        {isFrom ? 'You' : s.fromName}
                        {s.fromGuestName && (
                          <span className="ml-1 text-xs text-gray-500">(guest)</span>
                        )}
                      </p>
                    </div>

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
