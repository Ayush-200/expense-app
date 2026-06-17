/**
 * CSV Import Anomaly Detection System
 * 
 * Rules to detect and resolve the 12 specified data quality issues in expense CSV imports.
 */

export type AnomalySeverity = 'ERROR' | 'WARNING' | 'INFO';

export type AnomalyType =
  | 'DUPLICATE_EXPENSE'          // Problem 1
  | 'INCONSISTENT_NAME'          // Problem 2
  | 'MISSING_PAYER'              // Problem 3
  | 'SETTLEMENT_AS_EXPENSE'      // Problem 4
  | 'MISSING_CURRENCY'           // Problem 5 & 10
  | 'CURRENCY_CONVERSION'        // Problem 6
  | 'NEGATIVE_AMOUNT'            // Problem 7 (Refunds)
  | 'INVALID_DATE'               // Problem 8
  | 'AMBIGUOUS_DATE'             // Problem 9
  | 'SPLIT_INCONSISTENCY'        // Problem 11
  | 'INVALID_MEMBER_FOR_DATE'    // Problem 12
  | 'GUEST_PARTICIPANT'          // Problem 2 helper
  | 'PAYER_NOT_MEMBER'           // Payer not a group member
  | 'PERCENTAGE_MISMATCH'        // Percentage values don't sum to 100

export interface Anomaly {
  rowNumber: number;
  severity: AnomalySeverity;
  anomalyType: AnomalyType;
  field?: string;
  message: string;
  originalValue?: string;
  suggestedValue?: string;
  canAutoFix: boolean;
}

export interface CSVRow {
  date: string;
  description: string;
  paidBy: string;
  amount: string;
  currency?: string;
  splitType?: string;
  participants?: string; // Comma-separated names/emails
  participantShares?: string; // Comma-separated values for percentage/exact/shares
  [key: string]: any;
}

export interface GroupMemberInfo {
  userId: string;
  name: string;
  email: string;
  joinedAt: Date;
  leftAt: Date | null;
}

export interface UserAliasInfo {
  userId: string;
  alias: string;
}

export interface DetectionContext {
  row: CSVRow;
  rowNumber: number;
  allRows: CSVRow[];
  groupMembers: GroupMemberInfo[];
  userAliases: UserAliasInfo[];
  existingExpenses?: Array<{ description: string; amount: number; date: Date; paidById: string }>;
}

// ── Base Anomaly Rule Interface ────────────────────────────────────────────────

export interface AnomalyRule {
  detect(context: DetectionContext): Anomaly | null;
}

const logger = {
  info: (msg: string, data?: any) => console.log(`[CSV Import] ${msg}`, data ?? ''),
  warn: (msg: string, data?: any) => console.warn(`[CSV Import] ${msg}`, data ?? ''),
  error: (msg: string, data?: any) => console.error(`[CSV Import] ${msg}`, data ?? ''),
};

export function parseAmount(value: string): number {
  return parseFloat(value.replace(/,/g, ''));
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Calculates string similarity using Levenshtein Distance.
 * Returns a value between 0.0 (no match) and 1.0 (exact match).
 */
export function getSimilarity(s1: string, s2: string): number {
  const len1 = s1.length;
  const len2 = s2.length;
  const maxLen = Math.max(len1, len2);
  if (maxLen === 0) return 1.0;
  
  const track = Array(len2 + 1).fill(null).map(() => Array(len1 + 1).fill(null));
  for (let i = 0; i <= len1; i += 1) track[0][i] = i;
  for (let j = 0; j <= len2; j += 1) track[j][0] = j;
  for (let j = 1; j <= len2; j += 1) {
    for (let i = 1; i <= len1; i += 1) {
      const indicator = s1[i - 1] === s2[j - 1] ? 0 : 1;
      track[j][i] = Math.min(
        track[j][i - 1] + 1, // deletion
        track[j - 1][i] + 1, // insertion
        track[j - 1][i - 1] + indicator // substitution
      );
    }
  }
  return (maxLen - track[len2][len1]) / maxLen;
}

/**
 * Robust date parser supporting YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY, DD-MM-YYYY, Mar-14, etc.
 */
export function parseDateStr(dateStr: string, allRows?: CSVRow[]): { date: Date; isAmbiguous: boolean } | null {
  if (!dateStr) return null;
  const cleaned = dateStr.trim();

  // 1. Try ISO format YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    const d = new Date(cleaned);
    if (!isNaN(d.getTime())) return { date: d, isAmbiguous: false };
  }

  // Helper to resolve year from context if missing
  const resolveYear = (): number => {
    if (allRows) {
      for (const r of allRows) {
        if (r.date && r.date !== dateStr) {
          const m = r.date.match(/\b(20\d{2})\b/);
          if (m) return parseInt(m[1], 10);
        }
      }
    }
    return 2026; // Default fallback to current year
  };

  // 2. Try DD-MM-YYYY or MM-DD-YYYY
  const dashMatch = cleaned.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dashMatch) {
    const [, first, second, yearStr] = dashMatch;
    const val1 = parseInt(first, 10);
    const val2 = parseInt(second, 10);
    const y = parseInt(yearStr, 10);
    
    if (val1 <= 12 && val2 <= 12) {
      const d = new Date(Date.UTC(y, val2 - 1, val1)); // Default to DD-MM-YYYY
      return { date: d, isAmbiguous: true };
    }
    if (val1 > 12 && val2 <= 12) {
      const d = new Date(Date.UTC(y, val2 - 1, val1)); // DD-MM-YYYY
      return { date: d, isAmbiguous: false };
    }
    if (val2 > 12 && val1 <= 12) {
      const d = new Date(Date.UTC(y, val1 - 1, val2)); // MM-DD-YYYY
      return { date: d, isAmbiguous: false };
    }
  }

  // 3. Try DD/MM/YYYY or MM/DD/YYYY
  const slashMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, first, second, yearStr] = slashMatch;
    const val1 = parseInt(first, 10);
    const val2 = parseInt(second, 10);
    const y = parseInt(yearStr, 10);
    
    if (val1 <= 12 && val2 <= 12) {
      const d = new Date(Date.UTC(y, val2 - 1, val1)); // Default to DD/MM/YYYY
      return { date: d, isAmbiguous: true };
    }
    if (val1 > 12 && val2 <= 12) {
      const d = new Date(Date.UTC(y, val2 - 1, val1)); // DD/MM/YYYY
      return { date: d, isAmbiguous: false };
    }
    if (val2 > 12 && val1 <= 12) {
      const d = new Date(Date.UTC(y, val1 - 1, val2)); // MM/DD/YYYY
      return { date: d, isAmbiguous: false };
    }
  }

  // 4. Try formats like "Mar-14" or "Mar 14"
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const monthRegex = new RegExp(`^(${months.join('|')})[- ](\\d{1,2})$`, 'i');
  const monthMatch = cleaned.match(monthRegex);
  if (monthMatch) {
    const [, monthStr, dayStr] = monthMatch;
    const monthIndex = months.indexOf(monthStr.toLowerCase());
    const day = parseInt(dayStr, 10);
    const year = resolveYear();
    const d = new Date(Date.UTC(year, monthIndex, day));
    if (!isNaN(d.getTime())) return { date: d, isAmbiguous: false };
  }

  // 5. Fallback Javascript parsing
  const d = new Date(cleaned);
  if (!isNaN(d.getTime())) {
    return { date: d, isAmbiguous: false };
  }

  return null;
}

/**
 * Resolves a name or email against group members and alias table
 */
export function resolveMemberName(
  input: string,
  groupMembers: GroupMemberInfo[],
  userAliases: UserAliasInfo[]
): { member: GroupMemberInfo | null; status: 'EXACT' | 'CASE_MISMATCH' | 'ALIAS_MATCH' | 'AMBIGUOUS' | 'UNKNOWN'; candidates?: GroupMemberInfo[] } {
  const clean = input.trim();
  const normalized = clean.toLowerCase();

  // 1. Exact match (case-sensitive)
  const exact = groupMembers.find(m => m.name === clean || m.email.toLowerCase() === normalized);
  if (exact) return { member: exact, status: 'EXACT' };

  // 2. Case mismatch
  const caseMismatch = groupMembers.find(m => m.name.toLowerCase() === normalized);
  if (caseMismatch) return { member: caseMismatch, status: 'CASE_MISMATCH' };

  // 3. Alias match
  const alias = userAliases.find(a => a.alias.toLowerCase() === normalized);
  if (alias) {
    const m = groupMembers.find(gm => gm.userId === alias.userId);
    if (m) return { member: m, status: 'ALIAS_MATCH' };
  }

  // 4. Ambiguous partial match
  const candidates = groupMembers.filter(m => {
    const mn = m.name.toLowerCase();
    return mn.includes(normalized) || normalized.includes(mn);
  });
  if (candidates.length > 0) {
    return { member: candidates[0], status: 'AMBIGUOUS', candidates };
  }

  return { member: null, status: 'UNKNOWN' };
}

// ── Anomaly Rule Implementations ───────────────────────────────────────────────

/**
 * 1. Duplicate expense entries
 */
export class DuplicateExpenseRule implements AnomalyRule {
  detect(context: DetectionContext): Anomaly | null {
    const amount = parseAmount(context.row.amount);
    const desc = context.row.description?.trim().toLowerCase();
    const payer = context.row.paidBy?.trim().toLowerCase();
    const parsedDateResult = parseDateStr(context.row.date, context.allRows);

    if (isNaN(amount) || !desc || !payer || !parsedDateResult) return null;
    const date = parsedDateResult.date;

    const isFuzzyMatch = (s1: string, s2: string) => getSimilarity(s1, s2) >= 0.8;

    // 1. Check against other rows in the CSV (only check earlier rows to avoid double flagging)
    for (let i = 0; i < context.allRows.length; i++) {
      const otherRowNumber = i + 2;
      if (otherRowNumber >= context.rowNumber) continue;

      const other = context.allRows[i];
      const otherAmount = parseAmount(other.amount);
      const otherDesc = other.description?.trim().toLowerCase();
      const otherPayer = other.paidBy?.trim().toLowerCase();
      const otherDateResult = parseDateStr(other.date, context.allRows);

      if (isNaN(otherAmount) || !otherDesc || !otherPayer || !otherDateResult) continue;

      const timeDiff = Math.abs(otherDateResult.date.getTime() - date.getTime());
      const dayInMs = 24 * 60 * 60 * 1000;

      if (
        timeDiff <= dayInMs &&
        Math.abs(otherAmount - amount) < 0.01 &&
        otherPayer === payer &&
        isFuzzyMatch(otherDesc, desc)
      ) {
        return {
          rowNumber: context.rowNumber,
          severity: 'WARNING',
          anomalyType: 'DUPLICATE_EXPENSE',
          message: `Possible duplicate of row ${otherRowNumber}: "${other.description}" (${other.amount})`,
          originalValue: context.row.description,
          canAutoFix: false,
        };
      }
    }

    // 2. Check against database expenses
    if (context.existingExpenses) {
      for (const e of context.existingExpenses) {
        const timeDiff = Math.abs(e.date.getTime() - date.getTime());
        const dayInMs = 24 * 60 * 60 * 1000;

        const dbPayerMember = context.groupMembers.find(m => m.userId === e.paidById);
        const dbPayerName = dbPayerMember?.name.toLowerCase();
        const dbPayerEmail = dbPayerMember?.email.toLowerCase();

        const payerIsMatch =
          dbPayerName === payer ||
          dbPayerEmail === payer ||
          (dbPayerName && payer.includes(dbPayerName)) ||
          (dbPayerEmail && payer.includes(dbPayerEmail));

        if (
          timeDiff <= dayInMs &&
          Math.abs(e.amount - amount) < 0.01 &&
          payerIsMatch &&
          isFuzzyMatch(e.description.toLowerCase(), desc)
        ) {
          return {
            rowNumber: context.rowNumber,
            severity: 'WARNING',
            anomalyType: 'DUPLICATE_EXPENSE',
            message: `Possible duplicate of existing expense: "${e.description}" (${e.amount})`,
            originalValue: context.row.description,
            canAutoFix: false,
          };
        }
      }
    }

    return null;
  }
}

/**
 * 2. Inconsistent user name formats
 */
export class InconsistentNameRule implements AnomalyRule {
  detect(context: DetectionContext): Anomaly | null {
    const rawPayer = context.row.paidBy?.trim();
    if (!rawPayer) return null;

    const res = resolveMemberName(rawPayer, context.groupMembers, context.userAliases);

    if (res.status === 'CASE_MISMATCH' && res.member) {
      return {
        rowNumber: context.rowNumber,
        severity: 'WARNING',
        anomalyType: 'INCONSISTENT_NAME',
        field: 'paidBy',
        message: `Payer name "${rawPayer}" should be normalized to "${res.member.name}"`,
        originalValue: rawPayer,
        suggestedValue: res.member.name,
        canAutoFix: true,
      };
    }

    if (res.status === 'ALIAS_MATCH' && res.member) {
      return {
        rowNumber: context.rowNumber,
        severity: 'WARNING',
        anomalyType: 'INCONSISTENT_NAME',
        field: 'paidBy',
        message: `Payer alias "${rawPayer}" mapped to group member "${res.member.name}"`,
        originalValue: rawPayer,
        suggestedValue: res.member.name,
        canAutoFix: true,
      };
    }

    if (res.status === 'AMBIGUOUS' && res.candidates) {
      return {
        rowNumber: context.rowNumber,
        severity: 'WARNING',
        anomalyType: 'INCONSISTENT_NAME',
        field: 'paidBy',
        message: `Ambiguous payer name "${rawPayer}". Possible matches: ${res.candidates.map(c => c.name).join(', ')}`,
        originalValue: rawPayer,
        suggestedValue: res.candidates[0].name,
        canAutoFix: false,
      };
    }

    return null;
  }
}

/**
 * 3. Missing payer
 */
export class MissingPayerRule implements AnomalyRule {
  detect(context: DetectionContext): Anomaly | null {
    if (!context.row.paidBy || context.row.paidBy.trim() === '') {
      return {
        rowNumber: context.rowNumber,
        severity: 'ERROR',
        anomalyType: 'MISSING_PAYER',
        field: 'paidBy',
        message: 'Missing payer name - expense cannot be imported',
        originalValue: context.row.paidBy,
        canAutoFix: false,
      };
    }
    return null;
  }
}

/**
 * 3b. Payer not a group member
 */
export class PayerNotMemberRule implements AnomalyRule {
  detect(context: DetectionContext): Anomaly | null {
    if (!context.row.paidBy || context.row.paidBy.trim() === '') return null;

    const resolved = resolveMemberName(context.row.paidBy, context.groupMembers, context.userAliases);
    if (resolved.status === 'UNKNOWN') {
      return {
        rowNumber: context.rowNumber,
        severity: 'ERROR',
        anomalyType: 'PAYER_NOT_MEMBER',
        field: 'paidBy',
        message: `Payer "${context.row.paidBy}" is not a member of this group — please add them to the group first, then re-upload`,
        originalValue: context.row.paidBy,
        canAutoFix: false,
      };
    }
    return null;
  }
}

/**
 * 4. Settlement incorrectly logged as expense
 */
export class SettlementAsExpenseRule implements AnomalyRule {
  detect(context: DetectionContext): Anomaly | null {
    const desc = context.row.description?.toLowerCase() || '';
    const keywords = ['repaid', 'settlement', 'payback', 'reimbursement', 'repayment', 'deposit'];

    const isMatch = keywords.some(kw => desc.includes(kw)) || (desc.includes('paid') && desc.includes('back'));

    if (isMatch) {
      return {
        rowNumber: context.rowNumber,
        severity: 'WARNING',
        anomalyType: 'SETTLEMENT_AS_EXPENSE',
        field: 'description',
        message: `Description contains settlement keywords. Convert to a settlement record instead?`,
        originalValue: context.row.description,
        canAutoFix: false,
      };
    }
    return null;
  }
}

/**
 * 5 & 10. Missing or inconsistent currency
 */
export class MissingCurrencyRule implements AnomalyRule {
  detect(context: DetectionContext): Anomaly | null {
    if (!context.row.currency || context.row.currency.trim() === '') {
      return {
        rowNumber: context.rowNumber,
        severity: 'WARNING',
        anomalyType: 'MISSING_CURRENCY',
        field: 'currency',
        message: 'Missing currency - defaulting to INR',
        originalValue: context.row.currency,
        suggestedValue: 'INR',
        canAutoFix: true,
      };
    }
    return null;
  }
}

/**
 * 6. USD vs INR inconsistency
 */
export class CurrencyConversionRule implements AnomalyRule {
  detect(context: DetectionContext): Anomaly | null {
    const currency = context.row.currency?.trim().toUpperCase();
    if (currency && currency !== 'INR') {
      const amount = parseAmount(context.row.amount);
      if (isNaN(amount)) return null;

      const rate = 83.00; // default exchange rate
      const converted = (amount * rate).toFixed(2);

      return {
        rowNumber: context.rowNumber,
        severity: 'INFO',
        anomalyType: 'CURRENCY_CONVERSION',
        field: 'currency',
        message: `Non-INR currency "${currency}" detected. Convert to INR using rate ${rate}?`,
        originalValue: currency,
        suggestedValue: converted, // store suggested converted amount
        canAutoFix: true,
      };
    }
    return null;
  }
}

/**
 * 7. Negative amounts (refunds)
 */
const REFUND_KEYWORDS = ['refund', 'cancelled', 'canceled', 'reimbursement'];

export class NegativeAmountRule implements AnomalyRule {
  detect(context: DetectionContext): Anomaly | null {
    const amount = parseAmount(context.row.amount);
    if (isNaN(amount)) return null;
    if (amount >= 0) return null;

    const text = `${context.row.description || ''} ${context.row.notes || ''}`.toLowerCase();
    const hasRefundKeyword = REFUND_KEYWORDS.some(kw => text.includes(kw));

    return {
      rowNumber: context.rowNumber,
      severity: 'INFO',
      anomalyType: 'NEGATIVE_AMOUNT',
      field: 'amount',
      message: hasRefundKeyword
        ? `Negative amount (${amount}) detected as a refund. Will be processed as REFUND_TRANSACTION.`
        : `Negative amount (${amount}) found. If this is a refund, add "refund" to the description or notes for auto-classification.`,
      originalValue: context.row.amount,
      suggestedValue: Math.abs(amount).toString(),
      canAutoFix: hasRefundKeyword,
    };
  }
}

/**
 * 8. Invalid or inconsistent date formats
 */
export class InvalidDateRule implements AnomalyRule {
  detect(context: DetectionContext): Anomaly | null {
    const dateStr = context.row.date;
    if (!dateStr || dateStr.trim() === '') {
      return {
        rowNumber: context.rowNumber,
        severity: 'ERROR',
        anomalyType: 'INVALID_DATE',
        field: 'date',
        message: 'Missing date',
        originalValue: dateStr,
        canAutoFix: false,
      };
    }

    const parsed = parseDateStr(dateStr, context.allRows);
    if (!parsed) {
      return {
        rowNumber: context.rowNumber,
        severity: 'ERROR',
        anomalyType: 'INVALID_DATE',
        field: 'date',
        message: `Invalid date format: "${dateStr}"`,
        originalValue: dateStr,
        canAutoFix: false,
      };
    }

    return null;
  }
}

/**
 * 9. Ambiguous date formats
 */
export class AmbiguousDateRule implements AnomalyRule {
  detect(context: DetectionContext): Anomaly | null {
    const dateStr = context.row.date;
    if (!dateStr) return null;

    const parsed = parseDateStr(dateStr, context.allRows);
    if (parsed && parsed.isAmbiguous) {
      const dateFormatted = parsed.date.toISOString().split('T')[0];
      return {
        rowNumber: context.rowNumber,
        severity: 'WARNING',
        anomalyType: 'AMBIGUOUS_DATE',
        field: 'date',
        message: `Ambiguous date "${dateStr}". Interpreted as MM-DD-YYYY (${dateFormatted})`,
        originalValue: dateStr,
        suggestedValue: dateFormatted,
        canAutoFix: false,
      };
    }

    return null;
  }
}

/**
 * 11. Split type vs split details mismatch
 */
export class SplitInconsistencyRule implements AnomalyRule {
  detect(context: DetectionContext): Anomaly | null {
    const splitType = (context.row.splitType || 'EQUAL').toUpperCase();
    const hasShares = context.row.participantShares && context.row.participantShares.trim() !== '';

    if (splitType === 'EQUAL' && hasShares) {
      return {
        rowNumber: context.rowNumber,
        severity: 'WARNING',
        anomalyType: 'SPLIT_INCONSISTENCY',
        field: 'splitType',
        message: `Split type "EQUAL" conflicted with custom shares "${context.row.participantShares}". Custom shares will be ignored.`,
        originalValue: context.row.participantShares,
        suggestedValue: '', // Clear the custom shares
        canAutoFix: true,
      };
    }

    return null;
  }
}

/**
 * 12. Membership violations (joined/left logic)
 */
export class MembershipViolationRule implements AnomalyRule {
  detect(context: DetectionContext): Anomaly | null {
    const dateStr = context.row.date;
    const parsedDateResult = parseDateStr(dateStr, context.allRows);
    if (!parsedDateResult) return null;

    const expenseDate = parsedDateResult.date;
    const rawParticipants = context.row.participants;
    if (!rawParticipants) return null;

    const partsSep = rawParticipants.includes(',') ? ',' : ';';
    const partsFixed = rawParticipants.split(partsSep).map(p => p.trim()).filter(Boolean);
    const violations: string[] = [];
    const validParts: string[] = [];

    for (const part of partsFixed) {
      const res = resolveMemberName(part, context.groupMembers, context.userAliases);
      if (res.member) {
        const joined = new Date(res.member.joinedAt);
        const left = res.member.leftAt ? new Date(res.member.leftAt) : null;

        if (expenseDate < joined || (left && expenseDate > left)) {
          violations.push(res.member.name);
          continue; // Exclude invalid participant
        }
      }
      validParts.push(part);
    }

    if (violations.length > 0) {
      return {
        rowNumber: context.rowNumber,
        severity: 'WARNING',
        anomalyType: 'INVALID_MEMBER_FOR_DATE',
        field: 'participants',
        message: `Membership timeline violation: ${violations.join(', ')} were not members on ${expenseDate.toISOString().split('T')[0]} and are excluded from the split.`,
        originalValue: rawParticipants,
        suggestedValue: validParts.join(','),
        canAutoFix: true,
      };
    }

    return null;
  }
}

/**
 * Guest participant warning rule (Problem 2 helper)
 */
export class GuestParticipantRule implements AnomalyRule {
  detect(context: DetectionContext): Anomaly | null {
    const rawPayer = context.row.paidBy?.trim();
    if (!rawPayer) return null;

    const res = resolveMemberName(rawPayer, context.groupMembers, context.userAliases);
    if (res.status === 'UNKNOWN') {
      return {
        rowNumber: context.rowNumber,
        severity: 'INFO',
        anomalyType: 'GUEST_PARTICIPANT',
        field: 'paidBy',
        message: `Payer "${rawPayer}" is not a group member and will be added as a GUEST participant`,
        originalValue: rawPayer,
        canAutoFix: true,
      };
    }

    // Also check participants list
    const rawParticipants = context.row.participants;
    if (rawParticipants) {
      const guestSep = rawParticipants.includes(',') ? ',' : ';';
      const parts = rawParticipants.split(guestSep).map(p => p.trim()).filter(Boolean);
      const guests = parts.filter(p => resolveMemberName(p, context.groupMembers, context.userAliases).status === 'UNKNOWN');

      if (guests.length > 0) {
        return {
          rowNumber: context.rowNumber,
          severity: 'INFO',
          anomalyType: 'GUEST_PARTICIPANT',
          field: 'participants',
          message: `Unknown participants: ${guests.join(', ')} will be added as GUESTs`,
          originalValue: rawParticipants,
          canAutoFix: true,
        };
      }
    }

    return null;
  }
}

/**
 * Percentage mismatch rule (Problem 13)
 * Detects percentage values that don't sum to 100
 */
export class PercentageMismatchRule implements AnomalyRule {
  detect(context: DetectionContext): Anomaly | null {
    const splitType = (context.row.splitType || 'EQUAL').toUpperCase();
    if (splitType !== 'PERCENTAGE') return null;

    const rawShares = context.row.participantShares;
    if (!rawShares) return null;

    const sep = rawShares.includes(',') ? ',' : ';';
    const values = rawShares.split(sep)
      .map(s => parseFloat(s.replace(/^[A-Za-z\s]+/, '').trim()))
      .filter(v => !isNaN(v));

    if (values.length === 0) return null;

    const total = values.reduce((sum, v) => sum + v, 0);
    if (Math.abs(total - 100) < 0.01) return null;

    // Suggest normalized percentages
    const normalized = values.map(v => Math.round((v / total) * 100));
    const diff = 100 - normalized.reduce((s, n) => s + n, 0);
    if (diff !== 0 && normalized.length > 0) normalized[normalized.length - 1] += diff;
    const suggested = normalized.join(';');

    return {
      rowNumber: context.rowNumber,
      severity: 'WARNING',
      anomalyType: 'PERCENTAGE_MISMATCH',
      field: 'participantShares',
      message: `Percentages sum to ${total}% instead of 100%. Suggested adjustment: ${suggested}`,
      originalValue: rawShares,
      suggestedValue: suggested,
      canAutoFix: false,
    };
  }
}

// ── Anomaly Detector (Orchestrator) ────────────────────────────────────────────

export class AnomalyDetector {
  private rules: AnomalyRule[] = [
    new MissingPayerRule(),              // 3. Missing Payer
    new PayerNotMemberRule(),            // 3b. Payer Not in Group
    new MissingCurrencyRule(),           // 5 & 10. Missing Currency
    new InvalidDateRule(),               // 8. Invalid Date
    new AmbiguousDateRule(),             // 9. Ambiguous Date
    new SettlementAsExpenseRule(),       // 4. Settlement Keyword
    new NegativeAmountRule(),            // 7. Negative Amount (Refund)
    new InconsistentNameRule(),          // 2. Inconsistent Name
    new GuestParticipantRule(),          // 2. Unknown Guest mapping
    new DuplicateExpenseRule(),          // 1. Duplicate check
    new CurrencyConversionRule(),        // 6. Currency Inconsistency
    new SplitInconsistencyRule(),        // 11. Split vs details mismatch
    new MembershipViolationRule(),       // 12. Membership timeline check
    new PercentageMismatchRule(),        // 13. Percentage mismatch
  ];

  addRule(rule: AnomalyRule): void {
    this.rules.push(rule);
  }

  detectAnomalies(context: DetectionContext): Anomaly[] {
    const anomalies: Anomaly[] = [];

    for (const rule of this.rules) {
      const anomaly = rule.detect(context);
      if (anomaly) {
        anomalies.push(anomaly);
      }
    }

    return anomalies;
  }

  detectAll(
    rows: CSVRow[],
    groupMembers: GroupMemberInfo[],
    userAliases: UserAliasInfo[],
    existingExpenses?: Array<{ description: string; amount: number; date: Date; paidById: string }>
  ): Map<number, Anomaly[]> {
    const anomaliesMap = new Map<number, Anomaly[]>();

    rows.forEach((row, index) => {
      const context: DetectionContext = {
        row,
        rowNumber: index + 2, // +2 because index is 0-based and header is row 1
        allRows: rows,
        groupMembers,
        userAliases,
        existingExpenses,
      };

      const anomalies = this.detectAnomalies(context);
      if (anomalies.length > 0) {
        anomaliesMap.set(context.rowNumber, anomalies);
      }
    });

    return anomaliesMap;
  }
}
