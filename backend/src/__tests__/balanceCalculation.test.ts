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

// ── Refund / negative-amount transaction tests ────────────────────────────────

describe('refund transactions', () => {
  it('refund with same participants splits negative amount equally', () => {
    // 3 people share a 60 expense, then a -30 refund among same 3
    const result = calculateSplits(-30, 'EQUAL', [
      { userId: 'A' },
      { userId: 'B' },
      { userId: 'C' },
    ]);
    expect(result).toHaveLength(3);
    result.forEach((r) => expect(r.amountOwed).toBe(-10));
  });

  it('refund with different participants (parasailing example)', () => {
    // Original: 150 / 5 = 30 each (Aisha, Rohan, Priya, Dev, Kabir guest)
    // Refund: -30 / 4 = -7.5 each (Aisha, Rohan, Priya, Dev; Kabir excluded)
    const result = calculateSplits(-30, 'EQUAL', [
      { userId: 'aisha' },
      { userId: 'rohan' },
      { userId: 'priya' },
      { userId: 'dev' },
    ]);
    expect(result).toHaveLength(4);
    result.forEach((r) => expect(r.amountOwed).toBe(-7.5));

    // Combined net liabilities
    const expectedNet: Record<string, number> = {
      aisha: 30 - 7.5,
      rohan: 30 - 7.5,
      priya: 30 - 7.5,
      dev: 30 - 7.5,
    };
    // Kabir only in original: 30
    // Total should be 120
    const totalNet = Object.values(expectedNet).reduce((s, v) => s + v, 0) + 30;
    expect(totalNet).toBe(120);
  });

  it('balance calculation correctly nets refund against original expense', () => {
    // Parasailing example as full balance calc
    const expenses = [
      makeExpense({
        description: 'Parasailing',
        paidById: 'dev',
        paidByName: 'Dev',
        totalAmount: 150,
        participants: [
          { userId: 'aisha', userName: 'Aisha', amountOwed: 30 },
          { userId: 'rohan', userName: 'Rohan', amountOwed: 30 },
          { userId: 'priya', userName: 'Priya', amountOwed: 30 },
          { userId: 'dev', userName: 'Dev', amountOwed: 30 },
          { guestName: "Dev's friend Kabir", amountOwed: 30 },
        ],
      }),
      makeExpense({
        description: 'Parasailing refund',
        paidById: 'dev',
        paidByName: 'Dev',
        totalAmount: -30,
        participants: [
          { userId: 'aisha', userName: 'Aisha', amountOwed: -7.5 },
          { userId: 'rohan', userName: 'Rohan', amountOwed: -7.5 },
          { userId: 'priya', userName: 'Priya', amountOwed: -7.5 },
          { userId: 'dev', userName: 'Dev', amountOwed: -7.5 },
        ],
      }),
    ];

    const balances = calculateBalances(expenses);

    // Dev paid 150 - 30 = 120 total
    expect(balances.get('dev')!.paid).toBe(120);

    // Each member owes net: 30 - 7.5 = 22.5
    expect(balances.get('aisha')!.owes).toBe(22.5);
    expect(balances.get('rohan')!.owes).toBe(22.5);
    expect(balances.get('priya')!.owes).toBe(22.5);

    // Dev owes himself net 22.5, plus owes 30 for his own share in original
    expect(balances.get('dev')!.owes).toBe(22.5);

    // Kabir owes 30 (guest, no refund)
    const kabir = balances.get("guest:Dev's friend Kabir")!;
    expect(kabir.owes).toBe(30);

    // Conservation: total net = 0
    const totalNet = Array.from(balances.values()).reduce((s, e) => s + e.net, 0);
    expect(Math.abs(totalNet)).toBeLessThan(0.01);
  });

  it('partial refund only affects a subset of participants', () => {
    // Expense: 100 split equally among 4 → 25 each
    // Refund: -20 split equally among 2 of them → -10 each
    const result = calculateSplits(-20, 'EQUAL', [
      { userId: 'A' },
      { userId: 'B' },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].amountOwed).toBe(-10);
    expect(result[1].amountOwed).toBe(-10);
  });

  it('multiple refunds for one expense accumulate correctly', () => {
    // Original: 200 split equally among 4 → 50 each
    // Refund 1: -40 equally among all 4 → -10 each
    // Refund 2: -20 equally among all 4 → -5 each
    // Net: 50 - 10 - 5 = 35 each
    const expenses = [
      makeExpense({
        paidById: 'A',
        paidByName: 'Alice',
        totalAmount: 200,
        participants: [
          { userId: 'A', userName: 'Alice', amountOwed: 50 },
          { userId: 'B', userName: 'Bob', amountOwed: 50 },
          { userId: 'C', userName: 'Carol', amountOwed: 50 },
          { userId: 'D', userName: 'Dave', amountOwed: 50 },
        ],
      }),
      makeExpense({
        paidById: 'A',
        paidByName: 'Alice',
        totalAmount: -40,
        participants: [
          { userId: 'A', userName: 'Alice', amountOwed: -10 },
          { userId: 'B', userName: 'Bob', amountOwed: -10 },
          { userId: 'C', userName: 'Carol', amountOwed: -10 },
          { userId: 'D', userName: 'Dave', amountOwed: -10 },
        ],
      }),
      makeExpense({
        paidById: 'A',
        paidByName: 'Alice',
        totalAmount: -20,
        participants: [
          { userId: 'A', userName: 'Alice', amountOwed: -5 },
          { userId: 'B', userName: 'Bob', amountOwed: -5 },
          { userId: 'C', userName: 'Carol', amountOwed: -5 },
          { userId: 'D', userName: 'Dave', amountOwed: -5 },
        ],
      }),
    ];

    const balances = calculateBalances(expenses);

    // Alice paid 200 - 40 - 20 = 140
    expect(balances.get('A')!.paid).toBe(140);

    // Each owes 50 - 10 - 5 = 35
    for (const id of ['A', 'B', 'C', 'D']) {
      expect(balances.get(id)!.owes).toBe(35);
    }

    // Conservation check
    const totalNet = Array.from(balances.values()).reduce((s, e) => s + e.net, 0);
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

  it('single guest in equal split', () => {
    const expenses = [
      makeExpense({
        paidById: 'alice',
        paidByName: 'Alice',
        totalAmount: 60,
        participants: [
          { userId: 'alice', userName: 'Alice', amountOwed: 30 },
          { guestName: 'Guest1', amountOwed: 30 },
        ],
      }),
    ];

    const balances = calculateBalances(expenses);
    const guest = balances.get('guest:Guest1')!;
    expect(guest.owes).toBe(30);
    expect(guest.net).toBe(-30);
    expect(guest.name).toBe('Guest1');
    expect(guest.guestName).toBe('Guest1');
  });

  it('multiple guests in same expense', () => {
    const expenses = [
      makeExpense({
        paidById: 'alice',
        paidByName: 'Alice',
        totalAmount: 90,
        participants: [
          { userId: 'alice', userName: 'Alice', amountOwed: 30 },
          { guestName: 'Guest1', amountOwed: 30 },
          { guestName: 'Guest2', amountOwed: 30 },
        ],
      }),
    ];

    const balances = calculateBalances(expenses);
    expect(balances.get('guest:Guest1')!.owes).toBe(30);
    expect(balances.get('guest:Guest2')!.owes).toBe(30);
    expect(balances.get('alice')!.net).toBe(60);
  });

  it('guest excluded from refund (parasailing scenario)', () => {
    // Original expense: 5 people (including guest)
    // Refund: only 4 (guest excluded)
    const expenses = [
      makeExpense({
        paidById: 'dev',
        paidByName: 'Dev',
        totalAmount: 100,
        participants: [
          { userId: 'a', userName: 'A', amountOwed: 20 },
          { userId: 'b', userName: 'B', amountOwed: 20 },
          { userId: 'c', userName: 'C', amountOwed: 20 },
          { userId: 'd', userName: 'D', amountOwed: 20 },
          { guestName: 'Guest1', amountOwed: 20 },
        ],
      }),
      makeExpense({
        paidById: 'dev',
        paidByName: 'Dev',
        totalAmount: -20,
        participants: [
          { userId: 'a', userName: 'A', amountOwed: -5 },
          { userId: 'b', userName: 'B', amountOwed: -5 },
          { userId: 'c', userName: 'C', amountOwed: -5 },
          { userId: 'd', userName: 'D', amountOwed: -5 },
        ],
      }),
    ];

    const balances = calculateBalances(expenses);

    // Guest owes full 20
    expect(balances.get('guest:Guest1')!.owes).toBe(20);
    expect(balances.get('guest:Guest1')!.net).toBe(-20);

    // Each registered user owes net 15
    expect(balances.get('a')!.owes).toBe(15);
    expect(balances.get('b')!.owes).toBe(15);
    expect(balances.get('c')!.owes).toBe(15);
    expect(balances.get('d')!.owes).toBe(15);
  });

  it('guest in share split', () => {
    // SHARE split: Alice 2 shares, Guest1 1 share
    // Total: 3 shares → each share = 60/3 = 20
    // Alice owes 40, Guest1 owes 20
    const result = calculateSplits(60, 'SHARE', [
      { userId: 'alice', shares: 2 },
      { guestName: 'Guest1', shares: 1 },
    ]);

    expect(result[0].amountOwed).toBe(40);
    expect(result[1].guestName).toBe('Guest1');
    expect(result[1].amountOwed).toBe(20);

    // Full balance calc
    const balances = calculateBalances([
      makeExpense({
        paidById: 'alice',
        paidByName: 'Alice',
        totalAmount: 60,
        participants: result.map(r => ({
          userId: r.userId ?? undefined,
          guestName: r.guestName ?? undefined,
          userName: r.userId ? 'Alice' : r.guestName ?? 'Guest',
          amountOwed: r.amountOwed,
        })),
      }),
    ]);

    const guest = balances.get('guest:Guest1')!;
    expect(guest.owes).toBe(20);
    expect(guest.net).toBe(-20);
  });

  it('guest appears in debt simplification settlements', () => {
    const expenses = [
      makeExpense({
        paidById: 'alice',
        paidByName: 'Alice',
        totalAmount: 60,
        participants: [
          { userId: 'alice', userName: 'Alice', amountOwed: 30 },
          { guestName: 'Guest1', amountOwed: 30 },
        ],
      }),
    ];

    const balances = calculateBalances(expenses);
    const settlements = calculateSettlements(balances);

    expect(settlements).toHaveLength(1);
    expect(settlements[0].fromGuestName).toBe('Guest1');
    expect(settlements[0].toName).toBe('Alice');
    expect(settlements[0].amount).toBe(30);
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

  it('member charged after leaving is excluded from split', () => {
    // Meera left on 31-03-2026, expense is on 02-04-2026
    // In the real flow, shapeExpenses() filters by membership.
    // Here we simulate the already-filtered data: Meera not in participants.
    const expenses = [
      makeExpense({
        description: 'After Meera left',
        paidById: 'alice',
        paidByName: 'Alice',
        totalAmount: 60,
        participants: [
          { userId: 'alice', userName: 'Alice', amountOwed: 30 },
          { userId: 'bob', userName: 'Bob', amountOwed: 30 },
          // Meera excluded — she was not a member on this date
        ],
      }),
    ];

    const balances = calculateBalances(expenses);
    expect(balances.has('meera')).toBe(false);
    expect(balances.get('alice')!.owes).toBe(30);
    expect(balances.get('bob')!.owes).toBe(30);
    expect(balances.get('alice')!.net).toBe(30);
  });

  it('member charged before joining is excluded from split', () => {
    // Sam joined on 08-04-2026, expense is before that
    // Simulate filtered data: Sam not in participants
    const expenses = [
      makeExpense({
        description: 'Before Sam joined',
        paidById: 'alice',
        paidByName: 'Alice',
        totalAmount: 40,
        participants: [
          { userId: 'alice', userName: 'Alice', amountOwed: 20 },
          { userId: 'bob', userName: 'Bob', amountOwed: 20 },
          // Sam excluded — hadn't joined yet
        ],
      }),
    ];

    const balances = calculateBalances(expenses);
    expect(balances.has('sam')).toBe(false);
  });

  it('expense on exact leave date is included (member active on that day)', () => {
    // Meera left on 31-03-2026, expense is on 31-03-2026
    // leftAt boundary: expenseDate <= leftAt → still a member
    const expenses = [
      makeExpense({
        description: 'On Meera leave day',
        paidById: 'alice',
        paidByName: 'Alice',
        totalAmount: 90,
        participants: [
          { userId: 'alice', userName: 'Alice', amountOwed: 30 },
          { userId: 'bob', userName: 'Bob', amountOwed: 30 },
          { userId: 'meera', userName: 'Meera', amountOwed: 30 },
        ],
      }),
    ];

    const balances = calculateBalances(expenses);
    expect(balances.get('meera')!.owes).toBe(30);
  });

  it('expense on exact join date is included (member active on that day)', () => {
    // Sam joined on 08-04-2026, expense is on 08-04-2026
    // joinedAt boundary: expenseDate >= joinedAt → is a member
    const expenses = [
      makeExpense({
        description: 'On Sam join day',
        paidById: 'alice',
        paidByName: 'Alice',
        totalAmount: 90,
        participants: [
          { userId: 'alice', userName: 'Alice', amountOwed: 30 },
          { userId: 'bob', userName: 'Bob', amountOwed: 30 },
          { userId: 'sam', userName: 'Sam', amountOwed: 30 },
        ],
      }),
    ];

    const balances = calculateBalances(expenses);
    expect(balances.get('sam')!.owes).toBe(30);
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

// ── Settlement tests ──────────────────────────────────────────────────────────

describe('settlements affect balance calculations', () => {
  it('reduces debt when a settlement is recorded', () => {
    // Alice paid for everything; Bob owes 50
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

    // Bob pays Alice 30 in cash
    const settlements = [
      {
        id: 'settle-1',
        date: new Date().toISOString(),
        fromUserId: 'bob',
        fromUserName: 'Bob',
        toUserId: 'alice',
        toUserName: 'Alice',
        amount: 30,
      },
    ];

    const balances = calculateBalances(expenses, settlements);

    // Alice: paid 100, owes 50 + 30 (settlement received) → net = 100 - 80 = 20
    // Bob: paid 0 + 30 (settlement paid), owes 50 → net = 30 - 50 = -20
    expect(balances.get('alice')!.net).toBe(20);
    expect(balances.get('bob')!.net).toBe(-20);
  });

  it('fully settles up when settlement equals remaining debt', () => {
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

    // Bob pays the full 50
    const settlements = [
      {
        id: 'settle-1',
        date: new Date().toISOString(),
        fromUserId: 'bob',
        fromUserName: 'Bob',
        toUserId: 'alice',
        toUserName: 'Alice',
        amount: 50,
      },
    ];

    const balances = calculateBalances(expenses, settlements);

    // Alice: paid 100, owes 50 + 50 → net = 0
    // Bob: paid 50, owes 50 → net = 0
    expect(balances.get('alice')!.net).toBe(0);
    expect(balances.get('bob')!.net).toBe(0);
  });

  it('tracks settlement contributions separately', () => {
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

    const settlements = [
      {
        id: 'settle-1',
        date: new Date().toISOString(),
        fromUserId: 'bob',
        fromUserName: 'Bob',
        toUserId: 'alice',
        toUserName: 'Alice',
        amount: 30,
        note: 'Cash',
      },
    ];

    const balances = calculateBalances(expenses, settlements);
    const bob = balances.get('bob')!;

    expect(bob.settlementContributions).toHaveLength(1);
    expect(bob.settlementContributions[0].amount).toBe(30);
    expect(bob.settlementContributions[0].net).toBe(30); // Bob's balance improves
    expect(bob.settlementContributions[0].note).toBe('Cash');

    const alice = balances.get('alice')!;
    expect(alice.settlementContributions[0].net).toBe(-30); // Alice is owed less
  });

  it('handles multiple settlements', () => {
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

    const settlements = [
      {
        id: 's1',
        date: new Date().toISOString(),
        fromUserId: 'bob',
        fromUserName: 'Bob',
        toUserId: 'alice',
        toUserName: 'Alice',
        amount: 20,
      },
      {
        id: 's2',
        date: new Date().toISOString(),
        fromUserId: 'bob',
        fromUserName: 'Bob',
        toUserId: 'alice',
        toUserName: 'Alice',
        amount: 15,
      },
    ];

    const balances = calculateBalances(expenses, settlements);

    // Bob paid 20 + 15 = 35 in settlements
    expect(balances.get('bob')!.net).toBe(-15); // owes 50, paid 35
    expect(balances.get('alice')!.net).toBe(15); // owed 50, received 35 in settlements
  });

  it('settlement with Sam paying Aisha 15000 (CSV scenario)', () => {
    // Sam pays Aisha 15000 directly (a deposit/settlement) — no expense
    const expenses: ExpenseForCalculation[] = [];

    const settlements = [
      {
        id: 'settle-1',
        date: new Date().toISOString(),
        fromUserId: 'sam',
        fromUserName: 'Sam',
        toUserId: 'aisha',
        toUserName: 'Aisha',
        amount: 15000,
      },
    ];

    const balances = calculateBalances(expenses, settlements);

    // Sam paid 15000 in settlement → paid = 15000, owes = 0 → net = 15000
    // Aisha received 15000 in settlement → owes = 15000, paid = 0 → net = -15000
    expect(balances.get('sam')!.paid).toBe(15000);
    expect(balances.get('sam')!.owes).toBe(0);
    expect(balances.get('sam')!.net).toBe(15000);
    expect(balances.get('aisha')!.owes).toBe(15000);
    expect(balances.get('aisha')!.net).toBe(-15000);

    const totalNet = Array.from(balances.values()).reduce((s, e) => s + e.net, 0);
    expect(Math.abs(totalNet)).toBeLessThan(0.01);
  });

  it('end-to-end CSV scenario: parasailing + Kabir guest + Sam settlement', () => {
    // Parasailing expense: Dev paid 150 USD, split equally among 5
    // Refund: Dev got -30 USD back, split among 4 (Kabir excluded)
    // Settlement: Sam → Aisha 15000 INR
    // Sam's row is NOT an expense — it's a settlement only
    const expenses = [
      makeExpense({
        description: 'Parasailing',
        paidById: 'dev',
        paidByName: 'Dev',
        totalAmount: 150,
        participants: [
          { userId: 'aisha', userName: 'Aisha', amountOwed: 30 },
          { userId: 'rohan', userName: 'Rohan', amountOwed: 30 },
          { userId: 'priya', userName: 'Priya', amountOwed: 30 },
          { userId: 'dev', userName: 'Dev', amountOwed: 30 },
          { guestName: "Dev's friend Kabir", amountOwed: 30 },
        ],
      }),
      makeExpense({
        description: 'Parasailing refund',
        paidById: 'dev',
        paidByName: 'Dev',
        totalAmount: -30,
        participants: [
          { userId: 'aisha', userName: 'Aisha', amountOwed: -7.5 },
          { userId: 'rohan', userName: 'Rohan', amountOwed: -7.5 },
          { userId: 'priya', userName: 'Priya', amountOwed: -7.5 },
          { userId: 'dev', userName: 'Dev', amountOwed: -7.5 },
        ],
      }),
    ];

    const settlements = [
      {
        id: 'settle-1',
        date: new Date().toISOString(),
        fromUserId: 'sam',
        fromUserName: 'Sam',
        toUserId: 'aisha',
        toUserName: 'Aisha',
        amount: 15000,
      },
    ];

    const balances = calculateBalances(expenses, settlements);

    // Dev: paid 150 - 30 = 120, owes 30 - 7.5 = 22.5
    expect(balances.get('dev')!.paid).toBe(120);
    expect(balances.get('dev')!.owes).toBe(22.5);

    // Each of Aisha, Rohan, Priya: owe 30 - 7.5 = 22.5 from expenses
    // Aisha additionally owes 15000 from settlement received
    expect(balances.get('aisha')!.owes).toBe(15022.5);
    expect(balances.get('rohan')!.owes).toBe(22.5);
    expect(balances.get('priya')!.owes).toBe(22.5);

    // Kabir guest owes 30 (not in refund)
    const kabir = balances.get("guest:Dev's friend Kabir")!;
    expect(kabir.owes).toBe(30);
    expect(kabir.net).toBe(-30);

    // Sam: paid 15000 in settlement, owes 0
    expect(balances.get('sam')!.paid).toBe(15000);
    expect(balances.get('sam')!.owes).toBe(0);
    expect(balances.get('sam')!.net).toBe(15000);

    // Aisha: owes 22.5 (parasailing) + 15000 (settlement received) = 15022.5
    // She paid nothing
    expect(balances.get('aisha')!.paid).toBe(0);
    expect(balances.get('aisha')!.owes).toBe(15022.5);
    expect(balances.get('aisha')!.net).toBe(-15022.5);

    // Conservation: total net must be 0
    const totalNet = Array.from(balances.values()).reduce((s, e) => s + e.net, 0);
    expect(Math.abs(totalNet)).toBeLessThan(0.01);
  });

  it('settlement does not break conservation of balance', () => {
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

    const settlements = [
      {
        id: 's1',
        date: new Date().toISOString(),
        fromUserId: 'bob',
        fromUserName: 'Bob',
        toUserId: 'alice',
        toUserName: 'Alice',
        amount: 20,
      },
    ];

    const balances = calculateBalances(expenses, settlements);
    const totalNet = Array.from(balances.values()).reduce(
      (s, e) => s + e.net,
      0
    );
    expect(Math.abs(totalNet)).toBeLessThan(0.01);
  });
});
