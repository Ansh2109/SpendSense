import { eq, isNull, and } from 'drizzle-orm';
import { db } from '../client';
import { expenseLimits, ExpenseLimit } from '../schema';
import { BudgetPeriod } from '../../utils/budgetPeriod';

export const limitRepository = {
  getOverallLimit(period: BudgetPeriod): ExpenseLimit | undefined {
    return db
      .select()
      .from(expenseLimits)
      .where(and(isNull(expenseLimits.categoryId), eq(expenseLimits.period, period)))
      .get();
  },

  setOverallLimit(period: BudgetPeriod, limitPaise: number): ExpenseLimit {
    const existing = this.getOverallLimit(period);
    const now = Date.now();

    if (existing) {
      return db
        .update(expenseLimits)
        .set({ limitPaise, updatedAt: now })
        .where(eq(expenseLimits.id, existing.id))
        .returning()
        .get();
    } else {
      return db
        .insert(expenseLimits)
        .values({
          categoryId: null,
          period,
          limitPaise,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();
    }
  },

  /**
   * Get category-specific budget limit
   */
  getCategoryLimit(categoryId: number): ExpenseLimit | undefined {
    return db
      .select()
      .from(expenseLimits)
      .where(and(eq(expenseLimits.categoryId, categoryId), eq(expenseLimits.period, 'monthly')))
      .get();
  },

  /**
   * Set category-specific budget limit
   */
  setCategoryLimit(categoryId: number, limitPaise: number): ExpenseLimit {
    const existing = this.getCategoryLimit(categoryId);
    const now = Date.now();

    if (existing) {
      return db
        .update(expenseLimits)
        .set({ limitPaise, updatedAt: now })
        .where(eq(expenseLimits.id, existing.id))
        .returning()
        .get();
    } else {
      return db
        .insert(expenseLimits)
        .values({
          categoryId,
          period: 'monthly',
          limitPaise,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();
    }
  },

  /**
   * Get all defined limits
   */
  getAll(): ExpenseLimit[] {
    return db.select().from(expenseLimits).all();
  },

  clearAll(): void {
    db.delete(expenseLimits).run();
  },
};
