/**
 * Settlement Calculator
 *
 * Given a list of expenses, calculates the net balance for each person,
 * then produces a minimal set of transactions to settle all debts.
 *
 * Algorithm:
 * 1. Compute net balance per person: (amount paid) - (amount owed)
 *    Positive balance = others owe this person
 *    Negative balance = this person owes others
 * 2. Greedy settlement: repeatedly match the most-negative with
 *    the most-positive until all balances are zero.
 *    This minimises the number of transactions.
 */

export interface BalanceEntry {
  userId?: string;
  guestName?: string;
  guestEmail?: string;
  name: string;
  paid: number;
  owes: number;
  net: number; // positive = is owed money, negative = owes money
}

export interface Settlement {
  fromUserId?: string;
  fromName: string;
  fromGuestName?: string;
  toUserId?: string;
  toName: string;
  amount: number;
}

export interface ExpenseForCalculation {
  paidById: string;
  paidByName: string;
  totalAmount: number;
  participants: {
    userId?: string;
    guestName?: string;
    guestEmail?: string;
    userName?: string;
    amountOwed: number;
  }[];
}

export function calculateBalances(
  expenses: ExpenseForCalculation[]
): Map<string, BalanceEntry> {
  // key: userId or `guest:${guestName}`
  const balances = new Map<string, BalanceEntry>();

  const getKey = (userId?: string, guestName?: string) =>
    userId ? userId : `guest:${guestName}`;

  const ensureEntry = (
    key: string,
    name: string,
    userId?: string,
    guestName?: string,
    guestEmail?: string
  ) => {
    if (!balances.has(key)) {
      balances.set(key, {
        userId,
        guestName,
        guestEmail,
        name,
        paid: 0,
        owes: 0,
        net: 0,
      });
    }
    return balances.get(key)!;
  };

  for (const expense of expenses) {
    // Credit the payer
    const payerKey = expense.paidById;
    const payer = ensureEntry(payerKey, expense.paidByName, expense.paidById);
    payer.paid += expense.totalAmount;

    // Debit each participant
    for (const p of expense.participants) {
      const key = getKey(p.userId, p.guestName);
      const name = p.userName ?? p.guestName ?? 'Guest';
      const entry = ensureEntry(key, name, p.userId, p.guestName, p.guestEmail);
      entry.owes += p.amountOwed;
    }
  }

  // Compute net
  for (const entry of balances.values()) {
    entry.net = Math.round((entry.paid - entry.owes) * 100) / 100;
    entry.paid = Math.round(entry.paid * 100) / 100;
    entry.owes = Math.round(entry.owes * 100) / 100;
  }

  return balances;
}

export function calculateSettlements(
  balances: Map<string, BalanceEntry>
): Settlement[] {
  const settlements: Settlement[] = [];

  // Separate into creditors (net > 0) and debtors (net < 0)
  const creditors: Array<{ key: string; entry: BalanceEntry; amount: number }> = [];
  const debtors: Array<{ key: string; entry: BalanceEntry; amount: number }> = [];

  for (const [key, entry] of balances.entries()) {
    if (entry.net > 0.01) {
      creditors.push({ key, entry, amount: entry.net });
    } else if (entry.net < -0.01) {
      debtors.push({ key, entry, amount: -entry.net });
    }
  }

  // Sort descending for greedy matching
  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const amount = Math.min(debtor.amount, creditor.amount);

    if (amount > 0.01) {
      settlements.push({
        fromUserId: debtor.entry.userId,
        fromName: debtor.entry.name,
        fromGuestName: debtor.entry.guestName,
        toUserId: creditor.entry.userId,
        toName: creditor.entry.name,
        amount: Math.round(amount * 100) / 100,
      });
    }

    debtor.amount = Math.round((debtor.amount - amount) * 100) / 100;
    creditor.amount = Math.round((creditor.amount - amount) * 100) / 100;

    if (debtor.amount < 0.01) i++;
    if (creditor.amount < 0.01) j++;
  }

  return settlements;
}
