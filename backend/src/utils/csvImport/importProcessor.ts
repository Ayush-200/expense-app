/**
 * Import Processor
 * 
 * Orchestrates the CSV import workflow:
 * 1. Parse CSV
 * 2. Detect anomalies using AnomalyDetector
 * 3. Save raw rows and anomalies to DB
 * 4. Perform final confirmation and database write (expenses, settlements, aliases)
 */

import { prisma } from '../../config/database';
import { CSVParser } from './csvParser';
import { AnomalyDetector, Anomaly, CSVRow, GroupMemberInfo, UserAliasInfo, parseDateStr, resolveMemberName, parseAmount } from './anomalyDetector';
import { calculateSplits } from '../splitCalculator';

export interface ImportOptions {
  groupId: string;
  userId: string;
  fileName: string;
  fileBuffer: Buffer;
  autoFix?: boolean;
  exchangeRate?: number;
}

export interface ImportReport {
  importJobId: string;
  status: 'COMPLETED' | 'FAILED' | 'REQUIRES_APPROVAL';
  totalRows: number;
  processedRows: number;
  successfulRows: number;
  failedRows: number;
  anomalies: {
    errors: number;
    warnings: number;
    info: number;
    byType: Record<string, number>;
  };
  summary: string;
  details: Array<{
    rowNumber: number;
    anomalies: Anomaly[];
    rowData: CSVRow;
  }>;
}

const MOVE_OUT_PATTERNS = [
  /(\w+)\s+(moved?|moving|leaving|left)\s+out/i,
  /(\w+)\s+(left|leaving)\b(?!\s+in)/i,
];

const MOVE_IN_PATTERNS = [
  /(\w+)\s+(moved?|joining|joined)\s+in/i,
  /(\w+)\s+(joined|joining)\b/i,
];

function parseMembershipFromNotes(rows: CSVRow[], groupMembers: GroupMemberInfo[]): void {
  const datedRows = rows
    .map((r, i) => ({ row: r, index: i, date: parseDateStr(r.date, rows)?.date }))
    .filter(r => r.date && r.row.notes)
    .sort((a, b) => a.date!.getTime() - b.date!.getTime());

  for (const { row, date } of datedRows) {
    const notes = row.notes;
    if (!notes) continue;

    for (const pattern of MOVE_OUT_PATTERNS) {
      const match = notes.match(pattern);
      if (match) {
        const name = match[1].toLowerCase();
        const member = groupMembers.find(m => m.name.toLowerCase() === name);
        if (member && (!member.leftAt || date! < member.leftAt)) {
          member.leftAt = date!;
        }
      }
    }

    for (const pattern of MOVE_IN_PATTERNS) {
      const match = notes.match(pattern);
      if (match) {
        const name = match[1].toLowerCase();
        const member = groupMembers.find(m => m.name.toLowerCase() === name);
        if (member && date! < member.joinedAt) {
          member.joinedAt = date!;
        }
      }
    }
  }
}

function isDepositRow(row: CSVRow): boolean {
  const text = `${row.description || ''} ${row.notes || ''}`.toLowerCase();
  return /\bdeposit\b/.test(text);
}

export class ImportProcessor {
  private parser: CSVParser;
  private detector: AnomalyDetector;

  constructor() {
    this.parser = new CSVParser();
    this.detector = new AnomalyDetector();
  }

  /**
   * Process a CSV import (Validation and Report generation stage).
   */
  async process(options: ImportOptions): Promise<ImportReport> {
    const { groupId, userId, fileName, fileBuffer, autoFix = true } = options;

    // Create import job
    const importJob = await prisma.importJob.create({
      data: {
        groupId,
        userId,
        fileName,
        status: 'PROCESSING',
        totalRows: 0,
      },
    });

    try {
      // Step 1: Parse CSV
      const parseResult = await this.parser.parse(fileBuffer);

      console.log(`[process] Parsed ${parseResult.totalRows} rows from "${options.fileName}"`);

      if (parseResult.errors.length > 0) {
        await prisma.importJob.update({
          where: { id: importJob.id },
          data: {
            status: 'FAILED',
            completedAt: new Date(),
          },
        });
        throw new Error(`CSV parsing failed: ${parseResult.errors.join(', ')}`);
      }

      // Validate required columns
      const columnErrors = this.parser.validateColumns(parseResult.rows);
      if (columnErrors.length > 0) {
        await prisma.importJob.update({
          where: { id: importJob.id },
          data: {
            status: 'FAILED',
            completedAt: new Date(),
          },
        });
        throw new Error(columnErrors.join(', '));
      }

      // Update total rows
      await prisma.importJob.update({
        where: { id: importJob.id },
        data: { totalRows: parseResult.totalRows },
      });

      // Step 2: Query group members (including past ones)
      const members = await prisma.groupMember.findMany({
        where: { groupId },
        include: { user: true },
      });
      const groupMembersInfo: GroupMemberInfo[] = members.map(m => ({
        userId: m.userId,
        name: m.user.name,
        email: m.user.email,
        joinedAt: m.joinedAt,
        leftAt: m.leftAt,
      }));

      // Step 3: Query user aliases
      const aliases = await prisma.userAlias.findMany({
        where: {
          userId: { in: members.map(m => m.userId) },
        },
      });
      const userAliasesInfo: UserAliasInfo[] = aliases.map(a => ({
        userId: a.userId,
        alias: a.alias,
      }));

      // Step 4: Parse notes for membership changes (move-in/move-out)
      parseMembershipFromNotes(parseResult.rows, groupMembersInfo);
      // Persist the updated membership dates to DB so balance calculation
      // (which queries group_members separately) has correct data.
      for (const m of groupMembersInfo) {
        const dbMember = members.find(dbm => dbm.userId === m.userId);
        if (dbMember) {
          const joinedChanged = m.joinedAt.getTime() !== dbMember.joinedAt.getTime();
          const leftChanged = m.leftAt?.getTime() !== dbMember.leftAt?.getTime();
          if (joinedChanged || leftChanged) {
            await prisma.groupMember.update({
              where: { id: dbMember.id },
              data: {
                joinedAt: m.joinedAt,
                leftAt: m.leftAt,
              },
            });
          }
        }
      }

      // Step 5: Query existing expenses for duplicate checks
      const existingExpenses = await prisma.expense.findMany({
        where: { groupId },
        select: { description: true, totalAmount: true, date: true, paidById: true },
      });
      const existingExpensesData = existingExpenses.map(e => ({
        description: e.description,
        amount: Number(e.totalAmount),
        date: e.date,
        paidById: e.paidById,
      }));

      // Step 6: Detect anomalies
      const anomaliesMap = this.detector.detectAll(
        parseResult.rows,
        groupMembersInfo,
        userAliasesInfo,
        existingExpensesData
      );

      // Step 7: Apply auto-fixes if enabled
      let fixedRows = parseResult.rows;
      if (autoFix) {
        fixedRows = this.applyAutoFixes(parseResult.rows, anomaliesMap);
      }

      // Save rowData (normalized rows) to ImportJob
      const rowDataPayload = options.exchangeRate
        ? { _exchangeRate: options.exchangeRate, rows: fixedRows }
        : fixedRows;
      await prisma.importJob.update({
        where: { id: importJob.id },
        data: { rowData: rowDataPayload as any },
      });

      // Step 8: Save anomalies to database
      const anomalyRecords = [];
      for (const [rowNumber, anomalies] of anomaliesMap.entries()) {
        for (const anomaly of anomalies) {
          anomalyRecords.push({
            importJobId: importJob.id,
            rowNumber: anomaly.rowNumber,
            severity: anomaly.severity,
            anomalyType: anomaly.anomalyType,
            field: anomaly.field || null,
            message: anomaly.message,
            originalValue: anomaly.originalValue || null,
            suggestedValue: anomaly.suggestedValue || null,
            resolution: autoFix && anomaly.canAutoFix ? 'AUTO_FIXED' : null,
            rowData: parseResult.rows[rowNumber - 2] as any, // original row data
          });
        }
      }

      if (anomalyRecords.length > 0) {
        await prisma.importAnomaly.createMany({
          data: anomalyRecords,
        });
      }

      // Step 9: Decide if import can be auto-completed or requires approval
      const allAnomalies = Array.from(anomaliesMap.values()).flat();
      const hasUnresolved = allAnomalies.some(a => !(autoFix && a.canAutoFix));
      
      const status = hasUnresolved ? 'REQUIRES_APPROVAL' : 'COMPLETED';

      // Update import job status
      await prisma.importJob.update({
        where: { id: importJob.id },
        data: {
          status,
          processedRows: parseResult.totalRows,
          completedAt: status === 'COMPLETED' ? new Date() : null,
        },
      });

      // If status is COMPLETED (no unresolved issues), let's execute import immediately!
      if (status === 'COMPLETED') {
        await this.executeImport(importJob.id);
      }

      return this.generateReport(importJob.id, anomaliesMap, parseResult.rows, parseResult.totalRows);
    } catch (error) {
      await prisma.importJob.update({
        where: { id: importJob.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
        },
      });
      throw error;
    }
  }

  /**
   * Apply automatic fixes where safe.
   */
  private applyAutoFixes(
    rows: CSVRow[],
    anomaliesMap: Map<number, Anomaly[]>
  ): CSVRow[] {
    const fixedRows = rows.map(r => ({ ...r }));

    for (const [rowNumber, anomalies] of anomaliesMap.entries()) {
      const rowIndex = rowNumber - 2;
      const row = fixedRows[rowIndex];

      for (const anomaly of anomalies) {
        if (!anomaly.canAutoFix || anomaly.suggestedValue === undefined) continue;

        switch (anomaly.anomalyType) {
          case 'MISSING_CURRENCY':
            row.currency = anomaly.suggestedValue;
            break;
          case 'NEGATIVE_AMOUNT':
            row.amount = anomaly.suggestedValue;
            row.type = 'REFUND_TRANSACTION';
            break;
          case 'INCONSISTENT_NAME':
            if (anomaly.field === 'paidBy') {
              row.paidBy = anomaly.suggestedValue;
            }
            break;
          case 'SPLIT_INCONSISTENCY':
            if (anomaly.field === 'splitType') {
              row.participantShares = '';
            }
            break;
          case 'INVALID_MEMBER_FOR_DATE':
            if (anomaly.field === 'participants' && anomaly.suggestedValue) {
              const oldRaw = anomaly.originalValue || '';
              const oldParts = oldRaw.split(/[,;]/).map(p => p.trim()).filter(Boolean);
              const newParts = anomaly.suggestedValue.split(',').map(p => p.trim()).filter(Boolean);
              row.participants = anomaly.suggestedValue;
              if (row.participantShares && oldParts.length > 0) {
                const oldShares = row.participantShares.split(/[,;]/).map(s => s.trim()).filter(Boolean);
                const validShares: string[] = [];
                for (let i = 0; i < oldParts.length; i++) {
                  if (i < oldShares.length && newParts.includes(oldParts[i])) {
                    validShares.push(oldShares[i]);
                  }
                }
                if (validShares.length > 0) {
                  const splitType = (row.splitType || 'EQUAL').toUpperCase();
                  if (splitType === 'PERCENTAGE') {
                    const numericShares = validShares.map(s => parseFloat(s.replace(/^[A-Za-z\s]+/, '').trim())).filter(v => !isNaN(v));
                    const total = numericShares.reduce((sum, v) => sum + v, 0);
                    if (total > 0 && Math.abs(total - 100) >= 0.01) {
                      const normalized = numericShares.map(v => Math.round((v / total) * 100));
                      const diff = 100 - normalized.reduce((s, n) => s + n, 0);
                      if (diff !== 0 && normalized.length > 0) normalized[normalized.length - 1] += diff;
                      row.participantShares = validShares.map((s, i) =>
                        s.replace(/\d+(\.\d+)?/g, String(normalized[i]))
                      ).join(';');
                    } else {
                      row.participantShares = validShares.join(';');
                    }
                  } else {
                    row.participantShares = validShares.join(';');
                  }
                } else {
                  row.participantShares = '';
                }
              }
            }
            break;
        }
      }
    }

    return fixedRows;
  }

  /**
   * Execute DB inserts for import job rows.
   */
  async executeImport(
    importJobId: string,
    resolutions: Record<number, {
      payerId?: string;
      date?: string;
      currency?: string;
      exchangeRate?: number;
      isSettlement?: boolean;
      payeeId?: string;
      skip?: boolean;
      confirmedDuplicate?: boolean;
      splitType?: string;
      participantShares?: string;
      participants?: string;
    }> = {}
  ): Promise<void> {
    const job = await prisma.importJob.findUnique({
      where: { id: importJobId },
    });
    if (!job) throw new Error('Import job not found');

    const rawData = job.rowData as any;
    let rows: CSVRow[];
    let importExchangeRate: number | undefined;
    if (rawData && !Array.isArray(rawData)) {
      rows = rawData.rows as CSVRow[];
      importExchangeRate = rawData._exchangeRate;
    } else {
      rows = rawData as unknown as CSVRow[];
    }
    if (!rows) throw new Error('No row data found in import job');
    console.log(`[executeImport] Executing import for ${rows.length} rows`);

    const { groupId, userId } = job;

    // Fetch members and aliases for matching
    const members = await prisma.groupMember.findMany({
      where: { groupId },
      include: { user: true },
    });
    const groupMembersInfo: GroupMemberInfo[] = members.map(m => ({
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      joinedAt: m.joinedAt,
      leftAt: m.leftAt,
    }));

    // Apply notes-based membership changes so the leftAt/joinedAt checks below are correct
    parseMembershipFromNotes(rows, groupMembersInfo);
    // Persist to DB so downstream queries (controller, balance engine) see updated dates
    for (const m of groupMembersInfo) {
      const dbMember = members.find(dbm => dbm.userId === m.userId);
      if (dbMember) {
        const joinedChanged = m.joinedAt.getTime() !== dbMember.joinedAt.getTime();
        const leftChanged = m.leftAt?.getTime() !== dbMember.leftAt?.getTime();
        if (joinedChanged || leftChanged) {
          await prisma.groupMember.update({
            where: { id: dbMember.id },
            data: {
              joinedAt: m.joinedAt,
              leftAt: m.leftAt,
            },
          });
        }
      }
    }

    const aliases = await prisma.userAlias.findMany({
      where: { userId: { in: members.map(m => m.userId) } },
    });
    const userAliasesInfo: UserAliasInfo[] = aliases.map(a => ({
      userId: a.userId,
      alias: a.alias,
    }));

    let successfulCount = 0;
    let failedCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
      const res = resolutions[rowNum] || {};

      if (res.skip) {
        continue;
      }

      console.log(`[executeImport] Row ${rowNum} | date=${row.date} desc="${row.description || ''}" paidBy=${row.paidBy} amount=${row.amount} participants=${row.participants || ''} splitType=${row.splitType || 'EQUAL'} notes=${(row.notes || '').slice(0, 40)}`);

      try {
        // 1. Resolve Payer User
        let payerId = '';
        if (res.payerId) {
          payerId = res.payerId;
          console.log(`[executeImport]   Row ${rowNum} → payer resolved from resolution: ${payerId}`);
        } else if (row.paidBy) {
          const resolved = resolveMemberName(row.paidBy, groupMembersInfo, userAliasesInfo);
          if (resolved.member) {
            payerId = resolved.member.userId;
            console.log(`[executeImport]   Row ${rowNum} → payer="${row.paidBy}" → userId=${payerId} (status=${resolved.status})`);
            if (resolved.status === 'CASE_MISMATCH' || resolved.status === 'ALIAS_MATCH') {
              const normalizedAlias = row.paidBy.trim().toLowerCase();
              const existingAlias = await prisma.userAlias.findFirst({
                where: { userId: payerId, alias: normalizedAlias },
              });
              if (!existingAlias) {
                await prisma.userAlias.create({
                  data: { userId: payerId, alias: normalizedAlias },
                }).catch(() => {}); // ignore duplicates
              }
            }
          } else {
            throw new Error(`[Payer] "${row.paidBy}" is not a member of this group. Add them to the group first.`);
          }
        } else {
          throw new Error('[Payer] Missing payer (paidBy)');
        }

        // 2. Parse Date
        let expenseDate = new Date();
        if (res.date) {
          expenseDate = new Date(res.date);
          console.log(`[executeImport]   Row ${rowNum} → date from resolution: ${expenseDate.toISOString()}`);
        } else {
          const parsed = parseDateStr(row.date, rows);
          if (!parsed) throw new Error(`[Date] Invalid format "${row.date}"`);
          expenseDate = parsed.date;
          console.log(`[executeImport]   Row ${rowNum} → date="${row.date}" → ${expenseDate.toISOString()}`);
        }

        // 3. Resolve Amount & Currency Exchange
        let originalCurrency = row.currency?.trim().toUpperCase() || 'INR';
        if (res.currency) {
          originalCurrency = res.currency.trim().toUpperCase();
        }

        let amount = parseAmount(row.amount);
        let convertedAmount = amount;
        let exchangeRate = 1.0;

        if (originalCurrency !== 'INR') {
          exchangeRate = res.exchangeRate || importExchangeRate || 83.00;
          convertedAmount = amount * exchangeRate;
          console.log(`[executeImport]   Row ${rowNum} → currency=${originalCurrency} amount=${amount} rate=${exchangeRate} conv=${convertedAmount}`);
        } else {
          console.log(`[executeImport]   Row ${rowNum} → amount=${amount} INR`);
        }

        // 4. Decide transaction type: Settlement vs Expense
        const settlementKeywords = ['paid back', 'repaid', 'settlement', 'deposit', 'payback', 'reimbursement', 'repayment'];
        const textToCheck = `${row.description || ''} ${row.notes || ''}`.toLowerCase();
        const isSettlement = res.isSettlement === true || 
          (res.isSettlement === undefined && settlementKeywords.some(kw => textToCheck.includes(kw)));

        if (isSettlement) {
          console.log(`[executeImport]   Row ${rowNum} → SETTLEMENT detected`);
          let payeeId = '';
          if (res.payeeId) {
            payeeId = res.payeeId;
          } else if (row.participants) {
            const firstSep = row.participants.includes(',') ? ',' : ';';
            const firstParticipant = row.participants.split(firstSep)[0].trim();
            const resolvedPayee = resolveMemberName(firstParticipant, groupMembersInfo, userAliasesInfo);
            if (resolvedPayee.member) {
              payeeId = resolvedPayee.member.userId;
            } else {
              console.log(`[executeImport]   Row ${rowNum} → payee "${firstParticipant}" not resolved as member`);
            }
          }

          if (!payeeId) {
            throw new Error('[Settlement] Payee not found');
          }

          await prisma.settlement.create({
            data: {
              groupId,
              fromUserId: payerId,
              toUserId: payeeId,
              amount: Math.abs(convertedAmount),
              currency: originalCurrency,
              note: row.description || 'Settlement via CSV Import',
              date: expenseDate,
            },
          });
          console.log(`[executeImport]   Row ${rowNum} → settlement created: from=${payerId} to=${payeeId} amount=${Math.abs(convertedAmount)}`);
        } else {
          if (settlementKeywords.some(kw => textToCheck.includes(kw))) {
            console.warn(`[executeImport]   Row ${rowNum} → contains settlement keywords but isSettlement=${res.isSettlement} — creating as expense (user override)`);
          }
          console.log(`[executeImport]   Row ${rowNum} → EXPENSE processing`);
          let splitType = (res.splitType || row.splitType || 'EQUAL').toUpperCase();
          if (splitType === 'UNEQUAL') splitType = 'EXACT';
          const effectiveParticipants = res.participants || row.participants || '';
          const sep = effectiveParticipants.includes(',') ? ',' : ';';
          const rawParts = effectiveParticipants.split(sep).map(p => p.trim()).filter(Boolean) || [];
          if (!effectiveParticipants || rawParts.length === 0) {
            throw new Error('[Participants] No participants listed in CSV row. Participants must be explicitly listed in split_with column — group members are not auto-inherited.');
          }
          console.log(`[executeImport]   Row ${rowNum} → splitType=${splitType} participants=[${rawParts.join(' | ')}] sep="${sep}"`);

          const participantInputs: any[] = [];
          const effectiveShares = res.participantShares || row.participantShares || '';
          const sharesSep = effectiveShares.includes(',') ? ',' : ';';
          const shares = effectiveShares
            ? effectiveShares.split(sharesSep).map(s => parseFloat(s.replace(/^[A-Za-z\s]+/, '').trim())).filter(v => !isNaN(v))
            : [];
          if (shares.length > 0) console.log(`[executeImport]   Row ${rowNum} → shares=[${shares.join(', ')}]`);

          let shareIdx = 0;
          for (let j = 0; j < rawParts.length; j++) {
            const part = rawParts[j];
            const resolved = resolveMemberName(part, groupMembersInfo, userAliasesInfo);

            if (resolved.member) {
              const left = resolved.member.leftAt ? new Date(resolved.member.leftAt) : null;
              if (left && expenseDate > left) {
                console.log(`[executeImport]   Row ${rowNum} → participant "${part}" excluded (left: ${left.toISOString()})`);
                shareIdx++;
                continue;
              }
            }

            const shareVal = shares.length > 0 ? shares[shareIdx++] : undefined;

            if (!resolved.member) {
              participantInputs.push({
                guestName: part,
                guestEmail: part.includes('@') ? part : undefined,
                ...(splitType === 'PERCENTAGE' && { percentage: shareVal }),
                ...(splitType === 'SHARE' && { shares: shareVal }),
                ...(splitType === 'EXACT' && { exactAmount: shareVal }),
              });
              console.log(`[executeImport]   Row ${rowNum} → participant "${part}" → GUEST (split=${splitType} val=${shareVal})`);
            } else {
              participantInputs.push({
                userId: resolved.member.userId,
                ...(splitType === 'PERCENTAGE' && { percentage: shareVal }),
                ...(splitType === 'SHARE' && { shares: shareVal }),
                ...(splitType === 'EXACT' && { exactAmount: shareVal }),
              });
              console.log(`[executeImport]   Row ${rowNum} → participant "${part}" → userId=${resolved.member.userId} (split=${splitType} val=${shareVal})`);
            }
          }

          if (participantInputs.length === 0) {
            throw new Error('[Participants] No valid participants found for splitting');
          }

          const isRefund = row.type === 'REFUND_TRANSACTION' || amount < 0;
          const totalExpenseAmount = isRefund ? -Math.abs(convertedAmount) : Math.abs(convertedAmount);
          if (isRefund) console.log(`[executeImport]   Row ${rowNum} → REFUND (original amount=${amount})`);

          let calculated;
          try {
            calculated = calculateSplits(totalExpenseAmount, splitType as any, participantInputs);
          } catch (splitErr: any) {
            throw new Error(`[Split] ${splitErr.message}`);
          }
          console.log(`[executeImport]   Row ${rowNum} → calculated splits: ${JSON.stringify(calculated.map(p => ({ uid: p.userId, guest: p.guestName, amount: p.amountOwed })))}`);

          await prisma.expense.create({
            data: {
              groupId,
              paidById: payerId,
              description: row.description || 'CSV Import Expense',
              totalAmount: totalExpenseAmount,
              splitType,
              date: expenseDate,
              currency: originalCurrency,
              originalAmount: amount,
              exchangeRate: originalCurrency !== 'INR' ? exchangeRate : null,
              type: isRefund ? 'REFUND_TRANSACTION' : 'EXPENSE',
              participants: {
                create: calculated.map(p => ({
                  userId: p.userId ?? null,
                  guestName: p.guestName ?? null,
                  guestEmail: p.guestEmail ?? null,
                  amountOwed: p.amountOwed,
                  splitMetadata: p.splitMetadata as any,
                })),
              },
            },
          });
        }
        successfulCount++;
        console.log(`[executeImport]   Row ${rowNum} → ✓ imported successfully`);
      } catch (err: any) {
        failedCount++;
        console.error(`[executeImport]   Row ${rowNum} → ✗ FAILED: ${err.message}`);
        await prisma.importAnomaly.create({
          data: {
            importJobId,
            rowNumber: rowNum,
            severity: 'ERROR',
            anomalyType: 'PROCESSING_ERROR',
            message: `Processing failed: ${err.message}`,
            rowData: row as any,
          },
        });
      }
    }

    console.log(`[executeImport] Done: ${successfulCount} success, ${failedCount} failed out of ${rows.length} rows`);
    await prisma.importJob.update({
      where: { id: importJobId },
      data: {
        status: 'COMPLETED',
        processedRows: rows.length,
        successfulRows: successfulCount,
        failedRows: failedCount,
        completedAt: new Date(),
      },
    });
  }

  /**
   * Generate report.
   */
  private async generateReport(
    importJobId: string,
    anomaliesMap: Map<number, Anomaly[]>,
    rows: CSVRow[],
    totalRows: number
  ): Promise<ImportReport> {
    const allAnomalies = Array.from(anomaliesMap.values()).flat();

    const errors = allAnomalies.filter(a => a.severity === 'ERROR').length;
    const warnings = allAnomalies.filter(a => a.severity === 'WARNING').length;
    const info = allAnomalies.filter(a => a.severity === 'INFO').length;

    const byType: Record<string, number> = {};
    allAnomalies.forEach(a => {
      byType[a.anomalyType] = (byType[a.anomalyType] || 0) + 1;
    });

    const job = await prisma.importJob.findUnique({
      where: { id: importJobId },
    });

    const details = rows.map((row, index) => {
      const rowNumber = index + 2;
      return {
        rowNumber,
        anomalies: anomaliesMap.get(rowNumber) || [],
        rowData: row,
      };
    });

    const summary = this.generateSummary(job!, errors, warnings, info);

    return {
      importJobId,
      status: job!.status as any,
      totalRows,
      processedRows: job!.processedRows,
      successfulRows: job!.successfulRows,
      failedRows: job!.failedRows,
      anomalies: {
        errors,
        warnings,
        info,
        byType,
      },
      summary,
      details,
    };
  }

  private generateSummary(
    job: any,
    errors: number,
    warnings: number,
    info: number
  ): string {
    if (job.status === 'FAILED') {
      return `Import failed with ${errors} error(s). No expenses were imported.`;
    }
    if (job.status === 'REQUIRES_APPROVAL') {
      return `Import requires approval. Found ${errors} error(s) blocking auto-import, ${warnings} warning(s), and ${info} info message(s).`;
    }
    return `Import completed successfully. ${job.successfulRows} rows imported.`;
  }
}
