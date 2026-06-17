import { describe, it, expect } from 'vitest';
import {
  AnomalyDetector,
  CSVRow,
  GroupMemberInfo,
  UserAliasInfo,
  DuplicateExpenseRule,
  InconsistentNameRule,
  MissingPayerRule,
  SettlementAsExpenseRule,
  MissingCurrencyRule,
  CurrencyConversionRule,
  NegativeAmountRule,
  InvalidDateRule,
  AmbiguousDateRule,
  SplitInconsistencyRule,
  MembershipViolationRule,
  GuestParticipantRule
} from '../utils/csvImport/anomalyDetector';

describe('CSV Import Anomaly Detection Rules', () => {
  const members: GroupMemberInfo[] = [
    { userId: 'u1', name: 'Alice', email: 'alice@example.com', joinedAt: new Date('2024-01-01'), leftAt: null },
    { userId: 'u2', name: 'Bob', email: 'bob@example.com', joinedAt: new Date('2024-01-01'), leftAt: new Date('2024-02-01') },
    { userId: 'u3', name: 'Carol', email: 'carol@example.com', joinedAt: new Date('2024-01-10'), leftAt: null },
    { userId: 'u4', name: 'Priya', email: 'priya@example.com', joinedAt: new Date('2024-01-01'), leftAt: null },
    { userId: 'u5', name: 'Priya Sharma', email: 'priyasharma@example.com', joinedAt: new Date('2024-01-01'), leftAt: null }
  ];

  const aliases: UserAliasInfo[] = [
    { userId: 'u1', alias: 'Alice Alias' },
    { userId: 'u4', alias: 'priya s' }
  ];

  const existingExpenses = [
    { description: 'Dinner at Marina Bites', amount: 1500, date: new Date('2024-01-15'), paidById: 'u1' }
  ];

  const detector = new AnomalyDetector();

  // 1. Duplicate expense entries
  describe('DuplicateExpenseRule', () => {
    it('detects fuzzy match duplicates within the CSV', () => {
      const rows: CSVRow[] = [
        { date: '2024-01-15', description: 'Dinner at Marina Bites', amount: '1500', paidBy: 'Alice', participants: 'Alice,Bob' },
        { date: '2024-01-15', description: 'dinner - marina bites', amount: '1500', paidBy: 'Alice', participants: 'Alice,Bob' }
      ];

      const anomalies1 = detector.detectAnomalies({
        row: rows[0],
        rowNumber: 2,
        allRows: rows,
        groupMembers: members,
        userAliases: aliases,
        existingExpenses
      });
      const anomalies2 = detector.detectAnomalies({
        row: rows[1],
        rowNumber: 3,
        allRows: rows,
        groupMembers: members,
        userAliases: aliases,
        existingExpenses
      });

      const dupAnomaly = anomalies2.find(a => a.anomalyType === 'DUPLICATE_EXPENSE');
      expect(dupAnomaly).toBeDefined();
      expect(dupAnomaly?.severity).toBe('WARNING');
      expect(dupAnomaly?.canAutoFix).toBe(false);
    });

    it('detects duplicate against database expenses', () => {
      const rows: CSVRow[] = [
        { date: '2024-01-15', description: 'dinner - marina bites', amount: '1500', paidBy: 'alice@example.com', participants: 'Alice,Bob' }
      ];

      const anomalies = detector.detectAnomalies({
        row: rows[0],
        rowNumber: 2,
        allRows: rows,
        groupMembers: members,
        userAliases: aliases,
        existingExpenses
      });

      const dupAnomaly = anomalies.find(a => a.anomalyType === 'DUPLICATE_EXPENSE');
      expect(dupAnomaly).toBeDefined();
      expect(dupAnomaly?.message).toContain('duplicate of existing expense');
    });
  });

  // 2. Inconsistent user name formats
  describe('InconsistentNameRule', () => {
    it('normalizes casing and suggests auto-fix', () => {
      const context = {
        row: { date: '2024-01-15', description: 'Lunch', amount: '200', paidBy: 'alice', participants: 'Alice,Bob' },
        rowNumber: 2,
        allRows: [],
        groupMembers: members,
        userAliases: aliases
      };

      const anomalies = detector.detectAnomalies(context as any);
      const nameAnomaly = anomalies.find(a => a.anomalyType === 'INCONSISTENT_NAME');
      expect(nameAnomaly).toBeDefined();
      expect(nameAnomaly?.suggestedValue).toBe('Alice');
      expect(nameAnomaly?.canAutoFix).toBe(true);
    });

    it('resolves alias names and suggests auto-fix', () => {
      const context = {
        row: { date: '2024-01-15', description: 'Lunch', amount: '200', paidBy: 'Priya S', participants: 'Alice,Bob' },
        rowNumber: 2,
        allRows: [],
        groupMembers: members,
        userAliases: aliases
      };

      const anomalies = detector.detectAnomalies(context as any);
      const nameAnomaly = anomalies.find(a => a.anomalyType === 'INCONSISTENT_NAME');
      expect(nameAnomaly).toBeDefined();
      expect(nameAnomaly?.suggestedValue).toBe('Priya');
      expect(nameAnomaly?.canAutoFix).toBe(true);
    });

    it('flags ambiguous name formats and requires user confirmation', () => {
      const context = {
        row: { date: '2024-01-15', description: 'Lunch', amount: '200', paidBy: 'pri', participants: 'Alice,Bob' },
        rowNumber: 2,
        allRows: [],
        groupMembers: members,
        userAliases: aliases
      };

      const anomalies = detector.detectAnomalies(context as any);
      const nameAnomaly = anomalies.find(a => a.anomalyType === 'INCONSISTENT_NAME');
      expect(nameAnomaly).toBeDefined();
      expect(nameAnomaly?.canAutoFix).toBe(false); // requires confirmation because Priya and Priya Sharma both match 'pri'
    });
  });

  // 3. Missing payer
  describe('MissingPayerRule', () => {
    it('blocks import for missing payer', () => {
      const context = {
        row: { date: '2024-01-15', description: 'Lunch', amount: '200', paidBy: '', participants: 'Alice,Bob' },
        rowNumber: 2,
        allRows: [],
        groupMembers: members,
        userAliases: aliases
      };

      const anomalies = detector.detectAnomalies(context as any);
      const payerAnomaly = anomalies.find(a => a.anomalyType === 'MISSING_PAYER');
      expect(payerAnomaly).toBeDefined();
      expect(payerAnomaly?.severity).toBe('ERROR');
      expect(payerAnomaly?.canAutoFix).toBe(false);
    });
  });

  // 4. Settlement incorrectly logged as expense
  describe('SettlementAsExpenseRule', () => {
    it('flags settlement keyword and requires user review', () => {
      const context = {
        row: { date: '2024-01-15', description: 'Rohan paid Aisha back', amount: '200', paidBy: 'Alice', participants: 'Alice,Bob' },
        rowNumber: 2,
        allRows: [],
        groupMembers: members,
        userAliases: aliases
      };

      const anomalies = detector.detectAnomalies(context as any);
      const settleAnomaly = anomalies.find(a => a.anomalyType === 'SETTLEMENT_AS_EXPENSE');
      expect(settleAnomaly).toBeDefined();
      expect(settleAnomaly?.severity).toBe('WARNING');
      expect(settleAnomaly?.canAutoFix).toBe(false);
    });
  });

  // 5 & 10. Missing currency
  describe('MissingCurrencyRule', () => {
    it('defaults missing currency to INR', () => {
      const context = {
        row: { date: '2024-01-15', description: 'Lunch', amount: '200', paidBy: 'Alice', participants: 'Alice,Bob', currency: '' },
        rowNumber: 2,
        allRows: [],
        groupMembers: members,
        userAliases: aliases
      };

      const anomalies = detector.detectAnomalies(context as any);
      const currencyAnomaly = anomalies.find(a => a.anomalyType === 'MISSING_CURRENCY');
      expect(currencyAnomaly).toBeDefined();
      expect(currencyAnomaly?.suggestedValue).toBe('INR');
      expect(currencyAnomaly?.canAutoFix).toBe(true);
    });
  });

  // 6. USD vs INR inconsistency
  describe('CurrencyConversionRule', () => {
    it('detects USD and suggests conversion using exchange rate', () => {
      const context = {
        row: { date: '2024-01-15', description: 'Goa villa booking', amount: '100', paidBy: 'Alice', participants: 'Alice,Bob', currency: 'USD' },
        rowNumber: 2,
        allRows: [],
        groupMembers: members,
        userAliases: aliases
      };

      const anomalies = detector.detectAnomalies(context as any);
      const convertAnomaly = anomalies.find(a => a.anomalyType === 'CURRENCY_CONVERSION');
      expect(convertAnomaly).toBeDefined();
      expect(convertAnomaly?.suggestedValue).toBe('8300.00'); // 100 * 83.00
      expect(convertAnomaly?.canAutoFix).toBe(true);
    });
  });

  // 7. Negative amounts (refunds)
  describe('NegativeAmountRule', () => {
    it('auto-fixes negative amounts with refund keyword in description', () => {
      const context = {
        row: { date: '2024-01-15', description: 'Parasailing refund', amount: '-30', paidBy: 'Alice', participants: 'Alice,Bob' },
        rowNumber: 2,
        allRows: [],
        groupMembers: members,
        userAliases: aliases
      };

      const anomalies = detector.detectAnomalies(context as any);
      const negAnomaly = anomalies.find(a => a.anomalyType === 'NEGATIVE_AMOUNT');
      expect(negAnomaly).toBeDefined();
      expect(negAnomaly?.suggestedValue).toBe('30');
      expect(negAnomaly?.canAutoFix).toBe(true);
    });

    it('auto-fixes negative amounts with refund keyword in notes', () => {
      const context = {
        row: { date: '2024-01-15', description: 'Parasailing', amount: '-30', paidBy: 'Dev', participants: 'Alice,Bob', notes: 'one slot got cancelled' },
        rowNumber: 2,
        allRows: [],
        groupMembers: members,
        userAliases: aliases
      };

      const anomalies = detector.detectAnomalies(context as any);
      const negAnomaly = anomalies.find(a => a.anomalyType === 'NEGATIVE_AMOUNT');
      expect(negAnomaly).toBeDefined();
      expect(negAnomaly?.canAutoFix).toBe(true);
    });

    it('flags negative amounts without refund keywords as requiring user review', () => {
      const context = {
        row: { date: '2024-01-15', description: 'Misc charge', amount: '-50', paidBy: 'Alice', participants: 'Alice,Bob' },
        rowNumber: 2,
        allRows: [],
        groupMembers: members,
        userAliases: aliases
      };

      const anomalies = detector.detectAnomalies(context as any);
      const negAnomaly = anomalies.find(a => a.anomalyType === 'NEGATIVE_AMOUNT');
      expect(negAnomaly).toBeDefined();
      expect(negAnomaly?.suggestedValue).toBe('50');
      expect(negAnomaly?.canAutoFix).toBe(false);
    });
  });

  // 8. Invalid or inconsistent date formats
  describe('InvalidDateRule', () => {
    it('parses MMM-DD (e.g. Mar-14) successfully', () => {
      const context = {
        row: { date: 'Mar-14', description: 'Lunch', amount: '200', paidBy: 'Alice', participants: 'Alice,Bob' },
        rowNumber: 2,
        allRows: [{ date: '2024-01-15', description: 'Context', amount: '1', paidBy: 'A' }], // to extract 2024 year
        groupMembers: members,
        userAliases: aliases
      };

      const anomalies = detector.detectAnomalies(context as any);
      const dateAnomaly = anomalies.find(a => a.anomalyType === 'INVALID_DATE');
      expect(dateAnomaly).toBeUndefined(); // should parse successfully
    });

    it('flags completely invalid date formats', () => {
      const context = {
        row: { date: 'invalid-date', description: 'Lunch', amount: '200', paidBy: 'Alice', participants: 'Alice,Bob' },
        rowNumber: 2,
        allRows: [],
        groupMembers: members,
        userAliases: aliases
      };

      const anomalies = detector.detectAnomalies(context as any);
      const dateAnomaly = anomalies.find(a => a.anomalyType === 'INVALID_DATE');
      expect(dateAnomaly).toBeDefined();
      expect(dateAnomaly?.severity).toBe('ERROR');
    });
  });

  // 9. Ambiguous date formats
  describe('AmbiguousDateRule', () => {
    it('detects ambiguous date locale formats', () => {
      const context = {
        row: { date: '04/05/2026', description: 'Lunch', amount: '200', paidBy: 'Alice', participants: 'Alice,Bob' },
        rowNumber: 2,
        allRows: [],
        groupMembers: members,
        userAliases: aliases
      };

      const anomalies = detector.detectAnomalies(context as any);
      const dateAnomaly = anomalies.find(a => a.anomalyType === 'AMBIGUOUS_DATE');
      expect(dateAnomaly).toBeDefined();
      expect(dateAnomaly?.severity).toBe('WARNING');
      expect(dateAnomaly?.canAutoFix).toBe(false);
    });
  });

  // 11. Split type vs split details mismatch
  describe('SplitInconsistencyRule', () => {
    it('ignores details and keeps splitType source of truth', () => {
      const context = {
        row: { date: '2024-01-15', description: 'Lunch', amount: '200', paidBy: 'Alice', participants: 'Alice,Bob', splitType: 'EQUAL', participantShares: '100,100' },
        rowNumber: 2,
        allRows: [],
        groupMembers: members,
        userAliases: aliases
      };

      const anomalies = detector.detectAnomalies(context as any);
      const splitAnomaly = anomalies.find(a => a.anomalyType === 'SPLIT_INCONSISTENCY');
      expect(splitAnomaly).toBeDefined();
      expect(splitAnomaly?.suggestedValue).toBe(''); // clearing inconsistent detail
      expect(splitAnomaly?.canAutoFix).toBe(true);
    });
  });

  // 12. Membership violations (joined/left timeline issues)
  describe('MembershipViolationRule', () => {
    it('excludes Sam who has not joined group yet', () => {
      const samMember: GroupMemberInfo = { userId: 'u6', name: 'Sam', email: 'sam@example.com', joinedAt: new Date('2024-02-01'), leftAt: null };
      const context = {
        row: { date: '2024-01-15', description: 'Lunch', amount: '300', paidBy: 'Alice', participants: 'Alice,Bob,Sam' },
        rowNumber: 2,
        allRows: [],
        groupMembers: [...members, samMember],
        userAliases: aliases
      };

      const anomalies = detector.detectAnomalies(context as any);
      const membershipAnomaly = anomalies.find(a => a.anomalyType === 'INVALID_MEMBER_FOR_DATE');
      expect(membershipAnomaly).toBeDefined();
      expect(membershipAnomaly?.suggestedValue).toBe('Alice,Bob'); // Sam excluded because date is before he joined
    });

    it('excludes Meera after she leaves the group', () => {
      const meeraMember: GroupMemberInfo = { userId: 'u7', name: 'Meera', email: 'meera@example.com', joinedAt: new Date('2024-01-01'), leftAt: new Date('2024-01-10') };
      const context = {
        row: { date: '2024-01-15', description: 'Lunch', amount: '300', paidBy: 'Alice', participants: 'Alice,Meera' },
        rowNumber: 2,
        allRows: [],
        groupMembers: [...members, meeraMember],
        userAliases: aliases
      };

      const anomalies = detector.detectAnomalies(context as any);
      const membershipAnomaly = anomalies.find(a => a.anomalyType === 'INVALID_MEMBER_FOR_DATE');
      expect(membershipAnomaly).toBeDefined();
      expect(membershipAnomaly?.suggestedValue).toBe('Alice'); // Meera excluded because date is after she left
    });
  });
});
