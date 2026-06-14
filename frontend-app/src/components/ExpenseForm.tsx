import { useState, useEffect } from 'react';
import { User, SplitType, CreateExpenseData, ParticipantInput, Expense } from '../types';
import { Button } from './Button';
import { Input } from './Input';

interface Props {
  groupId: string;
  groupMembers: User[];
  onSubmit: (data: CreateExpenseData) => Promise<void>;
  onCancel: () => void;
  initialData?: Expense;
  isLoading: boolean;
}

interface ParticipantRow extends ParticipantInput {
  // ui-only id for keying the list
  _key: string;
  isGuest: boolean;
}

export function ExpenseForm({
  groupId,
  groupMembers,
  onSubmit,
  onCancel,
  initialData,
  isLoading,
}: Props) {
  const [description, setDescription] = useState(initialData?.description ?? '');
  const [totalAmount, setTotalAmount] = useState(
    initialData ? String(initialData.totalAmount) : ''
  );
  const [splitType, setSplitType] = useState<SplitType>(initialData?.splitType ?? 'EQUAL');
  const [date, setDate] = useState(
    initialData
      ? new Date(initialData.date).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0]
  );
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
  const [error, setError] = useState('');

  // Initialise participant rows from existing data or default to all group members
  useEffect(() => {
    if (initialData) {
      setParticipants(
        initialData.participants.map((p) => ({
          _key: p.id,
          isGuest: !p.userId,
          userId: p.userId,
          guestName: p.guestName ?? '',
          guestEmail: p.guestEmail ?? '',
          exactAmount: p.splitMetadata?.exactAmount as number | undefined,
          percentage: p.splitMetadata?.percentage as number | undefined,
          shares: p.splitMetadata?.shares as number | undefined,
        }))
      );
    } else {
      setParticipants(
        groupMembers.map((m) => ({
          _key: m.id,
          isGuest: false,
          userId: m.id,
          shares: 1,
          percentage: parseFloat((100 / groupMembers.length).toFixed(2)),
          exactAmount: undefined,
        }))
      );
    }
  }, [groupMembers, initialData]);

  const addGuest = () => {
    setParticipants((prev) => [
      ...prev,
      {
        _key: `guest-${Date.now()}`,
        isGuest: true,
        guestName: '',
        guestEmail: '',
        shares: 1,
        percentage: 0,
        exactAmount: 0,
      },
    ]);
  };

  const removeParticipant = (key: string) => {
    setParticipants((prev) => prev.filter((p) => p._key !== key));
  };

  const updateParticipant = (key: string, field: keyof ParticipantInput, value: string | number) => {
    setParticipants((prev) =>
      prev.map((p) => (p._key === key ? { ...p, [field]: value } : p))
    );
  };

  // Live validation feedback
  const getValidationHint = () => {
    const total = parseFloat(totalAmount) || 0;
    if (splitType === 'PERCENTAGE') {
      const sum = participants.reduce((a, p) => a + (p.percentage ?? 0), 0);
      const rounded = Math.round(sum * 100) / 100;
      return rounded === 100
        ? { ok: true, msg: `${rounded}% ✓` }
        : { ok: false, msg: `${rounded}% — must equal 100%` };
    }
    if (splitType === 'EXACT') {
      const sum = participants.reduce((a, p) => a + (p.exactAmount ?? 0), 0);
      const rounded = Math.round(sum * 100) / 100;
      return rounded === total
        ? { ok: true, msg: `₹${rounded} ✓` }
        : { ok: false, msg: `₹${rounded} — must equal ₹${total}` };
    }
    if (splitType === 'SHARE') {
      const total = participants.reduce((a, p) => a + (p.shares ?? 0), 0);
      return { ok: true, msg: `${total} total shares` };
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const hint = getValidationHint();
    if (hint && !hint.ok) {
      setError(hint.msg);
      return;
    }

    try {
      await onSubmit({
        groupId,
        description,
        totalAmount: parseFloat(totalAmount),
        splitType,
        date,
        participants: participants.map(({ _key, isGuest, ...rest }) => rest),
      });
    } catch (err: any) {
      setError(err.response?.data?.message ?? err.message ?? 'Something went wrong');
    }
  };

  const hint = getValidationHint();

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Input
        label="Description"
        type="text"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        required
        placeholder="e.g. Dinner, Hotel, Fuel"
      />

      <div className="flex gap-4">
        <div className="flex-1">
          <Input
            label="Total Amount (₹)"
            type="number"
            min="0.01"
            step="0.01"
            value={totalAmount}
            onChange={(e) => setTotalAmount(e.target.value)}
            required
          />
        </div>
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-300 mb-1">Date</label>
          <input
            type="date"
            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      </div>

      {/* Split type selector */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">Split Type</label>
        <div className="grid grid-cols-4 gap-2">
          {(['EQUAL', 'EXACT', 'PERCENTAGE', 'SHARE'] as SplitType[]).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setSplitType(type)}
              className={`py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${
                splitType === type
                  ? 'bg-primary-600 border-primary-500 text-white'
                  : 'bg-gray-900 border-gray-700 text-gray-300 hover:border-primary-600'
              }`}
            >
              {type === 'EQUAL' && 'Equal'}
              {type === 'EXACT' && 'Exact'}
              {type === 'PERCENTAGE' && '%'}
              {type === 'SHARE' && 'Shares'}
            </button>
          ))}
        </div>
      </div>

      {/* Participants */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="text-sm font-medium text-gray-300">
            Participants
          </label>
          <button
            type="button"
            onClick={addGuest}
            className="text-xs text-primary-500 hover:text-primary-400"
          >
            + Add Guest
          </button>
        </div>

        <div className="space-y-2">
          {participants.map((p) => (
            <div
              key={p._key}
              className="flex items-center gap-2 p-3 bg-gray-800 rounded-lg border border-gray-700"
            >
              {p.isGuest ? (
                <>
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <input
                      className="px-2 py-1 bg-gray-900 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
                      placeholder="Guest name *"
                      value={p.guestName ?? ''}
                      onChange={(e) => updateParticipant(p._key, 'guestName', e.target.value)}
                    />
                    <input
                      className="px-2 py-1 bg-gray-900 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
                      placeholder="Guest email"
                      value={p.guestEmail ?? ''}
                      onChange={(e) => updateParticipant(p._key, 'guestEmail', e.target.value)}
                    />
                  </div>
                  <span className="text-xs text-gray-500 px-1">Guest</span>
                </>
              ) : (
                <div className="flex-1">
                  <span className="text-white text-sm font-medium">
                    {groupMembers.find((m) => m.id === p.userId)?.name}
                  </span>
                  <span className="text-gray-500 text-xs ml-2">
                    {groupMembers.find((m) => m.id === p.userId)?.email}
                  </span>
                </div>
              )}

              {/* Per-split input */}
              {splitType === 'EXACT' && (
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-24 px-2 py-1 bg-gray-900 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
                  placeholder="₹ amount"
                  value={p.exactAmount ?? ''}
                  onChange={(e) => updateParticipant(p._key, 'exactAmount', parseFloat(e.target.value) || 0)}
                />
              )}
              {splitType === 'PERCENTAGE' && (
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  className="w-20 px-2 py-1 bg-gray-900 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
                  placeholder="%"
                  value={p.percentage ?? ''}
                  onChange={(e) => updateParticipant(p._key, 'percentage', parseFloat(e.target.value) || 0)}
                />
              )}
              {splitType === 'SHARE' && (
                <input
                  type="number"
                  min="1"
                  step="1"
                  className="w-20 px-2 py-1 bg-gray-900 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
                  placeholder="shares"
                  value={p.shares ?? ''}
                  onChange={(e) => updateParticipant(p._key, 'shares', parseInt(e.target.value) || 1)}
                />
              )}
              {splitType === 'EQUAL' && (
                <span className="text-gray-400 text-sm w-20 text-right">
                  ₹{totalAmount
                    ? (parseFloat(totalAmount) / participants.length).toFixed(2)
                    : '0.00'}
                </span>
              )}

              {p.isGuest && (
                <button
                  type="button"
                  onClick={() => removeParticipant(p._key)}
                  className="text-red-500 hover:text-red-400 text-lg leading-none ml-1"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>

        {hint && (
          <p className={`mt-2 text-xs ${hint.ok ? 'text-green-400' : 'text-yellow-400'}`}>
            {hint.msg}
          </p>
        )}
      </div>

      {error && (
        <div className="p-3 rounded-lg text-sm bg-red-900/30 text-red-400 border border-red-800">
          {error}
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <Button type="submit" variant="primary" isLoading={isLoading} className="flex-1">
          {initialData ? 'Save Changes' : 'Add Expense'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} className="flex-1">
          Cancel
        </Button>
      </div>
    </form>
  );
}
