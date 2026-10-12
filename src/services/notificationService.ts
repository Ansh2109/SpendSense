import { Platform } from 'react-native';
import { parseDateOnly } from '../utils/date';
import { settingsRepository, SETTING_KEYS } from '../db/repositories/settingsRepository';
import type { TaskReminderOffset } from '../db/schema';

const DAILY_CHANNEL = 'daily-reminders';
const DUE_CHANNEL = 'task-due-dates';

type NotificationsModule = typeof import('expo-notifications');
let notificationHandlerConfigured = false;
let notificationsPromise: Promise<NotificationsModule> | null = null;

async function getNotifications(): Promise<NotificationsModule> {
  if (!notificationsPromise) {
    notificationsPromise = import('expo-notifications').then((api) => {
      if (typeof api.setNotificationHandler !== 'function') {
        throw new Error(
          'Expo Notifications APIs are unavailable in this runtime. Use a compatible Expo Go version or a development build.'
        );
      }
      return api;
    }).catch((error: unknown) => {
      notificationsPromise = null;
      throw error;
    });
  }

  const api = await notificationsPromise;
  if (typeof api.setNotificationHandler !== 'function') {
    throw new Error(
      'Expo Notifications APIs are unavailable in this runtime. Use a compatible Expo Go version or a development build.'
    );
  }
  if (!notificationHandlerConfigured) {
    api.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    notificationHandlerConfigured = true;
  }
  return api;
}

async function ensureAndroidChannels(api: NotificationsModule): Promise<void> {
  if (Platform.OS !== 'android') return;
  if (typeof api.setNotificationChannelAsync !== 'function' || !api.AndroidImportance) {
    throw new Error(
      'Android notification APIs are unavailable in this app. Rebuild the native app with expo-notifications enabled.'
    );
  }
  await api.setNotificationChannelAsync(DAILY_CHANNEL, {
    name: 'Daily expense reminder',
    importance: api.AndroidImportance.DEFAULT,
  });
  await api.setNotificationChannelAsync(DUE_CHANNEL, {
    name: 'Task reminders',
    importance: api.AndroidImportance.HIGH,
  });
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const api = await getNotifications();
  await ensureAndroidChannels(api);
  const current = await api.getPermissionsAsync();
  if (current.granted) return true;
  const asked = await api.requestPermissionsAsync();
  return asked.granted;
}

function dueFireDate(
  dateStr: string,
  dueTime: string | null,
  reminderOffsetMinutes: TaskReminderOffset | null
): Date | null {
  const due = parseDateOnly(dateStr);
  if (!due) return null;
  if (dueTime) {
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(dueTime);
    if (!match) return null;
    due.setHours(Number(match[1]), Number(match[2]), 0, 0);
    const fireAt = new Date(due);
    fireAt.setMinutes(fireAt.getMinutes() - (reminderOffsetMinutes ?? 30));
    if (fireAt.getTime() > Date.now()) return fireAt;
    return due.getTime() > Date.now() ? new Date(Date.now() + 8_000) : null;
  }

  due.setHours(0, 0, 0, 0);
  if (due.getTime() > Date.now()) return due;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  return due.getTime() === todayStart.getTime() ? new Date(Date.now() + 8_000) : null;
}

export async function scheduleTaskDueNotification(
  title: string,
  dueDate: string | null,
  dueTime: string | null,
  reminderOffsetMinutes: TaskReminderOffset | null
): Promise<string | null> {
  if (!dueDate || Platform.OS === 'web') return null;
  const fireAt = dueFireDate(dueDate, dueTime, reminderOffsetMinutes);
  if (!fireAt || !(await requestNotificationPermission())) return null;

  try {
    const api = await getNotifications();
    return await api.scheduleNotificationAsync({
      content: {
        title: 'Task reminder',
        body: dueTime
          ? `Remember to complete: ${title}`
          : `Remember to complete today: ${title}`,
        sound: true,
      },
      trigger: { type: api.SchedulableTriggerInputTypes.DATE, date: fireAt, channelId: DUE_CHANNEL },
    });
  } catch (error) {
    console.error('Failed to schedule due notification:', error);
    throw error;
  }
}

export async function cancelNotification(id: string | null | undefined): Promise<boolean> {
  if (!id || Platform.OS === 'web') return true;
  try {
    const api = await getNotifications();
    await api.cancelScheduledNotificationAsync(id);
    return true;
  } catch (error) {
    console.error('Failed to cancel notification:', error);
    return false;
  }
}

export async function enableDailyExpenseReminder(): Promise<boolean> {
  if (!(await requestNotificationPermission())) return false;
  const existing = settingsRepository.get(SETTING_KEYS.dailyReminderNotifId);

  let scheduledId: string | null = null;
  try {
    const api = await getNotifications();
    scheduledId = await api.scheduleNotificationAsync({
      content: { title: 'SpendSense', body: 'Quick reminder: log today’s expenses while you remember them.', sound: true },
      trigger: { type: api.SchedulableTriggerInputTypes.DAILY, hour: 20, minute: 0, channelId: DAILY_CHANNEL },
    });
    settingsRepository.set(SETTING_KEYS.dailyReminderEnabled, '1');
    settingsRepository.set(SETTING_KEYS.dailyReminderNotifId, scheduledId);
    if (existing && existing !== scheduledId) {
      try {
        await api.cancelScheduledNotificationAsync(existing);
      } catch (error) {
        console.error('Failed to replace previous daily reminder:', error);
      }
    }
    return true;
  } catch (error) {
    console.error('Failed to enable daily reminder:', error);
    if (scheduledId) {
      try {
        const api = await getNotifications();
        await api.cancelScheduledNotificationAsync(scheduledId);
      } catch (cancelError) {
        console.error('Failed to cancel an unsaved daily reminder:', cancelError);
      }
    }
    return false;
  }
}

export async function disableDailyExpenseReminder(): Promise<boolean> {
  const existing = settingsRepository.get(SETTING_KEYS.dailyReminderNotifId);
  try {
    if (existing && Platform.OS !== 'web') {
      const api = await getNotifications();
      await api.cancelScheduledNotificationAsync(existing);
    }
    settingsRepository.set(SETTING_KEYS.dailyReminderEnabled, '0');
    settingsRepository.set(SETTING_KEYS.dailyReminderNotifId, '');
    return true;
  } catch (error) {
    console.error('Failed to disable daily reminder:', error);
    return false;
  }
}
