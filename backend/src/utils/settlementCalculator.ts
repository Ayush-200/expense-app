/**
 * Settlement Calculator
 *
 * Ledger-based balance calculation — balances are always derived from
 * expense transactions, never stored.
 *
 * Algorithm:
 * 1. Compute net balance per person: (amount paid) - (amount owed)
 *    Positive = others owe this person; Negative = this person owes others
 * 2. Debt simplification: greedy matching of most-negative with most-positive
 *    minimises transaction count to settle all debts.
 * 3. Expense contribution breakdown: every balance entry carries the list of
 *    underlying expenses so any number can be explained (Rohan's requirement).
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ExpenseContribution {
  expenseId: string;
  description: string;
  date: string;
  totalAmount: number;
  splitType: string;
  /** How much this person paid toward this expense */
  paidAmount: number;
  /** How much this person owes for this expense */
  owedAmount: number;
  /** Net effect on this person's balance from this expense */
  net: number;
}

export interface BalanceEntry {
  userId?: string;
  guestName?: string;
  guestEmail?: string;
  name: string;
  paid: number;
  owes: number;
  net: number; // positive = is owed money, negative = owes money
  /** Expense-level breakdown for traceability */
  contributions: ExpenseContribution[];
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
  id: string;
  description: string;
  date: string;
  splitType: string;
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

// ── Balance calculation ────────────────────────────────────────────────────────

export function calculateBalances(
  expenses: ExpenseForCalculation[]
): Map<string, BalanceEntry> {
  const balances = new Map<string, BalanceEntry>();

  const getKey = (userId?: string, guestName?: string) =>
    userId ? userId : `guest:${guestName}`;

  const ensureEntry = (
    key: string,
    name: string,
    userId?: string,
    guestName?: string,
    guestEmail?: string
  ): BalanceEntry => {
    if (!balances.has(key)) {
      balances.set(key, {
        userId,
        guestName,
        guestEmail,
        name,
        paid: 0,
        owes: 0,
        net: 0,
        contributions: [],
      });
    }
    return balances.get(key)!;
  };

  for (const expense of expenses) {
    const payerKey = expense.paidById;
    const payer = ensureEntry(payerKey, expense.paidByName, expense.paidById);
    payer.paid += expense.totalAmount;

    // Credit the payer's contribution for this expense
    const payerContrib = getOrCreateContribution(payer, expense);
    payerContrib.paidAmount += expense.totalAmount;

    // Debit each participant
    for (const p of expense.participants) {
      const key = getKey(p.userId, p.guestName);
      const name = p.userName ?? p.guestName ?? 'Guest';
      const entry = ensureEntry(key, name, p.userId, p.guestName, p.guestEmail);
      entry.owes += p.amountOwed;

      const contrib = getOrCreateContribution(entry, expense);
      contrib.owedAmount += p.amountOwed;
    }
  }

  // Finalise: round totals and compute per-expense net
  for (const entry of balances.values()) {
    entry.net = Math.round((entry.paid - entry.owes) * 100) / 100;
    entry.paid = Math.round(entry.paid * 100) / 100;
    entry.owes = Math.round(entry.owes * 100) / 100;

    for (const c of entry.contributions) {
      c.paidAmount = Math.round(c.paidAmount * 100) / 100;
      c.owedAmount = Math.round(c.owedAmount * 100) / 100;
      c.net = Math.round((c.paidAmount - c.owedAmount) * 100) / 100;
    }
    // Only keep contributions that actually affect this person's balance
    entry.contributions = entry.contributions.filter(
      (c) => c.paidAmount > 0 || c.owedAmount > 0
    );
  }

  return balances;
}

function getOrCreateContribution(
  entry: BalanceEntry,
  expense: ExpenseForCalculation
): ExpenseContribution {
  let contrib = entry.contributions.find((c) => c.expenseId === expense.id);
  if (!contrib) {
    contrib = {
      expenseId: expense.id,
      description: expense.description,
      date: expense.date,
      totalAmount: expense.totalAmount,
      splitType: expense.splitType,
      paidAmount: 0,
      owedAmount: 0,
      net: 0,
    };
    entry.contributions.push(contrib);
  }
  return contrib;
}

// ── Debt simplification ────────────────────────────────────────────────────────

/**
 * Aisha's requirement: simplified settlements — who pays whom and how much.
 * Uses a greedy algorithm: match largest debtor with largest creditor first.
 * This minimises the number of transactions needed.
 */
export function calculateSettlements(
  balances: Map<string, BalanceEntry>
): Settlement[] {
  const settlements: Settlement[] = [];

  const creditors: Array<{ entry: BalanceEntry; amount: number }> = [];
  const debtors: Array<{ entry: BalanceEntry; amount: number }> = [];

  for (const entry of balances.values()) {
    if (entry.net > 0.01) {
      creditors.push({ entry, amount: entry.net });
    } else if (entry.net < -0.01) {
      debtors.push({ entry, amount: -entry.net });
    }
  }

  // Sort descending so the greedy match is optimal
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

// ── Individual balance summary ─────────────────────────────────────────────────

export interface IndividualBalanceSummary {
  userId: string;
  name: string;
  /** Groups where this user has an outstanding balance */
  groupSummaries: Array<{
    groupId: string;
    groupName: string;
    net: number;
    paid: number;
    owes: number;
  }>;
  /** Overall net across all groups */
  totalNet: number;
  totalPaid: number;
  totalOwes: number;
}
