import { eq } from 'drizzle-orm';
import { db } from '../client';
import { accounts, Account, InsertAccount } from '../schema';

export const accountRepository = {
  /**
   * Get all payment accounts (Cash, UPI, Bank, Card)
   */
  getAll(): Account[] {
    return db.select().from(accounts).all();
  },

  /**
   * Get account by ID
   */
  getById(id: number): Account | undefined {
    return db.select().from(accounts).where(eq(accounts.id, id)).get();
  },

  /**
   * Add a new account
   */
  add(acc: InsertAccount): Account {
    return db.insert(accounts).values(acc).returning().get();
  },
};
