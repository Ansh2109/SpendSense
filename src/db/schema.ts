import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

/**
 * Categories table
 * Seeded with standard Indian personal finance categories:
 * Food, Travel, Rent, Bills, Shopping, Health, Entertainment, Education, Other
 */
export const categories = sqliteTable('categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  icon: text('icon').notNull(), // Ionicons name, e.g. 'restaurant', 'car'
  color: text('color').notNull(), // Hex color code
  type: text('type').$type<'expense' | 'income' | 'both'>().notNull().default('expense'),
  createdAt: integer('created_at').notNull().$defaultFn(() => Date.now()),
});

/**
 * Accounts table
 * Default Indian payment modes: Cash, UPI, Bank, Card
 */
export const accounts = sqliteTable('accounts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(), // e.g. 'UPI', 'Cash', 'Bank', 'Card'
  icon: text('icon').notNull(),
  createdAt: integer('created_at').notNull().$defaultFn(() => Date.now()),
});

/**
 * Transactions table
 * CRITICAL RULE: amount is INTEGER PAISE (₹1 = 100 paise)
 * Never store floats.
 */
export const transactions = sqliteTable('transactions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type').$type<'expense' | 'income'>().notNull(),
  amountPaise: integer('amount_paise').notNull(), // integer paise (e.g. 5075 for ₹50.75)
  categoryId: integer('category_id')
    .notNull()
    .references(() => categories.id, { onDelete: 'cascade' }),
  accountId: integer('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  note: text('note'),
  date: text('date').notNull(), // ISO Date string (YYYY-MM-DD or full ISO)
  createdAt: integer('created_at').notNull().$defaultFn(() => Date.now()),
});

/**
 * Expense Limits / Budgets table
 * Supports weekly, monthly, and yearly total limits, plus monthly category-specific limits
 * Stored in INTEGER PAISE.
 */
export const expenseLimits = sqliteTable('expense_limits', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  categoryId: integer('category_id').references(() => categories.id, { onDelete: 'cascade' }), // null = overall monthly budget
  period: text('period').$type<'weekly' | 'monthly' | 'yearly'>().notNull().default('monthly'),
  limitPaise: integer('limit_paise').notNull(), // limit in paise (e.g. 200000 for ₹2000)
  createdAt: integer('created_at').notNull().$defaultFn(() => Date.now()),
  updatedAt: integer('updated_at').notNull().$defaultFn(() => Date.now()),
});

/**
 * Tasks table (Planner - Financial To-Dos & Bill Reminders)
 */
export type TaskReminderOffset = 10 | 30 | 60;

export const tasks = sqliteTable('tasks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  dueDate: text('due_date'), // e.g. "2026-10-15"
  dueTime: text('due_time'), // Local 24-hour time, e.g. "14:30"
  reminderOffsetMinutes: integer('reminder_offset_minutes').$type<TaskReminderOffset>(),
  amountPaise: integer('amount_paise'), // optional bill amount in paise (e.g. ₹799)
  isCompleted: integer('is_completed', { mode: 'boolean' }).notNull().default(false),
  notificationId: text('notification_id'),
  createdAt: integer('created_at').notNull().$defaultFn(() => Date.now()),
});

/**
 * Notes table — study / ideas notebook (optional amount in paise)
 */
export const notes = sqliteTable('notes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  content: text('content').notNull(),
  tag: text('tag').notNull().default('Study'),
  amountPaise: integer('amount_paise'),
  createdAt: integer('created_at').notNull().$defaultFn(() => Date.now()),
  updatedAt: integer('updated_at').notNull().$defaultFn(() => Date.now()),
});

/**
 * App settings key/value store (theme, lock, reminders)
 */
export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

// TypeScript Types inferred directly from the schema
export type Category = typeof categories.$inferSelect;
export type InsertCategory = typeof categories.$inferInsert;

export type Account = typeof accounts.$inferSelect;
export type InsertAccount = typeof accounts.$inferInsert;

export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = typeof transactions.$inferInsert;

export type ExpenseLimit = typeof expenseLimits.$inferSelect;
export type InsertExpenseLimit = typeof expenseLimits.$inferInsert;

export type Task = typeof tasks.$inferSelect;
export type InsertTask = typeof tasks.$inferInsert;

export type Note = typeof notes.$inferSelect;
export type InsertNote = typeof notes.$inferInsert;
