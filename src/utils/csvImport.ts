import { Transaction } from '../types/ledger';

export type TransactionDraft = Omit<Transaction, 'id' | 'rowNumber'>;

type ColumnKey = 'date' | 'time' | 'account' | 'name' | 'category' | 'currency' | 'amount' | 'note';

const HEADER_ALIASES: Record<ColumnKey, string[]> = {
  date: ['日期', '交易日期', '消費日期', '記帳日期', '發生日期', 'date', 'txdate', 'transactiondate'],
  time: ['時間', '交易時間', '消費時間', 'time', 'txtime'],
  account: [
    '帳戶',
    '帳號',
    '帳戶名稱',
    '付款方式',
    '支付方式',
    '資金帳戶',
    '銀行',
    'account',
    'accountname',
    'wallet',
    'paymentmethod',
  ],
  name: [
    '項目名稱',
    '項目',
    '品項',
    '名稱',
    '消費項目',
    '交易名稱',
    '交易項目',
    '消費內容',
    '商品名稱',
    '摘要',
    '內容',
    '明細',
    '品名',
    '事由',
    'name',
    'item',
    'title',
    'description',
    'desc',
    'merchant',
  ],
  category: ['分類', '類別', '主分類', '消費分類', '收支類別', '類型', 'category', 'cat', 'type'],
  currency: ['幣別', '貨幣', 'currency', 'curr'],
  amount: ['金額', '數額', '消費金額', '收支金額', '花費', 'amount', 'price', 'total', 'value'],
  note: ['備註', '說明', 'note', 'notes', 'memo', 'remark', 'remarks'],
};

/**
 * Decode raw CSV bytes supporting UTF-8 (with or without BOM), UTF-16LE/BE, and Big5 fallback
 * (common when exported from Windows Excel in Traditional Chinese environments).
 */
export function decodeCsvBytes(bytes: Uint8Array): string {
  if (!bytes || bytes.length === 0) return '';

  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  }

  const utf8Text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  if (!utf8Text.includes('\uFFFD')) {
    return utf8Text;
  }

  try {
    const big5Text = new TextDecoder('big5').decode(bytes);
    console.log('[csvImport/decodeCsvBytes] Fallback - Decoded as Big5');
    return big5Text;
  } catch {
    return utf8Text;
  }
}

function normalizeHeader(raw: string): string {
  return raw
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

function resolveColumnIndices(headers: string[]): Partial<Record<ColumnKey, number>> {
  const indices: Partial<Record<ColumnKey, number>> = {};
  headers.forEach((rawHeader, idx) => {
    const normalized = normalizeHeader(rawHeader);
    if (!normalized) return;
    (Object.keys(HEADER_ALIASES) as ColumnKey[]).forEach((key) => {
      if (indices[key] === undefined && HEADER_ALIASES[key].includes(normalized)) {
        indices[key] = idx;
      }
    });
  });
  return indices;
}

function normalizeDate(raw?: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) {
    return new Date().toISOString().slice(0, 10);
  }
  const slashMatch = trimmed.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})/);
  if (slashMatch) {
    const [, y, m, d] = slashMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return trimmed.slice(0, 10);
}

function normalizeTime(raw?: string): string {
  const trimmed = (raw || '').trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})/);
  if (match) {
    return `${match[1].padStart(2, '0')}:${match[2]}`;
  }
  return '00:00';
}

function parseAmount(raw?: string): number | null {
  if (!raw) return null;
  const cleaned = raw
    .trim()
    .replace(/,/g, '')
    .replace(/[^\d.+-]/g, '');
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

/**
 * Parse RFC-4180 style CSV text (with UTF-8 BOM, quoted fields, escaped quotes, and embedded commas/newlines)
 * into a 2D array of cell strings.
 */
export function parseCsvMatrix(csvText: string): string[][] {
  const text = (csvText || '').replace(/^\uFEFF/, '');
  if (!text.trim()) return [];

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\r' && next === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i += 1;
    } else if (ch === '\n' || ch === '\r') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

/**
 * Map a 2D table of strings (first row = headers) into transaction drafts.
 * Supports Chinese headers (日期, 時間, 帳戶, 項目名稱, 分類, 幣別, 金額, 備註) and English aliases.
 */
export function mapRowsToTransactions(rows: string[][]): TransactionDraft[] {
  console.log(`[csvImport/mapRowsToTransactions] Start - rows=${rows?.length ?? 0}`);
  if (!rows || rows.length < 2) {
    console.log('[csvImport/mapRowsToTransactions] Done - insufficient rows (need header + data)');
    return [];
  }

  // Scan up to the first 5 rows to find the true header row (handles leading title/summary rows)
  let headerIdx = 0;
  let colMap = resolveColumnIndices(rows[0]);
  let bestScore = Object.keys(colMap).length;
  const scanLimit = Math.min(rows.length - 1, 5);
  for (let i = 1; i < scanLimit; i += 1) {
    const candidate = resolveColumnIndices(rows[i]);
    const score = Object.keys(candidate).length;
    if (score > bestScore) {
      bestScore = score;
      headerIdx = i;
      colMap = candidate;
    }
  }

  const headerRow = rows[headerIdx];
  const dataRows = rows.slice(headerIdx + 1);

  if (colMap.amount === undefined && colMap.name === undefined) {
    console.warn('[csvImport/mapRowsToTransactions] Missing recognized headers', headerRow);
    return [];
  }

  const drafts: TransactionDraft[] = [];

  for (const cells of dataRows) {
    const getCell = (key: ColumnKey): string => {
      const idx = colMap[key];
      return idx !== undefined && idx < cells.length ? (cells[idx] ?? '').trim() : '';
    };

    const amount = parseAmount(getCell('amount'));
    const name = getCell('name');
    if (amount === null && !name) {
      continue;
    }

    drafts.push({
      date: normalizeDate(getCell('date')),
      time: normalizeTime(getCell('time')),
      account: getCell('account') || '現金',
      name: name || '未命名項目',
      category: getCell('category') || '其他',
      currency: (getCell('currency') || 'TWD').toUpperCase(),
      amount: amount ?? 0,
      note: getCell('note'),
    });
  }

  console.log(`[csvImport/mapRowsToTransactions] Done - parsed=${drafts.length} drafts`);
  return drafts;
}

/**
 * Extract Google Spreadsheet ID from either a full Google Sheets URL or a raw spreadsheet ID.
 */
export function extractSpreadsheetId(urlOrId: string): string | null {
  const trimmed = (urlOrId || '').trim();
  if (!trimmed) return null;

  const urlMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (urlMatch?.[1]) {
    return urlMatch[1];
  }

  if (/^[a-zA-Z0-9-_]{15,}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

/**
 * Parse raw CSV text into `Omit<Transaction, 'id' | 'rowNumber'>[]`.
 */
export function parseCsvTransactions(csvText: string): TransactionDraft[] {
  console.log(`[csvImport/parseCsvTransactions] Start - length=${csvText?.length ?? 0}`);
  const matrix = parseCsvMatrix(csvText);
  const drafts = mapRowsToTransactions(matrix);
  console.log(`[csvImport/parseCsvTransactions] Done - count=${drafts.length}`);
  return drafts;
}
