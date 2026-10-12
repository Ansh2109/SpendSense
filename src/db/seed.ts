import { expoDb, db } from './client';
import { categories, accounts } from './schema';

/**
 * Initializes database tables using raw SQLite DDL if they don't exist.
 */
export function initDatabase(): void {
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

    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
  `);

  seedDefaultData();
}

/**
 * Standard categories:
 * - Expense: Food, Travel, Rent, Bills, Shopping, Health, Entertainment, Education, Other
 * - Income: Pocket Money (from family/parents), Salary, Freelance, Investments, Other Income
 */
const DEFAULT_CATEGORIES = [
  // Expense categories
  { name: 'Food', icon: 'restaurant', color: '#F97316', type: 'expense' as const },
  { name: 'Travel', icon: 'car', color: '#0EA5E9', type: 'expense' as const },
  { name: 'Rent', icon: 'home', color: '#8B5CF6', type: 'expense' as const },
  { name: 'Bills', icon: 'flash', color: '#EAB308', type: 'expense' as const },
  { name: 'Shopping', icon: 'cart', color: '#EC4899', type: 'expense' as const },
  { name: 'Health', icon: 'medkit', color: '#EF4444', type: 'expense' as const },
  { name: 'Entertainment', icon: 'film', color: '#A855F7', type: 'expense' as const },
  { name: 'Education', icon: 'school', color: '#3B82F6', type: 'expense' as const },
  { name: 'Other', icon: 'ellipsis-horizontal', color: '#64748B', type: 'expense' as const },
  // Income categories
  { name: 'Pocket Money', icon: 'wallet-outline', color: '#10B981', type: 'income' as const },
  { name: 'Salary', icon: 'briefcase-outline', color: '#059669', type: 'income' as const },
  { name: 'Freelance', icon: 'laptop-outline', color: '#06B6D4', type: 'income' as const },
  { name: 'Investments', icon: 'trending-up', color: '#84CC16', type: 'income' as const },
  { name: 'Other Income', icon: 'cash-outline', color: '#14B8A6', type: 'income' as const },
];

/**
 * Payment accounts (Cash, UPI, Bank, Card)
 */
const DEFAULT_ACCOUNTS = [
  { name: 'UPI', icon: 'qr-code' },
  { name: 'Cash', icon: 'cash' },
  { name: 'Bank', icon: 'business' },
  { name: 'Card', icon: 'card' },
];

function seedDefaultData(): void {
  const existingCategories = db.select().from(categories).all();
  const existingNames = new Set(existingCategories.map((c) => c.name.toLowerCase()));
  const now = Date.now();

  for (const cat of DEFAULT_CATEGORIES) {
    if (!existingNames.has(cat.name.toLowerCase())) {
      db.insert(categories)
        .values({
          name: cat.name,
          icon: cat.icon,
          color: cat.color,
          type: cat.type,
          createdAt: now,
        })
        .run();
    }
  }

  const existingAccounts = db.select().from(accounts).all();
  if (existingAccounts.length === 0) {
    for (const acc of DEFAULT_ACCOUNTS) {
      db.insert(accounts)
        .values({
          name: acc.name,
          icon: acc.icon,
          createdAt: now,
        })
        .run();
    }
  }
}
