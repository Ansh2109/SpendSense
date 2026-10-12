import { eq, or } from 'drizzle-orm';
import { db } from '../client';
import { categories, Category, InsertCategory } from '../schema';

export const categoryRepository = {
  /**
   * Get all categories, optionally filtered by type (expense, income, or both)
   */
  getAll(filterType?: 'expense' | 'income'): Category[] {
    if (!filterType) {
      return db.select().from(categories).all();
    }
    return db
      .select()
      .from(categories)
      .where(or(eq(categories.type, filterType), eq(categories.type, 'both')))
      .all();
  },

  /**
   * Get category by ID
   */
  getById(id: number): Category | undefined {
    return db.select().from(categories).where(eq(categories.id, id)).get();
  },

  /**
   * Add a new custom category
   */
  add(category: InsertCategory): Category {
    return db.insert(categories).values(category).returning().get();
  },
};
