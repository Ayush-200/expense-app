/**
 * CSV Parser for Expense Import
 * 
 * Handles parsing CSV files and converting them to structured data.
 */

import { parse } from 'csv-parse';
import { Readable } from 'stream';
import { CSVRow } from './anomalyDetector';

export interface ParseResult {
  rows: CSVRow[];
  totalRows: number;
  errors: string[];
}

const COLUMN_MAPPING: Record<string, string> = {
  'paid_by': 'paidBy',
  'split_type': 'splitType',
  'split_with': 'participants',
  'split_details': 'participantShares',
};

function normalizeRow(row: CSVRow): CSVRow {
  const normalized: CSVRow = {} as CSVRow;
  for (const [key, value] of Object.entries(row)) {
    const mappedKey = COLUMN_MAPPING[key.toLowerCase()] || key;
    normalized[mappedKey] = value;
  }
  return normalized;
}

export class CSVParser {
  /**
   * Parse CSV content from a buffer.
   */
  async parse(fileBuffer: Buffer): Promise<ParseResult> {
    return new Promise((resolve, reject) => {
      const rows: CSVRow[] = [];
      const errors: string[] = [];

      const parser = parse({
        columns: true, // Use first row as headers
        skip_empty_lines: true,
        trim: true,
        relaxColumnCount: true, // Allow rows with different column counts
      });

      const stream = Readable.from(fileBuffer);

      stream
        .pipe(parser)
        .on('data', (row: CSVRow) => {
          rows.push(normalizeRow(row));
        })
        .on('error', (error) => {
          errors.push(`CSV parsing error: ${error.message}`);
        })
        .on('end', () => {
          resolve({
            rows,
            totalRows: rows.length,
            errors,
          });
        });
    });
  }

  /**
   * Validate CSV has required columns.
   */
  validateColumns(rows: CSVRow[]): string[] {
    if (rows.length === 0) {
      return ['CSV file is empty'];
    }

    const requiredColumns = ['date', 'description', 'paidBy', 'amount'];
    const firstRow = rows[0];
    const existingColumns = Object.keys(firstRow);

    const missingColumns = requiredColumns.filter(
      col => !existingColumns.includes(col)
    );

    if (missingColumns.length > 0) {
      return [`Missing required columns: ${missingColumns.join(', ')}`];
    }

    return [];
  }
}
