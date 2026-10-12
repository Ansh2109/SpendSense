import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, ThemeMode } from '../src/context/ThemeContext';
import { Spacing, BorderRadius, Typography } from '../src/constants/theme';
import { useAppStore } from '../src/store';
import { SETTING_KEYS, settingsRepository } from '../src/db/repositories/settingsRepository';
import { authenticateAppLock, canUseAppLock, isAppLockEnabled, setAppLockEnabled } from '../src/services/appLockService';
import { cancelNotification, disableDailyExpenseReminder, enableDailyExpenseReminder } from '../src/services/notificationService';
import { exportBackup, importBackup } from '../src/services/backupService';
import { ConfirmActionModal } from '../src/components/ConfirmActionModal';
import { taskRepository } from '../src/db/repositories';

export default function SettingsScreen() {
  const { colors, mode, setMode } = useAppTheme();
  const { resetAllData, refreshAll } = useAppStore();
  const [appLockEnabled, setAppLockState] = useState(false);
  const [dailyReminderEnabled, setDailyReminderState] = useState(false);
  const [userName, setUserName] = useState('');
  const [savedName, setSavedName] = useState('');
  const [isWorking, setIsWorking] = useState(false);
  const [isLockWorking, setIsLockWorking] = useState(false);
  const [resetConfirmVisible, setResetConfirmVisible] = useState(false);

  const loadPreferences = useCallback(() => {
    try {
      setAppLockState(isAppLockEnabled());
      setDailyReminderState(settingsRepository.get(SETTING_KEYS.dailyReminderEnabled) === '1');
      const savedUserName = settingsRepository.get(SETTING_KEYS.userName) ?? '';
      setUserName(savedUserName);
      setSavedName(savedUserName);
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    loadPreferences();
  }, [loadPreferences]));

  const handleAppLockChange = async (enabled: boolean) => {
    setIsLockWorking(true);
    try {
      if (!enabled) {
        setAppLockEnabled(false);
        setAppLockState(false);
        return;
      }
      const availability = await canUseAppLock();
      if (!availability.ok) {
        Alert.alert('App Lock Unavailable', availability.reason ?? 'App lock is not available on this device.');
        return;
      }
      if (!(await authenticateAppLock())) {
        Alert.alert('Authentication Not Confirmed', 'App Lock was not enabled. Try again and confirm with your device authentication.');
        return;
      }
      setAppLockEnabled(true);
      setAppLockState(true);
    } catch (error) {
      console.error('Failed to update app lock:', error);
      Alert.alert('App Lock Error', 'Could not update the app lock setting.');
    } finally {
      setIsLockWorking(false);
    }
  };

  const handleReminderChange = async (enabled: boolean) => {
    setIsWorking(true);
    try {
      if (enabled) {
        const enabledSuccessfully = await enableDailyExpenseReminder();
        if (!enabledSuccessfully) {
          Alert.alert('Reminder Not Enabled', 'Allow notifications for SpendSense in your phone settings, then try again.');
          return;
        }
      } else {
        const disabledSuccessfully = await disableDailyExpenseReminder();
        if (!disabledSuccessfully) {
          Alert.alert('Reminder Still Enabled', 'Could not cancel the scheduled reminder. Please try again.');
          return;
        }
      }
      setDailyReminderState(enabled);
    } catch (error) {
      console.error('Failed to update daily reminder:', error);
      Alert.alert(
        'Reminder Error',
        error instanceof Error ? error.message : 'Could not update the daily reminder setting.'
      );
    } finally {
      setIsWorking(false);
    }
  };

  const handleSaveName = () => {
    const nextName = userName.trim();
    try {
      settingsRepository.set(SETTING_KEYS.userName, nextName);
      setUserName(nextName);
      setSavedName(nextName);
    } catch (error) {
      console.error('Failed to save user name:', error);
      Alert.alert('Profile Error', 'Could not save your name.');
    }
  };

  const handleBackupExport = async () => {
    setIsWorking(true);
    try {
      await exportBackup();
    } catch {
      Alert.alert('Backup Error', 'Could not create your backup file.');
    } finally {
      setIsWorking(false);
    }
  };

  const handleBackupImport = async () => {
    setIsWorking(true);
    try {
      await importBackup();
      refreshAll();
      Alert.alert('Backup Restored', 'Your SpendSense data has been restored.');
    } catch {
      Alert.alert('Restore Error', 'This backup could not be restored.');
    } finally {
      setIsWorking(false);
    }
  };

  const handleResetData = () => {
    setResetConfirmVisible(true);
  };

  const confirmResetData = async () => {
    try {
      for (const task of taskRepository.getAll()) {
        if (task.notificationId && !(await cancelNotification(task.notificationId))) {
          Alert.alert('Reset Paused', 'Could not cancel a task reminder. Your data was not reset; please try again.');
          return;
        }
      }
      resetAllData();
      setResetConfirmVisible(false);
      Alert.alert('Reset Complete', 'Your transactions, tasks, notes, and budget have been cleared.');
    } catch (error) {
      console.error('Failed to reset app data:', error);
      Alert.alert('Reset Error', 'Could not safely cancel task reminders, so your data was not reset.');
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <ConfirmActionModal
        visible={resetConfirmVisible}
        title="Clear all app data?"
        message="Your transactions, tasks, notes, and budgets will be deleted. Default categories and accounts will stay. This can’t be undone."
        confirmText="Reset everything"
        onCancel={() => setResetConfirmVisible(false)}
        onConfirm={confirmResetData}
      />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={[styles.introCard, { backgroundColor: colors.primaryLight, borderColor: colors.border }]}>
          <View style={[styles.introIcon, { backgroundColor: colors.surface }]}>
            <Ionicons name="options-outline" size={22} color={colors.primary} />
          </View>
          <View style={styles.introContent}>
            <Text style={[styles.introTitle, { color: colors.text }]}>Make SpendSense yours</Text>
            <Text style={[styles.itemSubtitle, { color: colors.textSecondary }]}>
              Manage your profile, preferences, and data in one place.
            </Text>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Ionicons name="person-circle-outline" size={18} color={colors.primary} />
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>PROFILE</Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.profileHeading}>
            <View style={[styles.profileIcon, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="person-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.profileHeadingText}>
              <Text style={[styles.itemTitle, { color: colors.text }]}>Your profile</Text>
            </View>
          </View>
          {savedName.length > 0 && (
            <View style={[styles.welcomeMessage, { backgroundColor: colors.surfaceElevated }]}>
              <Ionicons name="sparkles-outline" size={16} color={colors.primary} />
              <Text style={[styles.welcomeTitle, { color: colors.textSecondary }]}>Hello,</Text>
              <Text style={[styles.welcomeTitle, { color: colors.primary }]}>{savedName}</Text>
            </View>
          )}
          <View style={styles.nameForm}>
            <TextInput
              style={[styles.nameInput, { backgroundColor: colors.surfaceElevated, borderColor: colors.border, color: colors.text }]}
              value={userName}
              onChangeText={setUserName}
              placeholder="Enter your name"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="words"
              maxLength={40}
              returnKeyType="done"
              onSubmitEditing={handleSaveName}
            />
            <TouchableOpacity
              style={[styles.saveNameButton, { backgroundColor: colors.primary }]}
              onPress={handleSaveName}
              accessibilityRole="button"
              accessibilityLabel="Save name"
            >
              <Text style={styles.saveNameButtonText}>Save</Text>
              <Ionicons name="checkmark" size={17} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Ionicons name="color-palette-outline" size={18} color={colors.primary} />
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>APPEARANCE</Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.itemTitle, { color: colors.text }]}>Choose your theme</Text>
          <Text style={[styles.itemSubtitle, { color: colors.textSecondary }]}>
            Pick a look that feels comfortable to you.
          </Text>

          <View style={styles.themeOptions}>
            {(['system', 'light', 'dark'] as ThemeMode[]).map((opt) => {
              const selected = mode === opt;
              return (
                <TouchableOpacity
                  key={opt}
                  style={[
                    styles.themeOptionButton,
                    {
                      backgroundColor: selected ? colors.primary : colors.surfaceElevated,
                      borderColor: selected ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => setMode(opt)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Ionicons
                    name={
                      opt === 'system'
                        ? 'phone-portrait-outline'
                        : opt === 'light'
                        ? 'sunny-outline'
                        : 'moon-outline'
                    }
                    size={19}
                    color={selected ? '#FFFFFF' : colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.themeOptionText,
                      { color: selected ? '#FFFFFF' : colors.text, textTransform: 'capitalize' },
                    ]}
                  >
                    {opt === 'system' ? 'System' : opt === 'light' ? 'Light' : 'Dark'}
                  </Text>
                  {selected && <Ionicons name="checkmark-circle" size={16} color="#FFFFFF" />}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Ionicons name="shield-checkmark-outline" size={18} color={colors.primary} />
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>SECURITY & REMINDERS</Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.previewItem}>
            <View style={[styles.settingIcon, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="lock-closed-outline" size={19} color={colors.primary} />
            </View>
            <View style={styles.previewItemContent}>
              <Text style={[styles.itemTitle, { color: colors.text }]}>Biometric App Lock</Text>
              <Text style={[styles.itemSubtitle, { color: colors.textSecondary }]}>Face ID / fingerprint protection</Text>
            </View>
            <Switch value={appLockEnabled} onValueChange={handleAppLockChange} disabled={isLockWorking} trackColor={{ true: colors.primary }} />
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={styles.previewItem}>
            <View style={[styles.settingIcon, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="notifications-outline" size={19} color={colors.primary} />
            </View>
            <View style={styles.previewItemContent}>
              <Text style={[styles.itemTitle, { color: colors.text }]}>Daily Reminders</Text>
              <Text style={[styles.itemSubtitle, { color: colors.textSecondary }]}>A gentle prompt at 8:00 PM</Text>
            </View>
            <Switch value={dailyReminderEnabled} onValueChange={handleReminderChange} disabled={isWorking} trackColor={{ true: colors.primary }} />
          </View>

        </View>

        <View style={styles.sectionHeader}>
          <Ionicons name="archive-outline" size={18} color={colors.primary} />
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>BACKUP & RESTORE</Text>
        </View>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.profileHeading}>
            <View style={[styles.profileIcon, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="folder-open-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.profileHeadingText}>
              <Text style={[styles.itemTitle, { color: colors.text }]}>Keep your data safe</Text>
              <Text style={[styles.itemSubtitle, { color: colors.textSecondary }]}>
                Export a backup or restore one you saved earlier.
              </Text>
            </View>
          </View>
          <View style={styles.backupActions}>
            <TouchableOpacity disabled={isWorking} style={[styles.backupButton, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]} onPress={handleBackupExport}>
              <Ionicons name="download-outline" size={18} color={colors.primary} />
              <Text style={[styles.backupButtonText, { color: colors.primary }]}>Export Backup</Text>
            </TouchableOpacity>
            <TouchableOpacity disabled={isWorking} style={[styles.backupButton, { backgroundColor: colors.primary, borderColor: colors.primary }]} onPress={handleBackupImport}>
              <Ionicons name="cloud-upload-outline" size={18} color="#FFFFFF" />
              <Text style={[styles.backupButtonText, { color: '#FFFFFF' }]}>Restore</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Ionicons name="warning-outline" size={18} color={colors.expense} />
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>DATA RESET</Text>
        </View>
        <View style={[styles.resetCard, { backgroundColor: colors.surface, borderColor: colors.expense }]}>
          <View style={styles.profileHeading}>
            <View style={[styles.settingIcon, { backgroundColor: colors.expenseBg }]}>
              <Ionicons name="trash-outline" size={19} color={colors.expense} />
            </View>
            <View style={styles.profileHeadingText}>
              <Text style={[styles.itemTitle, { color: colors.text }]}>Start fresh</Text>
              <Text style={[styles.itemSubtitle, { color: colors.textSecondary }]}>
                Clear transactions, tasks, notes, and budgets. This can’t be undone.
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.resetButton, { backgroundColor: colors.expenseBg, borderColor: colors.expense }]}
            onPress={handleResetData}
            accessibilityRole="button"
          >
            <Ionicons name="trash-bin-outline" size={18} color={colors.expense} />
            <Text style={[styles.resetButtonText, { color: colors.expense }]}>Clear all data</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.aboutFooter}>
          <Text style={[styles.aboutTitle, { color: colors.primary }]}>SpendSense</Text>
          <Text style={[styles.aboutTitle, { color: colors.textMuted }]}> ·  v1.0.0</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.md,
    gap: Spacing.sm + 2,
    paddingBottom: Spacing.xl,
  },
  introCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    padding: Spacing.md,
    marginBottom: Spacing.xs,
  },
  introIcon: {
    width: 46,
    height: 46,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  introContent: {
    flex: 1,
  },
  introTitle: {
    fontSize: Typography.lg,
    fontWeight: '800',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xxs,
  },
  sectionTitle: {
    fontSize: Typography.xs,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  card: {
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    padding: Spacing.md,
    shadowColor: '#163B28',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  profileHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  profileIcon: {
    width: 42,
    height: 42,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileHeadingText: {
    flex: 1,
  },
  welcomeMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    alignSelf: 'flex-start',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: Spacing.xs + 1,
    marginTop: Spacing.md,
  },
  welcomeTitle: {
    fontSize: Typography.xs,
    fontWeight: '700',
  },
  itemTitle: {
    fontSize: Typography.md,
    fontWeight: '600',
  },
  itemSubtitle: {
    fontSize: Typography.xs,
    marginTop: 2,
    lineHeight: 17,
  },
  themeOptions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  nameForm: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  nameInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    minHeight: 50,
    fontSize: Typography.sm,
  },
  saveNameButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
    minHeight: 50,
    borderRadius: BorderRadius.md,
  },
  saveNameButtonText: {
    color: '#FFFFFF',
    fontSize: Typography.sm,
    fontWeight: '700',
  },
  themeOptionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    minHeight: 48,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.xs,
  },
  themeOptionText: {
    fontSize: Typography.sm,
    fontWeight: '600',
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    minHeight: 48,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginTop: Spacing.md,
  },
  resetButtonText: {
    fontSize: Typography.sm,
    fontWeight: '700',
  },
  backupActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  backupButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    minHeight: 50,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.xs,
  },
  backupButtonText: {
    fontSize: Typography.xs,
    fontWeight: '700',
  },
  previewItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.xs + 2,
  },
  settingIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewItemContent: {
    flex: 1,
    paddingVertical: Spacing.xxs,
  },
  divider: {
    height: 1,
    marginVertical: Spacing.sm + 2,
    marginLeft: 40 + Spacing.md,
  },
  resetCard: {
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderLeftWidth: 3,
    padding: Spacing.md,
  },
  aboutFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
  aboutTitle: {
    fontSize: Typography.xs,
    fontWeight: '600',
  },
});
