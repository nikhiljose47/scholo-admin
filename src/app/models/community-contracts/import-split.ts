// Copied from nikhiljose47/free-online-tutor packages/community-contracts/src/import-split.ts
// at commit 8aa3927cbafd9a1b76f8ce343a4565a727f95d58 -- keep in sync manually.
// Splits a large import file into bounded batches in the browser, so the admin never uploads (or the
// Worker never parses) thousands of rows in a single request. Pure TypeScript.
import { IMPORT_LIMITS, jsonToRows, parseCsv } from './problem-import';

export interface SplitResult {
  format: 'json' | 'csv';
  totalRows: number;
  batchSize: number;
  /** Serialised batch bodies, each at most `batchSize` problems. */
  batches: string[];
}

const quote = (cell: string): string => `"${cell.replace(/"/g, '""')}"`;

export function splitImportFile(format: 'json' | 'csv', text: string, batchSize: number = IMPORT_LIMITS.maxItems): SplitResult {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > IMPORT_LIMITS.maxItems) {
    throw new Error(`Batch size must be 1-${IMPORT_LIMITS.maxItems}`);
  }

  if (format === 'json') {
    const rows = jsonToRows(text);
    if (rows.length === 0) throw new Error('The file contains no problems');
    const batches: string[] = [];
    for (let i = 0; i < rows.length; i += batchSize) {
      batches.push(JSON.stringify(rows.slice(i, i + batchSize).map((r) => r.input)));
    }
    return { format, totalRows: rows.length, batchSize, batches };
  }

  const table = parseCsv(text);
  if (table.length < 2) throw new Error('The CSV needs a header row and at least one problem');
  const header = table[0];
  const records = table.slice(1);
  const batches: string[] = [];
  for (let i = 0; i < records.length; i += batchSize) {
    const lines = [header, ...records.slice(i, i + batchSize)].map((cells) => cells.map(quote).join(','));
    batches.push(lines.join('\n'));
  }
  return { format, totalRows: records.length, batchSize, batches };
}

/** Converts a row number reported for one batch into the row number in the original file. */
export function globalRow(batchIndex: number, rowInBatch: number, batchSize: number): number {
  return batchIndex * batchSize + rowInBatch;
}
