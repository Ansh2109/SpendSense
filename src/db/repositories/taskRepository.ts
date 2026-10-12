import { db } from '../client';
import { tasks, Task, InsertTask } from '../schema';
import { eq, desc } from 'drizzle-orm';

export const taskRepository = {
  getAll: (): Task[] => {
    return db.select().from(tasks).orderBy(desc(tasks.createdAt)).all();
  },

  getPending: (): Task[] => {
    return db.select().from(tasks).where(eq(tasks.isCompleted, false)).orderBy(desc(tasks.createdAt)).all();
  },

  getById: (id: number): Task | undefined => {
    return db.select().from(tasks).where(eq(tasks.id, id)).get();
  },

  add: (task: InsertTask): Task => {
    return db.insert(tasks).values(task).returning().get();
  },

  update: (id: number, data: Partial<InsertTask>): Task => {
    return db.update(tasks).set(data).where(eq(tasks.id, id)).returning().get();
  },

  toggleComplete: (id: number, currentStatus: boolean): Task => {
    return db.update(tasks).set({ isCompleted: !currentStatus }).where(eq(tasks.id, id)).returning().get();
  },

  delete: (id: number): void => {
    db.delete(tasks).where(eq(tasks.id, id)).run();
  },

  clearAll: (): void => {
    db.delete(tasks).run();
  },
};
