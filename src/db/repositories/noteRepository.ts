import { db } from '../client';
import { notes, Note, InsertNote } from '../schema';
import { eq, desc } from 'drizzle-orm';

export const noteRepository = {
  getAll: (): Note[] => {
    return db.select().from(notes).orderBy(desc(notes.updatedAt)).all();
  },

  add: (note: InsertNote): Note => {
    return db.insert(notes).values(note).returning().get();
  },

  update: (id: number, data: Partial<InsertNote>): Note => {
    return db
      .update(notes)
      .set({ ...data, updatedAt: Date.now() })
      .where(eq(notes.id, id))
      .returning()
      .get();
  },

  delete: (id: number): void => {
    db.delete(notes).where(eq(notes.id, id)).run();
  },

  clearAll: (): void => {
    db.delete(notes).run();
  },
};
