import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_DB_PATH = process.env.DATABASE_PATH || join(here, '..', 'data', 'firstmeds.db');

/**
 * Open (and migrate) a database. Pass ':memory:' for tests.
 * Returns a thin wrapper with helpers on top of node:sqlite.
 */
export function openDb(path = DEFAULT_DB_PATH) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const raw = new DatabaseSync(path);
  raw.exec('PRAGMA journal_mode = WAL;');
  raw.exec(readFileSync(join(here, 'schema.sql'), 'utf8'));
  migrate(raw);

  const cache = new Map();
  const stmt = (sql) => {
    let s = cache.get(sql);
    if (!s) { s = raw.prepare(sql); cache.set(sql, s); }
    return s;
  };

  let depth = 0;
  const db = {
    raw,
    get: (sql, ...params) => stmt(sql).get(...params),
    all: (sql, ...params) => stmt(sql).all(...params),
    run: (sql, ...params) => {
      const r = stmt(sql).run(...params);
      return { changes: Number(r.changes), id: Number(r.lastInsertRowid) };
    },
    exec: (sql) => raw.exec(sql),
    /** Run fn inside a transaction (nesting-safe via savepoints). */
    tx(fn) {
      const name = `sp${depth++}`;
      raw.exec(`SAVEPOINT ${name}`);
      try {
        const out = fn();
        raw.exec(`RELEASE ${name}`);
        return out;
      } catch (e) {
        raw.exec(`ROLLBACK TO ${name}`);
        raw.exec(`RELEASE ${name}`);
        throw e;
      } finally {
        depth--;
      }
    },
    close: () => raw.close(),
  };
  return db;
}

/** Columns added after v1. Each is added only if missing, so old databases upgrade in place. */
const COLUMNS = [
  ['products', 'barcode', 'TEXT'],
  ['products', 'nda_status', "TEXT NOT NULL DEFAULT 'registered'"],   // registered | unverified | suspended
  ['products', 'counselling', 'TEXT'],                                 // dispensing advice shown at POS
  ['products', 'antibiotic', 'INTEGER NOT NULL DEFAULT 0'],
  ['inventory_batches', 'quarantined', 'INTEGER NOT NULL DEFAULT 0'],
  ['inventory_batches', 'po_id', 'INTEGER'],
  ['sales', 'client_id', 'TEXT'],                 // offline sale idempotency key
  ['sales', 'offline', 'INTEGER NOT NULL DEFAULT 0'],
  ['sales', 'shift_id', 'INTEGER'],
  ['sales', 'payment_verified', 'INTEGER NOT NULL DEFAULT 0'],
  ['sales', 'malaria_test', 'TEXT'],              // tested_here | tested_elsewhere | not_tested
  ['sales', 'efris_fdn', 'TEXT'],
  ['sales', 'efris_status', 'TEXT'],
  ['pharmacies', 'efris_enabled', 'INTEGER NOT NULL DEFAULT 0'],
];

function migrate(raw) {
  for (const [table, col, type] of COLUMNS) {
    const cols = raw.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
    if (!cols.includes(col)) raw.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
  }
  raw.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_client_id ON sales(client_id) WHERE client_id IS NOT NULL');
  raw.exec('CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode)');
}
