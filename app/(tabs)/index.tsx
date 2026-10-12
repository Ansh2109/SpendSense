import React, { useMemo, useState } from 'react';
import { Alert, Modal, Pressable, View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, ThemeMode } from '../../src/context/ThemeContext';
import { Spacing, BorderRadius, Typography } from '../../src/constants/theme';
import { formatPaiseToINR } from '../../src/utils/money';
import { useAppStore } from '../../src/store';
import { settingsRepository, SETTING_KEYS } from '../../src/db/repositories/settingsRepository';
import { BudgetEditorModal } from '../../src/components/BudgetEditorModal';
import { BUDGET_PERIOD_LABELS, isDateInBudgetPeriod } from '../../src/utils/budgetPeriod';
import { NoSpendChallenge, NoSpendChallengeGoal, getConsecutiveNoSpendDays, hasNoSpendChallengeBeenLost, parseNoSpendChallenge } from '../../src/utils/noSpendChallenge';
import { toDateOnly } from '../../src/utils/date';

export default function HomeScreen() {
  const router = useRouter();
  const { colors, mode, setMode, isDark } = useAppTheme();

  const {
    transactions,
    budgetPeriod,
    budgetLimits,
    setBudget,
    refreshAll,
  } = useAppStore();
  const [userName, setUserName] = useState('');
  const [budgetEditorVisible, setBudgetEditorVisible] = useState(false);
  const [noSpendChallenge, setNoSpendChallenge] = useState<NoSpendChallenge | null>(null);
  const [selectedChallengeDays, setSelectedChallengeDays] = useState<NoSpendChallengeGoal>(1);
  const [challengeConfirmVisible, setChallengeConfirmVisible] = useState(false);

  useFocusEffect(
    React.useCallback(() => {
      refreshAll();
      try {
        setUserName(settingsRepository.get(SETTING_KEYS.userName)?.trim() ?? '');
        const savedChallenge = parseNoSpendChallenge(settingsRepository.get(SETTING_KEYS.noSpendChallenge));
        setNoSpendChallenge(savedChallenge);
        setSelectedChallengeDays(savedChallenge?.goalDays ?? 1);
      } catch (error) {
        console.error('Failed to load home profile:', error);
      }
    }, [refreshAll])
  );

  const budgetLimitPaise = budgetLimits[budgetPeriod];
  const { periodIncomePaise, periodExpensePaise, totalIncomePaise, totalExpensePaise } =
    useMemo(() => {
      let mInc = 0;
      let mExp = 0;
      let tInc = 0;
      let tExp = 0;

      for (const tx of transactions) {
        const isInCurrentPeriod = isDateInBudgetPeriod(tx.date, budgetPeriod);
        if (tx.type === 'income') {
          tInc += tx.amountPaise;
          if (isInCurrentPeriod) mInc += tx.amountPaise;
        } else {
          tExp += tx.amountPaise;
          if (isInCurrentPeriod) mExp += tx.amountPaise;
        }
      }

      return {
        periodIncomePaise: mInc,
        periodExpensePaise: mExp,
        totalIncomePaise: tInc,
        totalExpensePaise: tExp,
      };
    }, [transactions, budgetPeriod]);

  const totalBalancePaise = totalIncomePaise - totalExpensePaise;
  const recentTransactions = transactions.slice(0, 5);
  const noSpendDays = useMemo(
    () => noSpendChallenge ? getConsecutiveNoSpendDays(noSpendChallenge, transactions) : 0,
    [noSpendChallenge, transactions]
  );
  const noSpendChallengeLost = useMemo(
    () => noSpendChallenge ? hasNoSpendChallengeBeenLost(noSpendChallenge, transactions) : false,
    [noSpendChallenge, transactions]
  );

  const startNoSpendChallenge = () => {
    setChallengeConfirmVisible(true);
  };

  const confirmNoSpendChallenge = () => {
    const nextChallenge: NoSpendChallenge = {
      goalDays: selectedChallengeDays,
      startedOn: toDateOnly(new Date()),
      startedAt: Date.now(),
    };
    try {
      settingsRepository.set(SETTING_KEYS.noSpendChallenge, JSON.stringify(nextChallenge));
      setNoSpendChallenge(nextChallenge);
      setChallengeConfirmVisible(false);
    } catch (error) {
      console.error('Failed to save no-spend challenge:', error);
      Alert.alert('Could not start challenge', 'Please try again.');
    }
  };

  // Budget progress
  const budgetUsagePercent =
    budgetLimitPaise > 0
      ? Math.round((periodExpensePaise / budgetLimitPaise) * 100)
      : 0;
  const isOverBudget = budgetLimitPaise > 0 && periodExpensePaise > budgetLimitPaise;

  const formatTxDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return `${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} • ${d.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })}`;
    } catch {
      return dateStr;
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <BudgetEditorModal
          visible={budgetEditorVisible}
          initialPeriod={budgetPeriod}
          limits={budgetLimits}
          onClose={() => setBudgetEditorVisible(false)}
          onSave={(period, limitPaise) => {
            if (setBudget(period, limitPaise)) setBudgetEditorVisible(false);
          }}
        />

        <Modal
          visible={challengeConfirmVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setChallengeConfirmVisible(false)}
        >
          <Pressable
            style={styles.challengeConfirmOverlay}
            onPress={() => setChallengeConfirmVisible(false)}
          >
            <Pressable
              style={[styles.challengeConfirmCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={(event) => event.stopPropagation()}
            >
              <View style={[styles.challengeConfirmIcon, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="flame" size={28} color={colors.primary} />
              </View>
              <Text style={[styles.challengeConfirmEyebrow, { color: colors.primary }]}>
                {noSpendChallenge ? 'FRESH START' : 'READY TO PROVE IT?'}
              </Text>
              <Text style={[styles.challengeConfirmTitle, { color: colors.text }]}>
                {noSpendChallenge ? 'Take the challenge again?' : 'You’re in?'}
              </Text>
              <Text style={[styles.challengeConfirmMessage, { color: colors.textSecondary }]}>
                Keep spending at zero for:
              </Text>

              <View style={[styles.challengeGoalPill, { backgroundColor: colors.surfaceElevated }]}>
                <Text style={[styles.challengeGoalNumber, { color: colors.primary }]}>{selectedChallengeDays}</Text>
                <Text style={[styles.challengeGoalLabel, { color: colors.text }]}>
                  {selectedChallengeDays === 1 ? 'NO-SPEND DAY' : 'CONSECUTIVE NO-SPEND DAYS'}
                </Text>
              </View>

              <View style={[styles.challengeRule, { backgroundColor: colors.expenseBg }]}>
                <Ionicons name="information-circle-outline" size={19} color={colors.expense} />
                <Text style={[styles.challengeRuleText, { color: colors.text }]}>
                  Any expense you record after accepting means this challenge is lost.
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.challengeAcceptButton, { backgroundColor: colors.primary }]}
                onPress={confirmNoSpendChallenge}
                accessibilityRole="button"
              >
                <Ionicons name="flash" size={17} color="#FFFFFF" />
                <Text style={styles.challengeAcceptText}>
                  {noSpendChallenge ? 'Restart challenge' : 'Accept challenge'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.challengeDeclineButton, { backgroundColor: colors.surfaceElevated }]}
                onPress={() => setChallengeConfirmVisible(false)}
                accessibilityRole="button"
              >
                <Text style={[styles.challengeDeclineText, { color: colors.textSecondary }]}>Not now</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Top Header - Centered SpendSense with Settings icon */}
        <View style={styles.header}>
          <View style={styles.headerPlaceholder} />
          <Text style={[styles.appName, { color: colors.primary }]}>SpendSense</Text>
          <TouchableOpacity
            style={[styles.iconButton, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
            onPress={() => router.push('/settings')}
            accessibilityLabel="Settings"
          >
            <Ionicons name="settings-outline" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>
        {userName.length > 0 && (
          <View style={[styles.welcomeCard, { backgroundColor: colors.primaryLight, borderColor: colors.border }]}>
            <View style={[styles.welcomeIcon, { backgroundColor: colors.surface }]}>
              <Ionicons name="sparkles" size={18} color={colors.primary} />
            </View>
            <View style={styles.welcomeCopy}>
              <Text style={[styles.welcomeTitle, { color: colors.text }]}>Welcome back, {userName}</Text>
              <Text style={[styles.welcomeSubtitle, { color: colors.textSecondary }]}>
                Your money check-in is ready.
              </Text>
            </View>
          </View>
        )}

        <View style={[styles.challengeCard, { backgroundColor: colors.primaryLight, borderColor: colors.border }]}>
          <View style={styles.challengeHeader}>
            <View style={[styles.challengeIcon, { backgroundColor: colors.surface }]}>
              <Ionicons name="flame" size={20} color={colors.primary} />
            </View>
            <View style={styles.challengeCopy}>
              <Text style={[styles.challengeTitle, { color: colors.text }]}>
                {noSpendChallenge ? 'No-Spend Challenge' : 'No spend. No excuses.'}
              </Text>
              <Text style={[styles.challengeSubtitle, { color: colors.textSecondary }]}>
                {noSpendChallenge
                  ? noSpendChallengeLost
                    ? 'Challenge lost — an expense was recorded after you accepted. Ready to try again?'
                    : noSpendDays >= noSpendChallenge.goalDays
                      ? 'Challenge crushed! Think you can beat your streak?'
                      : `Prove it today: Day ${noSpendDays + 1} of ${noSpendChallenge.goalDays}.`
                  : 'Think you can keep your wallet closed? Prove it.'}
              </Text>
            </View>
          </View>

          {noSpendChallenge ? (
            <View style={styles.challengeProgress}>
              <Text style={[styles.challengeProgressText, { color: colors.text }]}>
                {noSpendChallengeLost
                  ? 'Challenge lost'
                  : `${Math.min(noSpendDays, noSpendChallenge.goalDays)} / ${noSpendChallenge.goalDays} no-spend days`}
              </Text>
              <View style={styles.challengeDots}>
                {Array.from({ length: noSpendChallenge.goalDays }).map((_, index) => (
                  <View
                    key={index}
                    style={[
                      styles.challengeDot,
                      {
                        backgroundColor: !noSpendChallengeLost && index < noSpendDays ? colors.primary : colors.surface,
                        borderColor: colors.primary,
                      },
                    ]}
                  />
                ))}
              </View>
            </View>
          ) : null}

          <View style={styles.challengeChoices}>
            {([1, 2, 3] as NoSpendChallengeGoal[]).map((days) => (
              <TouchableOpacity
                key={days}
                style={[
                  styles.challengeChoice,
                  {
                    backgroundColor: selectedChallengeDays === days ? colors.primary : colors.surface,
                    borderColor: selectedChallengeDays === days ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => setSelectedChallengeDays(days)}
              >
                <Text style={[
                  styles.challengeChoiceText,
                  { color: selectedChallengeDays === days ? '#FFFFFF' : colors.textSecondary },
                ]}>
                  {days} {days === 1 ? 'day' : 'days'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            style={[styles.challengeButton, { backgroundColor: colors.primary }]}
            onPress={startNoSpendChallenge}
          >
            <Ionicons name={noSpendChallenge ? 'refresh' : 'flash'} size={16} color="#FFFFFF" />
            <Text style={styles.challengeButtonText}>
              {noSpendChallengeLost ? 'Try again' : noSpendChallenge ? 'Start this streak' : 'Take the challenge'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Total Balance Card */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardCaption, { color: colors.textSecondary }]}>Total Balance</Text>
          <Text
            style={[
              styles.balanceAmount,
              { color: totalBalancePaise < 0 ? colors.expense : colors.text },
            ]}
          >
            {formatPaiseToINR(totalBalancePaise)}
          </Text>

          <Text style={[styles.monthSubtitle, { color: colors.textSecondary }]}>
            THIS {BUDGET_PERIOD_LABELS[budgetPeriod].toUpperCase()}'S SUMMARY
          </Text>
          <View style={styles.metricRow}>
            <View style={[styles.metricBox, { backgroundColor: colors.incomeBg }]}>
              <View style={styles.metricLabelRow}>
                <Ionicons name="arrow-down-circle" size={16} color={colors.income} />
                <Text style={[styles.metricLabel, { color: colors.income }]}>Income</Text>
              </View>
              <Text style={[styles.metricValue, { color: colors.income }]}>
                {formatPaiseToINR(periodIncomePaise)}
              </Text>
            </View>

            <View style={[styles.metricBox, { backgroundColor: colors.expenseBg }]}>
              <View style={styles.metricLabelRow}>
                <Ionicons name="arrow-up-circle" size={16} color={colors.expense} />
                <Text style={[styles.metricLabel, { color: colors.expense }]}>Expenses</Text>
              </View>
              <Text style={[styles.metricValue, { color: colors.expense }]}>
                {formatPaiseToINR(periodExpensePaise)}
              </Text>
            </View>
          </View>

          {/* Quick-Add Buttons: Aligned directly under Income (left) and Expense (right) */}
          <View style={styles.quickAddRow}>
            <TouchableOpacity
              style={[styles.quickAddButton, { backgroundColor: colors.income }]}
              onPress={() => router.push({ pathname: '/(tabs)/add', params: { type: 'income' } })}
            >
              <Ionicons name="arrow-down-circle" size={16} color="#FFFFFF" />
              <Text style={styles.quickAddText}>+ Income</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.quickAddButton, { backgroundColor: colors.expense }]}
              onPress={() => router.push({ pathname: '/(tabs)/add', params: { type: 'expense' } })}
            >
              <Ionicons name="add-circle" size={16} color="#FFFFFF" />
              <Text style={styles.quickAddText}>+ Expense</Text>
            </TouchableOpacity>
          </View>

          {/* Low-income warning: expenses exceed income */}
          {totalExpensePaise > totalIncomePaise && (
            <View style={[styles.lowIncomeWarning, { backgroundColor: colors.expenseBg, borderColor: colors.expense }]}>
              <Ionicons name="warning" size={16} color={colors.expense} />
              <Text style={[styles.lowIncomeText, { color: colors.expense }]}>
                ⚠️ Your expenses ({formatPaiseToINR(totalExpensePaise)}) exceed your total income ({formatPaiseToINR(totalIncomePaise)}). Consider reducing spending!
              </Text>
            </View>
          )}
        </View>

        {/* Selected Period Budget Health Card */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.themeHeaderRow}>
            <Ionicons name="shield-checkmark" size={20} color={colors.primary} />
            <Text style={[styles.cardTitle, { color: colors.text }]}>{BUDGET_PERIOD_LABELS[budgetPeriod]} Spending Limit</Text>
          </View>

          <View style={[styles.limitDisplayBox, { backgroundColor: colors.surfaceElevated }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Text style={[styles.cardCaption, { color: colors.textSecondary }]}>{BUDGET_PERIOD_LABELS[budgetPeriod]} total</Text>
              <Text style={[styles.cardCaption, { color: isOverBudget ? colors.expense : colors.textSecondary }]}>
                Spent: {formatPaiseToINR(periodExpensePaise)} {budgetLimitPaise > 0 ? `(${budgetUsagePercent}%)` : ''}
              </Text>
            </View>
            <Text style={[styles.limitAmountText, { color: colors.primary }]}>
              {budgetLimitPaise > 0 ? formatPaiseToINR(budgetLimitPaise) : 'Not set'}
            </Text>

            {/* Progress Bar */}
            {budgetLimitPaise > 0 && <View style={[styles.progressBarTrack, { backgroundColor: colors.border }]}>
              <View
                style={[
                  styles.progressBarFill,
                  {
                    width: `${Math.min(budgetUsagePercent, 100)}%`,
                    backgroundColor: isOverBudget ? colors.expense : colors.primary,
                  },
                ]}
              />
            </View>}

            {isOverBudget && (
              <Text style={[styles.overBudgetWarning, { color: colors.expense }]}>
                Over limit by {formatPaiseToINR(periodExpensePaise - budgetLimitPaise)}.
              </Text>
            )}
          </View>

          <TouchableOpacity
            style={[styles.editBudgetButton, { backgroundColor: colors.primaryLight, borderColor: colors.border }]}
            onPress={() => setBudgetEditorVisible(true)}
          >
            <Ionicons name="options-outline" size={17} color={colors.primary} />
            <Text style={[styles.editBudgetText, { color: colors.primary }]}>
              {budgetLimitPaise > 0 ? 'Change limit or period' : 'Set a spending limit'}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Last 5 Transactions Preview */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Last 5 Transactions</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/transactions')}>
              <Text style={[styles.seeAllText, { color: colors.primary }]}>See all ({transactions.length})</Text>
            </TouchableOpacity>
          </View>

          {recentTransactions.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="receipt-outline" size={32} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                No transactions yet. Tap "+ Expense" or "+ Income" above.
              </Text>
            </View>
          ) : (
            recentTransactions.map((tx) => (
              <TouchableOpacity
                key={tx.id}
                style={styles.txRow}
                onPress={() => router.push({ pathname: '/(tabs)/add', params: { id: tx.id.toString() } })}
              >
                <View
                  style={[
                    styles.txIconCircle,
                    { backgroundColor: tx.type === 'expense' ? colors.expenseBg : colors.incomeBg },
                  ]}
                >
                  <Ionicons
                    name={tx.categoryIcon as any}
                    size={18}
                    color={tx.type === 'expense' ? colors.expense : colors.income}
                  />
                </View>
                <View style={styles.txInfo}>
                  <Text style={[styles.txTitle, { color: colors.text }]}>
                    {tx.note || tx.categoryName}
                  </Text>
                  <Text style={[styles.txMeta, { color: colors.textSecondary }]}>
                    {formatTxDate(tx.date)} • {tx.accountName}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.txAmount,
                    { color: tx.type === 'expense' ? colors.expense : colors.income },
                  ]}
                >
                  {tx.type === 'expense' ? '-' : '+'}
                  {formatPaiseToINR(tx.amountPaise)}
                </Text>
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Theme Preview Selector */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.themeHeaderRow}>
            <Ionicons name={isDark ? 'moon' : 'sunny'} size={18} color={colors.primary} />
            <Text style={[styles.cardTitle, { color: colors.text }]}>Appearance & Theme</Text>
          </View>
          <View style={styles.themeSelectorRow}>
            {(['system', 'light', 'dark'] as ThemeMode[]).map((themeOption) => {
              const active = mode === themeOption;
              return (
                <TouchableOpacity
                  key={themeOption}
                  style={[
                    styles.themeChip,
                    {
                      backgroundColor: active ? colors.primary : colors.surfaceElevated,
                      borderColor: active ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => setMode(themeOption)}
                >
                  <Text
                    style={[
                      styles.themeChipText,
                      { color: active ? '#FFFFFF' : colors.textSecondary, textTransform: 'capitalize' },
                    ]}
                  >
                    {themeOption}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
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
    gap: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  appName: {
    fontSize: Typography.xxl,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  welcomeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  welcomeIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.full,
  },
  welcomeCopy: {
    flex: 1,
  },
  welcomeTitle: {
    fontSize: Typography.md,
    fontWeight: '800',
  },
  welcomeSubtitle: {
    fontSize: Typography.xs,
    marginTop: 2,
  },
  challengeCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  challengeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  challengeIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  challengeCopy: {
    flex: 1,
    gap: 2,
  },
  challengeTitle: {
    fontSize: Typography.md,
    fontWeight: '800',
  },
  challengeSubtitle: {
    fontSize: Typography.xs,
    lineHeight: 17,
  },
  challengeProgress: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  challengeProgressText: {
    fontSize: Typography.sm,
    fontWeight: '700',
  },
  challengeDots: {
    flexDirection: 'row',
    gap: 6,
  },
  challengeDot: {
    width: 12,
    height: 12,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  challengeChoices: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  challengeChoice: {
    flex: 1,
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingVertical: 8,
    alignItems: 'center',
  },
  challengeChoiceText: {
    fontSize: Typography.xs,
    fontWeight: '700',
  },
  challengeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.md,
  },
  challengeButtonText: {
    color: '#FFFFFF',
    fontSize: Typography.sm,
    fontWeight: '700',
  },
  challengeConfirmOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.58)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  challengeConfirmCard: {
    width: '100%',
    maxWidth: 370,
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
  },
  challengeConfirmIcon: {
    width: 60,
    height: 60,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  challengeConfirmEyebrow: {
    fontSize: Typography.xs,
    fontWeight: '800',
    letterSpacing: 1,
  },
  challengeConfirmTitle: {
    fontSize: Typography.xl,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 4,
  },
  challengeConfirmMessage: {
    fontSize: Typography.sm,
    marginTop: Spacing.xs,
  },
  challengeGoalPill: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.md,
  },
  challengeGoalNumber: {
    fontSize: Typography.xxl,
    fontWeight: '900',
  },
  challengeGoalLabel: {
    flexShrink: 1,
    fontSize: Typography.xs,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  challengeRule: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xs,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
  },
  challengeRuleText: {
    flex: 1,
    fontSize: Typography.xs,
    lineHeight: 17,
    fontWeight: '600',
  },
  challengeAcceptButton: {
    width: '100%',
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.md,
  },
  challengeAcceptText: {
    color: '#FFFFFF',
    fontSize: Typography.sm,
    fontWeight: '800',
  },
  challengeDeclineButton: {
    width: '100%',
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.md,
    marginTop: Spacing.xs,
  },
  challengeDeclineText: {
    fontSize: Typography.sm,
    fontWeight: '700',
  },
  headerPlaceholder: {
    width: 44, // matches iconButton width to center appName
  },
  subtitle: {
    fontSize: Typography.xs,
    marginTop: 2,
    fontWeight: '500',
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    shadowColor: '#163B28',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  themeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  seeAllText: {
    fontSize: Typography.xs,
    fontWeight: '700',
  },
  cardTitle: {
    fontSize: Typography.md,
    fontWeight: '700',
  },
  cardCaption: {
    fontSize: Typography.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  balanceAmount: {
    fontSize: Typography.hero,
    fontWeight: '800',
    marginTop: Spacing.xs,
    marginBottom: Spacing.sm,
    letterSpacing: -0.5,
  },
  monthSubtitle: {
    fontSize: Typography.xs,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: Spacing.xs,
  },
  metricRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  metricBox: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  metricLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  metricLabel: {
    fontSize: Typography.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  metricValue: {
    fontSize: Typography.md,
    fontWeight: '700',
  },
  quickAddRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  quickAddButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  quickAddText: {
    color: '#FFFFFF',
    fontSize: Typography.xs,
    fontWeight: '700',
  },
  lowIncomeWarning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  lowIncomeText: {
    flex: 1,
    fontSize: Typography.xs,
    fontWeight: '600',
    lineHeight: 16,
  },
  limitDisplayBox: {
    marginVertical: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  limitAmountText: {
    fontSize: Typography.hero,
    fontWeight: '800',
    marginTop: 2,
    letterSpacing: -0.5,
  },
  progressBarTrack: {
    height: 6,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
    marginTop: Spacing.sm,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: BorderRadius.full,
  },
  overBudgetWarning: {
    fontSize: Typography.xs,
    fontWeight: '700',
    marginTop: 6,
  },
  editBudgetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  editBudgetText: {
    flex: 1,
    fontSize: Typography.sm,
    fontWeight: '700',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
    gap: Spacing.xs,
  },
  emptyText: {
    fontSize: Typography.xs,
    textAlign: 'center',
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs + 2,
  },
  txIconCircle: {
    width: 38,
    height: 38,
    borderRadius: BorderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  txInfo: {
    flex: 1,
  },
  txTitle: {
    fontSize: Typography.sm,
    fontWeight: '600',
  },
  txMeta: {
    fontSize: Typography.xs,
    marginTop: 2,
  },
  txAmount: {
    fontSize: Typography.sm,
    fontWeight: '700',
  },
  themeSelectorRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  themeChip: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    alignItems: 'center',
  },
  themeChipText: {
    fontSize: Typography.sm,
    fontWeight: '600',
  },
});
