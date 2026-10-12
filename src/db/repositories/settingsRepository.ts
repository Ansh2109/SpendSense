import { expoDb } from '../client';

export const SETTING_KEYS = {
  themeMode: 'themeMode',
  userName: 'userName',
  budgetPeriod: 'budgetPeriod',
  appLockEnabled: 'appLockEnabled',
  dailyReminderEnabled: 'dailyReminderEnabled',
  dailyReminderNotifId: 'dailyReminderNotifId',
  taskReminderScheduleVersion: 'taskReminderScheduleVersion',
  noSpendChallenge: 'noSpendChallenge',
} as const;

export const settingsRepository = {
  get(key: string): string | null {
    const row = expoDb.getFirstSync<{ value: string }>(
      'SELECT value FROM app_settings WHERE key = ?',
      key
    );
    return row?.value ?? null;
  },

  set(key: string, value: string): void {
    expoDb.runSync(
      'INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)',
      key,
      value
    );
  },

  getAll(): { key: string; value: string }[] {
    return expoDb.getAllSync<{ key: string; value: string }>('SELECT key, value FROM app_settings');
  },

  replaceAll(rows: { key: string; value: string }[]): void {
    expoDb.execSync('DELETE FROM app_settings');
    for (const row of rows) {
      this.set(row.key, row.value);
    }
  },
};
