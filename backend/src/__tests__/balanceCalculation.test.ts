/**
 * Unit tests for balance calculation, debt simplification, and split types.
 *
 * Covers:
 *  - equal splits
 *  - percentage splits
 *  - share splits
 *  - member joins / leaves
 *  - guest participants
 */

import { describe, it, expect } from 'vitest';
import {
  calculateBalances,
  calculateSettlements,
  ExpenseForCalculation,
} from '../utils/settlementCalculator';
import { calculateSplits } from '../utils/splitCalculator';

// ── helpers ───────────────────────────────────────────────────────────────────

let expenseCounter = 0;
function makeExpense(
  overrides: Partial<ExpenseForCalculation> & {
    paidById: string;
    paidByName: string;
    totalAmount: number;
    participants: ExpenseForCalculation['participants'];
  }
): ExpenseForCalculation {
  return {
    id: `exp-${++expenseCounter}`,
    description: 'Test expense',
    date: new Date().toISOString(),
    splitType: 'EQUAL',
    ...overrides,
  };
}

function settlementMap(settlements: ReturnType<typeof calculateSettlements>) {
  // Returns a map of "from→to" → amount for easy assertion
  const m: Record<string, number> = {};
  for (const s of settlements) {
    const key = `${s.fromName}→${s.toName}`;
    m[key] = (m[key] ?? 0) + s.amount;
  }
  return m;
}

// ── Split calculator unit tests ───────────────────────────────────────────────

describe('calculateSplits', () => {
  describe('EQUAL split', () => {
    it('divides evenly among three people', () => {
      const result = calculateSplits(90, 'EQUAL', [
        { userId: 'A' },
        { userId: 'B' },
        { userId: 'C' },
      ]);
      expect(result).toHaveLength(3);
      result.forEach((r) => expect(r.amountOwed).toBe(30));
    });

    it('handles amounts that do not divide cleanly', () => {
      const result = calculateSplits(100, 'EQUAL', [
        { userId: 'A' },
        { userId: 'B' },
        { userId: 'C' },
      ]);
      const sum = result.reduce((s, r) => s + r.amountOwed, 0);
      // Each person gets ~33.33; sum may be off by ≤1 cent due to rounding
      expect(Math.abs(sum - 100)).toBeLessThanOrEqual(0.01);
    });

    it('stores correct split metadata', () => {
      const result = calculateSplits(60, 'EQUAL', [{ userId: 'A' }, { userId: 'B' }]);
      expect((result[0].splitMetadata as any).splitType).toBe('EQUAL');
    });
  });

  describe('PERCENTAGE split', () => {
    it('allocates amounts proportionally', () => {
      const result = calculateSplits(200, 'PERCENTAGE', [
        { userId: 'A', percentage: 60 },
        { userId: 'B', percentage: 40 },
      ]);
      expect(result[0].amountOwed).toBe(120);
      expect(result[1].amountOwed).toBe(80);
    });

    it('throws when percentages do not sum to 100', () => {
      expect(() =>
        calculateSplits(100, 'PERCENTAGE', [
          { userId: 'A', percentage: 60 },
          { userId: 'B', percentage: 50 },
        ])
      ).toThrow();
    });

    it('stores percentage in split metadata', () => {
      const result = calculateSplits(100, 'PERCENTAGE', [
        { userId: 'A', percentage: 70 },
        { userId: 'B', percentage: 30 },
      ]);
      expect((result[0].splitMetadata as any).percentage).toBe(70);
    });
  });

  describe('SHARE split', () => {
    it('allocates proportionally by share count', () => {
      const result = calculateSplits(120, 'SHARE', [
        { userId: 'A', shares: 3 },
        { userId: 'B', shares: 1 },
      ]);
      // A: 3/4 * 120 = 90, B: 1/4 * 120 = 30
      expect(result[0].amountOwed).toBe(90);
      expect(result[1].amountOwed).toBe(30);
    });

    it('throws when total shares is zero', () => {
      expect(() =>
        calculateSplits(100, 'SHARE', [{ userId: 'A', shares: 0 }])
      ).toThrow();
    });

    it('stores shares and totalShares in metadata', () => {
      const result = calculateSplits(60, 'SHARE', [
        { userId: 'A', shares: 2 },
        { userId: 'B', shares: 1 },
      ]);
      const meta = result[0].splitMetadata as any;
      expect(meta.shares).toBe(2);
      expect(meta.totalShares).toBe(3);
    });
  });

  describe('EXACT split', () => {
    it('assigns exact amounts', () => {
      const result = calculateSplits(150, 'EXACT', [
        { userId: 'A', exactAmount: 100 },
        { userId: 'B', exactAmount: 50 },
      ]);
      expect(result[0].amountOwed).toBe(100);
      expect(result[1].amountOwed).toBe(50);
    });

    it('throws when exact amounts do not sum to total', () => {
      expect(() =>
        calculateSplits(100, 'EXACT', [
          { userId: 'A', exactAmount: 60 },
          { userId: 'B', exactAmount: 50 },
        ])
      ).toThrow();
    });
  });
});

// ── Balance calculation tests ─────────────────────────────────────────────────

describe('calculateBalances', () => {
  it('returns empty map for no expenses', () => {
    expect(calculateBalances([])).toEqual(new Map());
  });

  it('credits the payer and debits each participant', () => {
    const expenses = [
      makeExpense({
        paidById: 'alice',
        paidByName: 'Alice',
        totalAmount: 90,
        participants: [
          { userId: 'alice', userName: 'Alice', amountOwed: 30 },
          { userId: 'bob', userName: 'Bob', amountOwed: 30 },
          { userId: 'carol', userName: 'Carol', amountOwed: 30 },
        ],
      }),
    ];

    const balances = calculateBalances(expenses);

    const alice = balances.get('alice')!;
    expect(alice.paid).toBe(90);
    expect(alice.owes).toBe(30);
    expect(alice.net).toBe(60); // Bob and Carol each owe Alice 30

    const bob = balances.get('bob')!;
    expect(bob.paid).toBe(0);
    expect(bob.owes).toBe(30);
    expect(bob.net).toBe(-30);

    const carol = balances.get('carol')!;
    expect(carol.net).toBe(-30);
  });

  it('accumulates across multiple expenses', () => {
    const expenses = [
      makeExpense({
        paidById: 'alice',
        paidByName: 'Alice',
        totalAmount: 60,
        participants: [
          { userId: 'alice', userName: 'Alice', amountOwed: 30 },
          { userId: 'bob', userName: 'Bob', amountOwed: 30 },
        ],
      }),
      makeExpense({
        paidById: 'bob',
        paidByName: 'Bob',
        totalAmount: 60,
        participants: [
          { userId: 'alice', userName: 'Alice', amountOwed: 30 },
          { userId: 'bob', userName: 'Bob', amountOwed: 30 },
        ],
      }),
    ];

    const balances = calculateBalances(expenses);

    // Both paid 60 each, both owe 60 total → net 0
    expect(balances.get('alice')!.net).toBe(0);
    expect(balances.get('bob')!.net).toBe(0);
  });

  it('includes expense contributions for traceability', () => {
    const expense = makeExpense({
      description: 'Dinner',
      paidById: 'alice',
      paidByName: 'Alice',
      totalAmount: 100,
      participants: [
        { userId: 'alice', userName: 'Alice', amountOwed: 50 },
        { userId: 'bob', userName: 'Bob', amountOwed: 50 },
      ],
    });

    const balances = calculateBalances([expense]);
    const alice = balances.get('alice')!;

    expect(alice.contributions).toHaveLength(1);
    const contrib = alice.contributions[0];
    expect(contrib.description).toBe('Dinner');
    expect(contrib.paidAmount).toBe(100);
    expect(contrib.owedAmount).toBe(50);
    expect(contrib.net).toBe(50);
  });

  it('net balances sum to zero (conservation)', () => {
    const expenses = [
      makeExpense({
        paidById: 'alice',
        paidByName: 'Alice',
        totalAmount: 120,
        participants: [
          { userId: 'alice', userName: 'Alice', amountOwed: 40 },
          { userId: 'bob', userName: 'Bob', amountOwed: 40 },
          { userId: 'carol', userName: 'Carol', amountOwed: 40 },
        ],
      }),
      makeExpense({
        paidById: 'bob',
        paidByName: 'Bob',
        totalAmount: 60,
        participants: [
          { userId: 'alice', userName: 'Alice', amountOwed: 30 },
          { userId: 'bob', userName: 'Bob', amountOwed: 30 },
        ],
      }),
    ];

    const balances = calculateBalances(expenses);
    const totalNet = Array.from(balances.values()).reduce(
      (s, e) => s + e.net,
      0
    );
    expect(Math.abs(totalNet)).toBeLessThan(0.01);
  });
});

// ── Guest participants ────────────────────────────────────────────────────────

describe('guest participants', () => {
  it('tracks guests separately from registered users', () => {
    const expenses = [
      makeExpense({
        paidById: 'alice',
        paidByName: 'Alice',
        totalAmount: 90,
        participants: [
          { userId: 'alice', userName: 'Alice', amountOwed: 30 },
          { guestName: 'Dave', guestEmail: 'dave@x.com', amountOwed: 30 },
          { guestName: 'Eve', amountOwed: 30 },
        ],
      }),
    ];

    const balances = calculateBalances(expenses);

    // Guest keyed as "guest:Dave"
    const dave = balances.get('guest:Dave')!;
    expect(dave).toBeDefined();
    expect(dave.net).toBe(-30);
    expect(dave.guestEmail).toBe('dave@x.com');

    const eve = balances.get('guest:Eve')!;
    expect(eve).toBeDefined();
    expect(eve.net).toBe(-30);

    // Alice is owed 60
    expect(balances.get('alice')!.net).toBe(60);
  });

  it('does not mix guest with user of same name', () => {
    const expenses = [
      makeExpense({
        paidById: 'alice',
        paidByName: 'Alice',
        totalAmount: 60,
        participants: [
          // registered user named "Bob"
          { userId: 'bob-uid', userName: 'Bob', amountOwed: 30 },
          // unrelated guest also named "Bob"
          { guestName: 'Bob', amountOwed: 30 },
        ],
      }),
    ];

    const balances = calculateBalances(expenses);
    expect(balances.has('bob-uid')).toBe(true);
    expect(balances.has('guest:Bob')).toBe(true);
  });
});

// ── Member joins / leaves ─────────────────────────────────────────────────────

describe('member join / leave scenarios', () => {
  it('only includes expenses added while member was active', () => {
    // Simulate: Carol joined later, so is only on expense 2
    const expenses = [
      makeExpense({
        description: 'Before Carol joined',
        paidById: 'alice',
        paidByName: 'Alice',
        totalAmount: 60,
        participants: [
          { userId: 'alice', userName: 'Alice', amountOwed: 30 },
          { userId: 'bob', userName: 'Bob', amountOwed: 30 },
        ],
      }),
      makeExpense({
        description: 'After Carol joined',
        paidById: 'alice',
        paidByName: 'Alice',
        totalAmount: 90,
        participants: [
          { userId: 'alice', userName: 'Alice', amountOwed: 30 },
          { userId: 'bob', userName: 'Bob', amountOwed: 30 },
          { userId: 'carol', userName: 'Carol', amountOwed: 30 },
        ],
      }),
    ];

    const balances = calculateBalances(expenses);

    // Carol only appears in second expense
    const carol = balances.get('carol')!;
    expect(carol.owes).toBe(30);
    expect(carol.contributions).toHaveLength(1);
    expect(carol.contributions[0].description).toBe('After Carol joined');
  });

  it('member who left still has their historical balance', () => {
    // Dave was in expense 1 but has since left the group.
    // Balances are calculated from transactions, so he still owes.
    const expenses = [
      makeExpense({
        paidById: 'alice',
        paidByName: 'Alice',
        totalAmount: 60,
        participants: [
          { userId: 'alice', userName: 'Alice', amountOwed: 30 },
          { userId: 'dave', userName: 'Dave', amountOwed: 30 },
        ],
      }),
    ];

    const balances = calculateBalances(expenses);
    // Dave still owes 30 even though he "left" — balance comes from transactions
    expect(balances.get('dave')!.net).toBe(-30);
  });
});

// ── Debt simplification (settlement) tests ────────────────────────────────────

describe('calculateSettlements', () => {
  it('returns no settlements when everyone is settled up', () => {
    const expenses = [
      makeExpense({
        paidById: 'alice',
        paidByName: 'Alice',
        totalAmount: 60,
        participants: [
          { userId: 'alice', userName: 'Alice', amountOwed: 30 },
          { userId: 'bob', userName: 'Bob', amountOwed: 30 },
        ],
      }),
      makeExpense({
        paidById: 'bob',
        paidByName: 'Bob',
        totalAmount: 60,
        participants: [
          { userId: 'alice', userName: 'Alice', amountOwed: 30 },
          { userId: 'bob', userName: 'Bob', amountOwed: 30 },
        ],
      }),
    ];

    const balances = calculateBalances(expenses);
    expect(calculateSettlements(balances)).toHaveLength(0);
  });

  it('produces a single settlement for a simple two-person debt', () => {
    const expenses = [
      makeExpense({
        paidById: 'alice',
        paidByName: 'Alice',
        totalAmount: 100,
        participants: [
          { userId: 'alice', userName: 'Alice', amountOwed: 50 },
          { userId: 'bob', userName: 'Bob', amountOwed: 50 },
        ],
      }),
    ];

    const balances = calculateBalances(expenses);
    const settlements = calculateSettlements(balances);

    expect(settlements).toHaveLength(1);
    expect(settlements[0].fromName).toBe('Bob');
    expect(settlements[0].toName).toBe('Alice');
    expect(settlements[0].amount).toBe(50);
  });

  it('minimises transactions for three-person chain debt', () => {
    // Alice paid for Bob; Bob paid for Carol; Carol has no payment
    // Net: Alice +100, Bob 0, Carol -100 → 1 settlement: Carol→Alice 100
    const expenses = [
      makeExpense({
        paidById: 'alice',
        paidByName: 'Alice',
        totalAmount: 100,
        participants: [
          { userId: 'alice', userName: 'Alice', amountOwed: 0 },
          { userId: 'bob', userName: 'Bob', amountOwed: 100 },
        ],
      }),
      makeExpense({
        paidById: 'bob',
        paidByName: 'Bob',
        totalAmount: 100,
        participants: [
          { userId: 'bob', userName: 'Bob', amountOwed: 0 },
          { userId: 'carol', userName: 'Carol', amountOwed: 100 },
        ],
      }),
    ];

    const balances = calculateBalances(expenses);
    const settlements = calculateSettlements(balances);

    expect(settlements).toHaveLength(1);
    const sm = settlementMap(settlements);
    expect(sm['Carol→Alice']).toBe(100);
  });

  it('settlement amounts are always positive', () => {
    const expenses = [
      makeExpense({
        paidById: 'alice',
        paidByName: 'Alice',
        totalAmount: 90,
        participants: [
          { userId: 'alice', userName: 'Alice', amountOwed: 30 },
          { userId: 'bob', userName: 'Bob', amountOwed: 30 },
          { userId: 'carol', userName: 'Carol', amountOwed: 30 },
        ],
      }),
    ];

    const balances = calculateBalances(expenses);
    const settlements = calculateSettlements(balances);

    settlements.forEach((s) => expect(s.amount).toBeGreaterThan(0));
  });

  it('total settlement amounts equal total outstanding debt', () => {
    const expenses = [
      makeExpense({
        paidById: 'alice',
        paidByName: 'Alice',
        totalAmount: 120,
        participants: [
          { userId: 'alice', userName: 'Alice', amountOwed: 40 },
          { userId: 'bob', userName: 'Bob', amountOwed: 40 },
          { userId: 'carol', userName: 'Carol', amountOwed: 40 },
        ],
      }),
    ];

    const balances = calculateBalances(expenses);
    const settlements = calculateSettlements(balances);

    const totalSettled = settlements.reduce((s, t) => s + t.amount, 0);
    // Alice is owed 80 (she paid 120, owes 40); total should be 80
    expect(Math.round(totalSettled * 100) / 100).toBe(80);
  });

  it('handles guest debtors in settlements', () => {
    const expenses = [
      makeExpense({
        paidById: 'alice',
        paidByName: 'Alice',
        totalAmount: 60,
        participants: [
          { userId: 'alice', userName: 'Alice', amountOwed: 30 },
          { guestName: 'Dave', amountOwed: 30 },
        ],
      }),
    ];

    const balances = calculateBalances(expenses);
    const settlements = calculateSettlements(balances);

    expect(settlements).toHaveLength(1);
    expect(settlements[0].fromGuestName).toBe('Dave');
    expect(settlements[0].toName).toBe('Alice');
  });
});
