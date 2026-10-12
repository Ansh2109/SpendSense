import { openDatabaseSync } from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as schema from './schema';

/**
 * The offline SQLite database file name on the device.
 * Stored locally in the app's sandboxed filesystem.
 */
export const DB_NAME = 'spendsense.db';

// A fresh native connection prevents Android Fast Refresh from reusing a closed
// database handle, which otherwise surfaces as NativeDatabase.prepareSync NPEs.
export const expoDb = openDatabaseSync(DB_NAME, { useNewConnection: true });

// Ensure tables exist synchronously before any query can run
expoDb.execSync(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    icon TEXT NOT NULL,
    color TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'expense',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    icon TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    amount_paise INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    account_id INTEGER NOT NULL,
    note TEXT,
    date TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE CASCADE,
    FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS expense_limits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER,
    period TEXT NOT NULL DEFAULT 'monthly',
    limit_paise INTEGER NOT NULL,
    effective_from TEXT NOT NULL DEFAULT 'today',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    due_date TEXT,
    amount_paise INTEGER,
    is_completed INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    tag TEXT NOT NULL DEFAULT 'Study',
    amount_paise INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
  CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
`);

function addColumnIfMissing(table: string, column: string, ddl: string): void {
  const cols = expoDb.getAllSync<{ name: string }>(`PRAGMA table_info(${table})`);
  if (!cols.some((c) => c.name === column)) {
    expoDb.execSync(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

addColumnIfMissing('tasks', 'notification_id', 'notification_id TEXT');
addColumnIfMissing('tasks', 'due_time', 'due_time TEXT');
addColumnIfMissing('tasks', 'reminder_offset_minutes', 'reminder_offset_minutes INTEGER');
addColumnIfMissing('notes', 'amount_paise', 'amount_paise INTEGER');

// Wrap with Drizzle ORM client for type-safe queries
export const db = drizzle(expoDb, { schema });
