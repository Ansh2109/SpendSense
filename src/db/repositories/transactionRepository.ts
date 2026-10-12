import { eq, desc, and, gte, lte } from 'drizzle-orm';
import { db } from '../client';
import { transactions, categories, accounts, Transaction, InsertTransaction } from '../schema';
import { isValidTransactionDate } from '../../utils/date';

export interface TransactionWithDetails extends Transaction {
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  accountName: string;
  accountIcon: string;
}

export const transactionRepository = {
  /**
   * Add a new transaction
   * (amountPaise MUST be an integer)
   */
  add(tx: InsertTransaction): Transaction {
    if (!isValidTransactionDate(tx.date)) {
      throw new Error('Transaction date must be valid and cannot be in the future.');
    }
    const result = db.insert(transactions).values(tx).run();
    const created = db.select().from(transactions).where(eq(transactions.id, Number(result.lastInsertRowId))).get();
    if (!created) throw new Error('Transaction was created but could not be read.');
    return created;
  },

  /**
   * Update an existing transaction
   */
  update(id: number, tx: Partial<InsertTransaction>): Transaction | undefined {
    if (tx.date !== undefined && !isValidTransactionDate(tx.date)) {
      throw new Error('Transaction date must be valid and cannot be in the future.');
    }
    db
      .update(transactions)
      .set(tx)
      .where(eq(transactions.id, id))
      .run();
    return db.select().from(transactions).where(eq(transactions.id, id)).get();
  },

  /**
   * Delete transaction by ID
   */
  delete(id: number): boolean {
    const result = db.delete(transactions).where(eq(transactions.id, id)).run();
    return result.changes > 0;
  },

  /**
   * Clear all transactions and reset data
   */
  clearAll(): void {
    db.delete(transactions).run();
  },

  /**
   * Get single transaction by ID with joined category and account details
   */
  getById(id: number): TransactionWithDetails | undefined {
    const row = db
      .select({
        id: transactions.id,
        type: transactions.type,
        amountPaise: transactions.amountPaise,
        categoryId: transactions.categoryId,
        accountId: transactions.accountId,
        note: transactions.note,
        date: transactions.date,
        createdAt: transactions.createdAt,
        categoryName: categories.name,
        categoryIcon: categories.icon,
        categoryColor: categories.color,
        accountName: accounts.name,
        accountIcon: accounts.icon,
      })
      .from(transactions)
      .innerJoin(categories, eq(transactions.categoryId, categories.id))
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .where(eq(transactions.id, id))
      .get();

    return row as TransactionWithDetails | undefined;
  },

  /**
   * Get all transactions ordered by date descending
   */
  getAll(): TransactionWithDetails[] {
    const rows = db
      .select({
        id: transactions.id,
        type: transactions.type,
        amountPaise: transactions.amountPaise,
        categoryId: transactions.categoryId,
        accountId: transactions.accountId,
        note: transactions.note,
        date: transactions.date,
        createdAt: transactions.createdAt,
        categoryName: categories.name,
        categoryIcon: categories.icon,
        categoryColor: categories.color,
        accountName: accounts.name,
        accountIcon: accounts.icon,
      })
      .from(transactions)
      .innerJoin(categories, eq(transactions.categoryId, categories.id))
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .orderBy(desc(transactions.date), desc(transactions.createdAt))
      .all();

    return rows as TransactionWithDetails[];
  },

  /**
   * Get transactions between startDate and endDate (e.g. for monthly view or reports)
   */
  getByDateRange(startDate: string, endDate: string): TransactionWithDetails[] {
    const rows = db
      .select({
        id: transactions.id,
        type: transactions.type,
        amountPaise: transactions.amountPaise,
        categoryId: transactions.categoryId,
        accountId: transactions.accountId,
        note: transactions.note,
        date: transactions.date,
        createdAt: transactions.createdAt,
        categoryName: categories.name,
        categoryIcon: categories.icon,
        categoryColor: categories.color,
        accountName: accounts.name,
        accountIcon: accounts.icon,
      })
      .from(transactions)
      .innerJoin(categories, eq(transactions.categoryId, categories.id))
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .where(and(gte(transactions.date, startDate), lte(transactions.date, endDate)))
      .orderBy(desc(transactions.date), desc(transactions.createdAt))
      .all();

    return rows as TransactionWithDetails[];
  },
};
