import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { File as EXFile, Paths } from 'expo-file-system';
import { expoDb } from '../db/client';
import {
  accountRepository,
  categoryRepository,
  limitRepository,
  noteRepository,
  taskRepository,
  transactionRepository,
} from '../db/repositories';
import { settingsRepository } from '../db/repositories/settingsRepository';
import { db } from '../db/client';
import { accounts, categories, expenseLimits, notes, tasks, transactions } from '../db/schema';

const BACKUP_VERSION = 1;

export async function exportBackup(): Promise<void> {
  const payload = {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    categories: categoryRepository.getAll(),
    accounts: accountRepository.getAll(),
    transactions: transactionRepository.getAll(),
    expenseLimits: limitRepository.getAll(),
    tasks: taskRepository.getAll(),
    notes: noteRepository.getAll(),
    settings: settingsRepository.getAll(),
  };

  const filename = `SpendSense_backup_${Date.now()}.json`;
  const file = new EXFile(Paths.document, filename);
  file.write(JSON.stringify(payload, null, 2));

  const available = await Sharing.isAvailableAsync();
  if (available) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      dialogTitle: 'Save SpendSense backup',
    });
  } else {
    throw new Error(`Backup saved at ${file.uri}`);
  }
}

export async function importBackup(): Promise<void> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: 'application/json',
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (picked.canceled || !picked.assets?.[0]) {
    return;
  }

  const response = await fetch(picked.assets[0].uri);
  const text = await response.text();
  const data = JSON.parse(text) as {
    version?: number;
    categories?: unknown[];
    accounts?: unknown[];
    transactions?: unknown[];
    expenseLimits?: unknown[];
    tasks?: unknown[];
    notes?: unknown[];
    settings?: { key: string; value: string }[];
  };

  if (!data || typeof data !== 'object') {
    throw new Error('This file is not a SpendSense backup.');
  }

  expoDb.execSync('PRAGMA foreign_keys = OFF');
  expoDb.execSync(`
    DELETE FROM transactions;
    DELETE FROM tasks;
    DELETE FROM notes;
    DELETE FROM expense_limits;
    DELETE FROM categories;
    DELETE FROM accounts;
  `);

  const cats = (data.categories ?? []) as Parameters<typeof db.insert>[0] extends never ? never : typeof categories.$inferInsert[];
  for (const row of (data.categories ?? []) as typeof categories.$inferInsert[]) {
    db.insert(categories).values(row).run();
  }
  for (const row of (data.accounts ?? []) as typeof accounts.$inferInsert[]) {
    db.insert(accounts).values(row).run();
  }
  for (const row of (data.expenseLimits ?? []) as typeof expenseLimits.$inferInsert[]) {
    db.insert(expenseLimits).values(row).run();
  }
  for (const row of (data.transactions ?? []) as typeof transactions.$inferInsert[]) {
    db.insert(transactions).values(row).run();
  }
  for (const row of (data.tasks ?? []) as typeof tasks.$inferInsert[]) {
    db.insert(tasks).values(row).run();
  }
  for (const row of (data.notes ?? []) as typeof notes.$inferInsert[]) {
    db.insert(notes).values(row).run();
  }
  if (data.settings?.length) {
    settingsRepository.replaceAll(data.settings);
  }

  expoDb.execSync('PRAGMA foreign_keys = ON');
  void cats;
}
