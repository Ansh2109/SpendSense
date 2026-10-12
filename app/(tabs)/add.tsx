import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../src/context/ThemeContext';
import { Spacing, BorderRadius, Typography } from '../../src/constants/theme';
import { rupeesToPaise, paiseToRupees, formatPaiseToINR } from '../../src/utils/money';
import {
  categoryRepository,
  accountRepository,
  transactionRepository,
} from '../../src/db/repositories';
import { Category, Account, Transaction } from '../../src/db/schema';
import { useAppStore } from '../../src/store/useAppStore';
import { ConfirmActionModal } from '../../src/components/ConfirmActionModal';
import { formatDateOnly, isValidTransactionDate, parseDateOnly } from '../../src/utils/date';

// Parse "YYYY-MM-DD" string from a Date safely
function toDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Validate user-typed date string "YYYY-MM-DD"
function isValidDateStr(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && isValidTransactionDate(s);
}

// Build ISO string from a date-only string + a reference time (for the time component)
function buildISO(dateOnly: string, refTime: Date): string {
  const [y, m, day] = dateOnly.split('-').map(Number);
  const d = new Date(refTime);
  d.setFullYear(y, m - 1, day);
  return d.toISOString();
}

export default function AddTransactionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; type?: 'expense' | 'income' }>();
  const isEditing = Boolean(params.id);
  const editId = params.id ? parseInt(params.id, 10) : null;

  const { colors, isDark } = useAppTheme();

  // Form State
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [amountStr, setAmountStr] = useState<string>('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [note, setNote] = useState<string>('');
  // Date mode: 'auto' = use current time; 'manual' = user picks date only
  const [dateMode, setDateMode] = useState<'auto' | 'manual'>('auto');
  // The actual recorded timestamp (now when adding, loaded from DB when editing)
  const [recordedAt, setRecordedAt] = useState<Date>(new Date());
  // User-typed date in YYYY-MM-DD format (for manual mode)
  const [manualDateStr, setManualDateStr] = useState<string>(toDateOnly(new Date()));

  // Visual Calendar Modal State
  const [calendarVisible, setCalendarVisible] = useState<boolean>(false);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [calViewYear, setCalViewYear] = useState<number>(new Date().getFullYear());
  const [calViewMonth, setCalViewMonth] = useState<number>(new Date().getMonth()); // 0-indexed

  // Database Data
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [totalIncomePaise, setTotalIncomePaise] = useState<number>(0);
  const [totalExpensePaise, setTotalExpensePaise] = useState<number>(0);
  const [existingTx, setExistingTx] = useState<Transaction | null>(null);

  // Load categories, accounts & financial totals from SQLite
  const loadData = useCallback(() => {
    try {
      const allCats = categoryRepository.getAll();
      const allAccs = accountRepository.getAll();
      const paymentAccounts = allAccs.filter((account) => account.name.trim().toLowerCase() !== 'bank');
      const allTx = transactionRepository.getAll();

      const inc = allTx
        .filter((t) => t.type === 'income')
        .reduce((sum, t) => sum + t.amountPaise, 0);
      const exp = allTx
        .filter((t) => t.type === 'expense')
        .reduce((sum, t) => sum + t.amountPaise, 0);

      setCategories(allCats);
      setAccounts(paymentAccounts);
      setTotalIncomePaise(inc);
      setTotalExpensePaise(exp);

      // Default select UPI or first account if none selected
      if (!selectedAccountId && paymentAccounts.length > 0) {
        const upi = paymentAccounts.find((account) => account.name.toLowerCase() === 'upi');
        setSelectedAccountId(upi ? upi.id : paymentAccounts[0].id);
      }
    } catch (err) {
      console.error('Failed to load categories or accounts:', err);
    }
  }, [selectedAccountId]);

  useFocusEffect(
    useCallback(() => {
      loadData();
      if (!isEditing) {
        if (params.type === 'income' || params.type === 'expense') {
          setType(params.type);
        }
        const now = new Date();
        setRecordedAt(now);
        setManualDateStr(toDateOnly(now));
        setDateMode('auto');
      }
    }, [loadData, isEditing, params.type])
  );

  // If editing, load existing transaction
  useEffect(() => {
    if (isEditing && editId) {
      try {
        const existing = transactionRepository.getById(editId);
        if (existing) {
          setExistingTx(existing);
          setType(existing.type);
          setAmountStr(paiseToRupees(existing.amountPaise).toString());
          setSelectedCategoryId(existing.categoryId);
          setSelectedAccountId(existing.accountId);
          setNote(existing.note || '');
          if (existing.date) {
            const d = new Date(existing.date);
            setRecordedAt(d);
            setManualDateStr(toDateOnly(d));
          }
          // When editing, default to manual so user can see/change the date
          setDateMode('manual');
        } else {
          // An old route parameter must never turn a fresh Add tab into edit mode.
          router.replace({ pathname: '/(tabs)/add', params: { type } });
        }
      } catch (err) {
        console.error('Failed to load transaction for edit:', err);
      }
    } else {
      setExistingTx(null);
    }
  }, [isEditing, editId, router, type]);

  // Calculate available balance (adjusted for currently edited transaction)
  const availableBalancePaise = useMemo(() => {
    const netBalance = totalIncomePaise - totalExpensePaise;
    if (isEditing && existingTx) {
      if (existingTx.type === 'expense') {
        // If we are editing an existing expense, give back its amount to the available pool
        return netBalance + existingTx.amountPaise;
      } else if (existingTx.type === 'income') {
        // If we are editing an existing income, remove its amount from available pool
        return netBalance - existingTx.amountPaise;
      }
    }
    return netBalance;
  }, [totalIncomePaise, totalExpensePaise, isEditing, existingTx]);

  const enteredPaise = useMemo(() => rupeesToPaise(amountStr), [amountStr]);

  // Filter categories matching type
  const filteredCategories = useMemo(() => {
    return categories.filter((c) => c.type === type || c.type === 'both');
  }, [categories, type]);

  // Ensure selected category matches
  useEffect(() => {
    if (filteredCategories.length > 0) {
      const match = filteredCategories.find((c) => c.id === selectedCategoryId);
      if (!match) {
        const defaultCat =
          type === 'income'
            ? filteredCategories.find((c) => c.name.toLowerCase().includes('pocket')) || filteredCategories[0]
            : filteredCategories.find((c) => c.name.toLowerCase() === 'other') || filteredCategories[0];
        setSelectedCategoryId(defaultCat ? defaultCat.id : filteredCategories[0].id);
      }
    }
  }, [type, filteredCategories, selectedCategoryId]);

  const handleAmountChange = (text: string) => {
    let cleaned = text.replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    if (parts.length > 2) {
      cleaned = `${parts[0]}.${parts.slice(1).join('')}`;
    }
    if (parts[1] && parts[1].length > 2) {
      cleaned = `${parts[0]}.${parts[1].slice(0, 2)}`;
    }
    setAmountStr(cleaned);
  };

  const handleSave = () => {
    const amountPaise = rupeesToPaise(amountStr);
    if (isNaN(amountPaise) || amountPaise <= 0) {
      Alert.alert('Invalid Amount', 'Please enter an amount.');
      return;
    }

    // Expense validation: cannot spend without income, and cannot spend more than available balance
    if (type === 'expense') {
      if (availableBalancePaise <= 0) {
        Alert.alert(
          'Insufficient Balance',
          'You have no available balance to add an expense. Please record an income first before spending.'
        );
        return;
      }
      if (amountPaise > availableBalancePaise) {
        Alert.alert(
          'Insufficient Balance',
          `This expense of ${formatPaiseToINR(amountPaise)} exceeds your available balance of ${formatPaiseToINR(availableBalancePaise)}. You cannot spend more than your available funds.`
        );
        return;
      }
    }

    let categoryToUse = selectedCategoryId;
    if (!categoryToUse) {
      const fallback =
        type === 'income'
          ? filteredCategories.find((c) => c.name.toLowerCase().includes('pocket')) || filteredCategories[0]
          : filteredCategories.find((c) => c.name.toLowerCase() === 'other') || filteredCategories[0];
      if (fallback) categoryToUse = fallback.id;
    }

    if (!categoryToUse) {
      Alert.alert('Category Required', 'Please select a category.');
      return;
    }

    if (!selectedAccountId) {
      Alert.alert('Account Required', 'Please select a payment account.');
      return;
    }

    // Validate manual date if in manual mode
    if (dateMode === 'manual' && !isValidDateStr(manualDateStr)) {
      Alert.alert('Invalid Date', 'Choose a valid date that is today or earlier.');
      return;
    }

    // Build stored ISO date:
    // Auto mode: full timestamp of now
    // Manual mode: user's date + current clock time
    const now = new Date();
    const isoDateString =
      dateMode === 'manual' ? buildISO(manualDateStr, now) : now.toISOString();
    if (!isValidTransactionDate(isoDateString)) {
      Alert.alert('Invalid Date', 'Transaction dates can only be today or earlier.');
      return;
    }

    try {
      if (isEditing && editId) {
        transactionRepository.update(editId, {
          type,
          amountPaise,
          categoryId: categoryToUse,
          accountId: selectedAccountId,
          note: note.trim() || null,
          date: isoDateString,
        });
        useAppStore.getState().refreshAll();
        Alert.alert('Success', 'Transaction updated!');
      } else {
        transactionRepository.add({
          type,
          amountPaise,
          categoryId: categoryToUse,
          accountId: selectedAccountId,
          note: note.trim() || null,
          date: isoDateString,
          createdAt: Date.now(),
        });
        useAppStore.getState().refreshAll();
        Alert.alert('Saved', `${type === 'expense' ? 'Expense' : 'Income'} recorded!`);
      }

      if (!isEditing) {
        setAmountStr('');
        setNote('');
        const freshNow = new Date();
        setRecordedAt(freshNow);
        setManualDateStr(toDateOnly(freshNow));
        setDateMode('auto');
        loadData();
      } else {
        router.back();
      }
    } catch (err) {
      console.error('Failed to save transaction:', err);
      Alert.alert('Error', 'Could not save transaction.');
    }
  };

  const handleDelete = () => {
    if (editId) setDeleteConfirmVisible(true);
  };

  const confirmDelete = () => {
    if (!editId) return;
    try {
      transactionRepository.delete(editId);
      useAppStore.getState().refreshAll();
      setDeleteConfirmVisible(false);
      router.back();
    } catch (err) {
      console.error('Failed to delete transaction:', err);
      Alert.alert('Delete Error', 'Could not delete this transaction.');
    }
  };

  // Display strings for auto mode
  const autoTimeLabel = recordedAt.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  const autoDateLabel = recordedAt.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  // Calendar generation helpers
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const daysInMonth = new Date(calViewYear, calViewMonth + 1, 0).getDate();
  const startDayOfWeek = new Date(calViewYear, calViewMonth, 1).getDay(); // 0 is Sun
  const todayDateKey = toDateOnly(new Date());
  const isViewingCurrentOrFutureMonth =
    calViewYear > new Date().getFullYear() ||
    (calViewYear === new Date().getFullYear() && calViewMonth >= new Date().getMonth());

  const handlePrevMonth = () => {
    if (calViewMonth === 0) {
      setCalViewMonth(11);
      setCalViewYear((y) => y - 1);
    } else {
      setCalViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (isViewingCurrentOrFutureMonth) return;
    if (calViewMonth === 11) {
      setCalViewMonth(0);
      setCalViewYear((y) => y + 1);
    } else {
      setCalViewMonth((m) => m + 1);
    }
  };

  const handleSelectDate = (day: number) => {
    const formatted = `${calViewYear}-${String(calViewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setManualDateStr(formatted);
    setCalendarVisible(false);
  };

  const handleQuickToday = () => {
    const now = new Date();
    setManualDateStr(toDateOnly(now));
    setCalendarVisible(false);
  };

  const handleQuickYesterday = () => {
    const y = new Date();
    y.setDate(y.getDate() - 1);
    setManualDateStr(toDateOnly(y));
    setCalendarVisible(false);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ConfirmActionModal
        visible={deleteConfirmVisible}
        title="Delete transaction?"
        message="This transaction will be permanently removed. You can’t undo this action."
        cancelText="Keep it"
        onCancel={() => setDeleteConfirmVisible(false)}
        onConfirm={confirmDelete}
      />

      {/* Visual Calendar Modal */}
      <Modal
        visible={calendarVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCalendarVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setCalendarVisible(false)}>
          <Pressable style={[styles.calModalCard, { backgroundColor: colors.surface }]} onStartShouldSetResponder={() => true}>
            {/* Calendar Header */}
            <View style={styles.calHeaderRow}>
              <TouchableOpacity style={styles.calNavBtn} onPress={handlePrevMonth}>
                <Ionicons name="chevron-back" size={20} color={colors.text} />
              </TouchableOpacity>
              <Text style={[styles.calHeaderTitle, { color: colors.text }]}>
                {monthNames[calViewMonth]} {calViewYear}
              </Text>
              <TouchableOpacity
                style={styles.calNavBtn}
                onPress={handleNextMonth}
                disabled={isViewingCurrentOrFutureMonth}
              >
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={isViewingCurrentOrFutureMonth ? colors.textMuted : colors.text}
                />
              </TouchableOpacity>
            </View>

            {/* Quick date shortcuts */}
            <View style={styles.calShortcutsRow}>
              <TouchableOpacity style={[styles.calShortcutBtn, { backgroundColor: colors.surfaceElevated }]} onPress={handleQuickToday}>
                <Text style={[styles.calShortcutText, { color: colors.primary }]}>Today</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.calShortcutBtn, { backgroundColor: colors.surfaceElevated }]} onPress={handleQuickYesterday}>
                <Text style={[styles.calShortcutText, { color: colors.textSecondary }]}>Yesterday</Text>
              </TouchableOpacity>
            </View>

            {/* Weekday Labels */}
            <View style={styles.calWeekdaysRow}>
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((w, idx) => (
                <Text key={idx} style={[styles.calWeekdayText, { color: colors.textMuted }]}>
                  {w}
                </Text>
              ))}
            </View>

            {/* Calendar Days Grid */}
            <View style={styles.calDaysGrid}>
              {/* Empty leading slots */}
              {Array.from({ length: startDayOfWeek }).map((_, idx) => (
                <View key={`empty-${idx}`} style={styles.calDayCell} />
              ))}
              {/* Month days */}
              {Array.from({ length: daysInMonth }).map((_, idx) => {
                const dayNum = idx + 1;
                const dateKey = `${calViewYear}-${String(calViewMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                const isSelected = manualDateStr === dateKey;
                const isToday = todayDateKey === dateKey;
                const isFutureDate = dateKey > todayDateKey;

                return (
                  <TouchableOpacity
                    key={`day-${dayNum}`}
                    disabled={isFutureDate}
                    style={[
                      styles.calDayCell,
                      isSelected && { backgroundColor: colors.primary, borderRadius: BorderRadius.full },
                      !isSelected && isToday && { borderWidth: 1, borderColor: colors.primary, borderRadius: BorderRadius.full },
                      isFutureDate && { opacity: 0.3 },
                    ]}
                    onPress={() => handleSelectDate(dayNum)}
                  >
                    <Text
                      style={[
                        styles.calDayText,
                        { color: isSelected ? '#FFFFFF' : isToday ? colors.primary : colors.text },
                        isSelected && { fontWeight: '700' },
                      ]}
                    >
                      {dayNum}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Close / Cancel Button */}
            <TouchableOpacity
              style={[styles.calCloseBtn, { backgroundColor: colors.surfaceElevated }]}
              onPress={() => setCalendarVisible(false)}
            >
              <Text style={[styles.calCloseText, { color: colors.text }]}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View style={styles.header}>
            {isEditing && (
              <TouchableOpacity style={styles.backRow} onPress={() => router.back()}>
                <Ionicons name="arrow-back" size={20} color={colors.primary} />
                <Text style={[styles.backText, { color: colors.primary }]}>Back</Text>
              </TouchableOpacity>
            )}
            <Text style={[styles.title, { color: colors.text }]}>
              {isEditing ? 'Edit Transaction' : 'Record Transaction'}
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              {isEditing ? 'Modify or delete this entry' : 'Add an expense or incoming payment'}
            </Text>
          </View>

          {/* Type Toggle: Expense vs Income */}
          <View style={[styles.typeToggleContainer, { backgroundColor: colors.surfaceElevated }]}>
            <TouchableOpacity
              style={[
                styles.typeButton,
                type === 'expense' && { backgroundColor: colors.expense, elevation: 2 },
              ]}
              onPress={() => setType('expense')}
            >
              <Ionicons
                name="arrow-up-circle"
                size={18}
                color={type === 'expense' ? '#FFFFFF' : colors.textSecondary}
              />
              <Text
                style={[
                  styles.typeButtonText,
                  { color: type === 'expense' ? '#FFFFFF' : colors.textSecondary },
                ]}
              >
                Expense (Spent)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.typeButton,
                type === 'income' && { backgroundColor: colors.income, elevation: 2 },
              ]}
              onPress={() => setType('income')}
            >
              <Ionicons
                name="arrow-down-circle"
                size={18}
                color={type === 'income' ? '#FFFFFF' : colors.textSecondary}
              />
              <Text
                style={[
                  styles.typeButtonText,
                  { color: type === 'income' ? '#FFFFFF' : colors.textSecondary },
                ]}
              >
                Income (Received)
              </Text>
            </TouchableOpacity>
          </View>

          {/* Amount Input */}
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.amountHeaderRow}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
                AMOUNT
              </Text>
              {type === 'expense' && (
                <View
                  style={[
                    styles.balanceBadge,
                    {
                      backgroundColor:
                        availableBalancePaise <= 0
                          ? 'rgba(239, 68, 68, 0.12)'
                          : 'rgba(16, 185, 129, 0.12)',
                    },
                  ]}
                >
                  <Ionicons
                    name={availableBalancePaise <= 0 ? 'alert-circle' : 'wallet-outline'}
                    size={13}
                    color={availableBalancePaise <= 0 ? colors.expense : colors.income}
                  />
                  <Text
                    style={[
                      styles.balanceBadgeText,
                      { color: availableBalancePaise <= 0 ? colors.expense : colors.income },
                    ]}
                  >
                    Balance: {formatPaiseToINR(Math.max(0, availableBalancePaise))}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.amountInputRow}>
              <Text style={[styles.currencyPrefix, { color: type === 'income' ? colors.income : colors.expense }]}>
                ₹
              </Text>
              <TextInput
                style={[styles.amountInput, { color: colors.text }]}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.textMuted}
                value={amountStr}
                onChangeText={handleAmountChange}
                autoFocus={!isEditing}
              />
            </View>

            {type === 'expense' && availableBalancePaise <= 0 && (
              <View style={[styles.amountWarningBox, { backgroundColor: 'rgba(239, 68, 68, 0.08)' }]}>
                <Ionicons name="alert-circle" size={14} color={colors.expense} />
                <Text style={[styles.amountWarningText, { color: colors.expense }]}>
                  No funds available. Please add income first before recording expenses.
                </Text>
              </View>
            )}

            {type === 'expense' &&
              availableBalancePaise > 0 &&
              enteredPaise > availableBalancePaise && (
                <View style={[styles.amountWarningBox, { backgroundColor: 'rgba(239, 68, 68, 0.08)' }]}>
                  <Ionicons name="warning" size={14} color={colors.expense} />
                  <Text style={[styles.amountWarningText, { color: colors.expense }]}>
                    Exceeds available balance by{' '}
                    {formatPaiseToINR(enteredPaise - availableBalancePaise)}
                  </Text>
                </View>
              )}
          </View>

          {/* Date & Time Card with Auto/Manual toggle */}
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>DATE & TIME</Text>

            {/* Mode Toggle */}
            <View style={[styles.dateModeToggle, { backgroundColor: colors.surfaceElevated }]}>
              <TouchableOpacity
                style={[
                  styles.dateModeBtn,
                  dateMode === 'auto' && { backgroundColor: colors.primary },
                ]}
                onPress={() => setDateMode('auto')}
              >
                <Ionicons name="flash" size={14} color={dateMode === 'auto' ? '#FFFFFF' : colors.textSecondary} />
                <Text style={[styles.dateModeText, { color: dateMode === 'auto' ? '#FFFFFF' : colors.textSecondary }]}>
                  Auto (Now)
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.dateModeBtn,
                  dateMode === 'manual' && { backgroundColor: colors.primary },
                ]}
                onPress={() => setDateMode('manual')}
              >
                <Ionicons name="calendar-outline" size={14} color={dateMode === 'manual' ? '#FFFFFF' : colors.textSecondary} />
                <Text style={[styles.dateModeText, { color: dateMode === 'manual' ? '#FFFFFF' : colors.textSecondary }]}>
                  Pick Date
                </Text>
              </TouchableOpacity>
            </View>

            {dateMode === 'auto' ? (
              <View style={[styles.dateTimeDisplay, { backgroundColor: colors.surfaceElevated }]}>
                <Ionicons name="time-outline" size={18} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.dateTimeText, { color: colors.text }]}>{autoDateLabel}</Text>
                  <Text style={[styles.dateTimeSubText, { color: colors.textSecondary }]}>
                    Recorded at {autoTimeLabel} · time auto-captured
                  </Text>
                </View>
              </View>
            ) : (
              <View>
                <TouchableOpacity
                  style={[styles.calendarPickerBtn, { backgroundColor: colors.surfaceElevated, borderColor: colors.primary }]}
                  onPress={() => {
                    const d = parseDateOnly(manualDateStr);
                    if (d) {
                      setCalViewYear(d.getFullYear());
                      setCalViewMonth(d.getMonth());
                    }
                    setCalendarVisible(true);
                  }}
                >
                  <View style={styles.calendarPickerLeft}>
                    <Ionicons name="calendar" size={20} color={colors.primary} />
                    <View>
                      <Text style={[styles.calendarPickerDateText, { color: colors.text }]}>
                        {parseDateOnly(manualDateStr)
                          ? formatDateOnly(manualDateStr)
                          : manualDateStr}
                      </Text>
                      <Text style={[styles.dateTimeSubText, { color: colors.textSecondary }]}>
                        Tap to choose date from calendar
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.calendarBadge, { backgroundColor: colors.primary }]}>
                    <Text style={styles.calendarBadgeText}>Change</Text>
                  </View>
                </TouchableOpacity>

                <View style={styles.manualFallbackRow}>
                  <Text style={[styles.dateHint, { color: colors.textMuted }]}>
                    Or type a date (today or earlier):
                  </Text>
                  <TextInput
                    style={[styles.manualDateInputInline, { color: colors.text, borderColor: colors.border }]}
                    value={manualDateStr}
                    onChangeText={setManualDateStr}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numbers-and-punctuation"
                    maxLength={10}
                  />
                </View>
              </View>
            )}
          </View>

          {/* Category Picker */}
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.labelRow}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>CATEGORY</Text>
              <Text style={[styles.optionalTag, { color: colors.textMuted }]}>
                {type === 'income' ? 'e.g. Pocket Money' : 'Optional (defaults to Other)'}
              </Text>
            </View>
            <View style={styles.chipsContainer}>
              {filteredCategories.map((cat) => {
                const selected = selectedCategoryId === cat.id;
                return (
                  <TouchableOpacity
                    key={cat.id}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: selected ? (isDark ? '#1E293B' : colors.primaryLight) : colors.surfaceElevated,
                        borderColor: selected ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => setSelectedCategoryId(cat.id)}
                  >
                    <Ionicons
                      name={cat.icon as any}
                      size={16}
                      color={selected ? colors.primary : cat.color}
                    />
                    <Text
                      style={[
                        styles.chipText,
                        { color: selected ? colors.primary : colors.text, fontWeight: selected ? '700' : '500' },
                      ]}
                    >
                      {cat.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Account Picker */}
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>PAYMENT ACCOUNT</Text>
            <View style={styles.chipsContainer}>
              {accounts.map((acc) => {
                const selected = selectedAccountId === acc.id;
                return (
                  <TouchableOpacity
                    key={acc.id}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: selected ? (isDark ? '#1E293B' : colors.primaryLight) : colors.surfaceElevated,
                        borderColor: selected ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => setSelectedAccountId(acc.id)}
                  >
                    <Ionicons
                      name={acc.icon as any}
                      size={16}
                      color={selected ? colors.primary : colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.chipText,
                        { color: selected ? colors.primary : colors.text, fontWeight: selected ? '700' : '500' },
                      ]}
                    >
                      {acc.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Context-aware Note Field */}
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
              NOTE / DESCRIPTION (OPTIONAL)
            </Text>
            <TextInput
              style={[
                styles.textInput,
                { backgroundColor: colors.surfaceElevated, color: colors.text, borderColor: colors.border },
              ]}
              value={note}
              onChangeText={setNote}
              placeholder={
                type === 'income'
                  ? 'e.g. Pocket money from dad, festival gift, freelance gig'
                  : 'e.g. Chai & samosa, petrol, Swiggy, stationery'
              }
              placeholderTextColor={colors.textMuted}
            />
          </View>

          {/* Save Button */}
          <TouchableOpacity
            style={[styles.saveButton, { backgroundColor: type === 'expense' ? colors.expense : colors.income }]}
            onPress={handleSave}
          >
            <Ionicons name="checkmark-sharp" size={20} color="#FFFFFF" />
            <Text style={styles.saveButtonText}>
              {isEditing ? 'Save Changes' : `Save ${type === 'expense' ? 'Expense' : 'Income'}`}
            </Text>
          </TouchableOpacity>

          {isEditing && (
            <TouchableOpacity style={[styles.deleteButton, { borderColor: colors.expense }]} onPress={handleDelete}>
              <Ionicons name="trash-outline" size={18} color={colors.expense} />
              <Text style={[styles.deleteButtonText, { color: colors.expense }]}>Delete Transaction</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.md,
    gap: Spacing.md + 2,
    paddingBottom: Spacing.xxl,
  },
  header: {
    marginBottom: Spacing.xs,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: Spacing.xs,
  },
  backText: {
    fontSize: Typography.sm,
    fontWeight: '600',
  },
  title: {
    fontSize: Typography.xxl,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: Typography.sm,
    marginTop: 2,
  },
  typeToggleContainer: {
    flexDirection: 'row',
    borderRadius: BorderRadius.md,
    padding: 4,
    gap: 4,
  },
  typeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  typeButtonText: {
    fontSize: Typography.sm,
    fontWeight: '700',
  },
  card: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.md + 2,
    shadowColor: '#163B28',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  autoBadge: {
    fontSize: Typography.xs,
    fontWeight: '700',
  },
  optionalTag: {
    fontSize: Typography.xs,
    fontStyle: 'italic',
  },
  amountHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  balanceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: BorderRadius.full,
  },
  balanceBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  inputLabel: {
    fontSize: Typography.xs,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  amountWarningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.sm,
    marginTop: Spacing.xs,
  },
  amountWarningText: {
    flex: 1,
    fontSize: Typography.xs,
    fontWeight: '600',
    lineHeight: 16,
  },
  currencyPrefix: {
    fontSize: Typography.hero,
    fontWeight: '800',
    marginRight: Spacing.xs,
  },
  amountInput: {
    flex: 1,
    fontSize: Typography.hero,
    fontWeight: '800',
    minHeight: 56,
    paddingVertical: Spacing.sm,
  },
  dateTimeDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    padding: Spacing.sm + 2,
    borderRadius: BorderRadius.md,
  },
  dateModeToggle: {
    flexDirection: 'row',
    borderRadius: BorderRadius.md,
    padding: 4,
    gap: 4,
    marginBottom: Spacing.sm,
  },
  dateModeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    minHeight: 40,
    borderRadius: BorderRadius.sm,
  },
  dateModeText: {
    fontSize: Typography.xs,
    fontWeight: '700',
  },
  dateTimeText: {
    fontSize: Typography.sm,
    fontWeight: '600',
  },
  dateTimeSubText: {
    fontSize: 11,
    marginTop: 2,
  },
  manualDateInput: {
    flex: 1,
    fontSize: Typography.sm,
    fontWeight: '600',
    paddingVertical: 0,
  },
  dateHint: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 16,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginTop: Spacing.xxs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 38,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm + 2,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  chipText: {
    fontSize: Typography.sm,
  },
  textInput: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    minHeight: 48,
    paddingVertical: Spacing.sm,
    fontSize: Typography.md,
    marginTop: Spacing.xxs,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    minHeight: 50,
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.xs,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: Typography.md,
    fontWeight: '700',
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    minHeight: 48,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
  },
  deleteButtonText: {
    fontSize: Typography.md,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.md,
  },
  calModalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
  },
  calHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  calHeaderTitle: {
    fontSize: Typography.md,
    fontWeight: '700',
  },
  calNavBtn: {
    padding: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  calShortcutsRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  calShortcutBtn: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.full,
  },
  calShortcutText: {
    fontSize: Typography.xs,
    fontWeight: '700',
  },
  calWeekdaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
    paddingHorizontal: 4,
  },
  calWeekdayText: {
    width: 38,
    textAlign: 'center',
    fontSize: Typography.xs,
    fontWeight: '600',
  },
  calDaysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    rowGap: 4,
  },
  calDayCell: {
    width: '14.28%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  calDayText: {
    fontSize: Typography.sm,
    fontWeight: '500',
  },
  calCloseBtn: {
    marginTop: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  calCloseText: {
    fontSize: Typography.sm,
    fontWeight: '700',
  },
  calendarPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
    padding: Spacing.sm + 2,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginBottom: Spacing.xs,
  },
  calendarPickerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  calendarPickerDateText: {
    fontSize: Typography.md,
    fontWeight: '700',
  },
  calendarBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.full,
  },
  calendarBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  manualFallbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: 2,
  },
  manualDateInputInline: {
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 8,
    paddingVertical: 2,
    fontSize: Typography.xs,
    fontWeight: '600',
  },
});
