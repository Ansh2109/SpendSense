import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  ScrollView,
  Modal,
  Pressable,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../src/context/ThemeContext';
import { Spacing, BorderRadius, Typography } from '../../src/constants/theme';
import { formatPaiseToINR } from '../../src/utils/money';
import { transactionRepository, accountRepository, categoryRepository } from '../../src/db/repositories';
import { TransactionWithDetails } from '../../src/db/repositories/transactionRepository';
import { reportService } from '../../src/services/reportService';

type FilterType = 'all' | 'expense' | 'income';
type ReportPeriod = 'week' | 'month' | 'year' | 'custom';

const getDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDateKey = (dateKey: string): string => {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

export default function TransactionsScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();

  const [transactions, setTransactions] = useState<TransactionWithDetails[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [accounts, setAccounts] = useState<{ id: number; name: string }[]>([]);
  const [reportPickerVisible, setReportPickerVisible] = useState(false);
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>('week');
  const [reportMonth, setReportMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [reportYear, setReportYear] = useState(new Date().getFullYear());
  const [yearPageStart, setYearPageStart] = useState(() => Math.floor(new Date().getFullYear() / 10) * 10);
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [customStartDate, setCustomStartDate] = useState(() => getDateKey(new Date()));
  const [customEndDate, setCustomEndDate] = useState(() => getDateKey(new Date()));
  const [customSelectingEnd, setCustomSelectingEnd] = useState(false);
  const [customDateTarget, setCustomDateTarget] = useState<'start' | 'end'>('start');
  // Detail modal state
  const [detailTx, setDetailTx] = useState<TransactionWithDetails | null>(null);

  const loadData = useCallback(() => {
    try {
      const allTx = transactionRepository.getAll();
      setTransactions(allTx);
      const allAccs = accountRepository.getAll();
      setAccounts(allAccs.filter((account) => account.name.trim().toLowerCase() !== 'bank'));
    } catch (err) {
      console.error('Failed to load transactions:', err);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  // Filter transactions by Search query, Type (All/Expense/Income), and Account
  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      // 1. Search Query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const noteMatch = tx.note ? tx.note.toLowerCase().includes(query) : false;
        const catMatch = tx.categoryName.toLowerCase().includes(query);
        const accMatch = tx.accountName.toLowerCase().includes(query);
        if (!noteMatch && !catMatch && !accMatch) {
          return false;
        }
      }

      // 2. Type Filter
      if (filterType !== 'all' && tx.type !== filterType) {
        return false;
      }

      // 3. Account Filter
      if (selectedAccountId !== null && tx.accountId !== selectedAccountId) {
        return false;
      }

      return true;
    });
  }, [transactions, searchQuery, filterType, selectedAccountId]);

  // Totals for filtered transactions
  const totalExpensePaise = filteredTransactions
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + t.amountPaise, 0);

  const totalIncomePaise = filteredTransactions
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + t.amountPaise, 0);

  const netPaise = totalIncomePaise - totalExpensePaise;

  // Format date helper: "Today", "Yesterday", or "11 Oct 2026"
  const getDateHeader = (isoDate: string) => {
    try {
      const d = new Date(isoDate);
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);

      if (d.toDateString() === today.toDateString()) {
        return 'Today';
      }
      if (d.toDateString() === yesterday.toDateString()) {
        return 'Yesterday';
      }
      return d.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return isoDate;
    }
  };

  const getTimeString = (isoDate: string) => {
    try {
      const d = new Date(isoDate);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return '';
    }
  };

  // Group filtered transactions by Date
  const groupedSections = useMemo(() => {
    const groups: { [key: string]: TransactionWithDetails[] } = {};
    filteredTransactions.forEach((tx) => {
      const header = getDateHeader(tx.date);
      if (!groups[header]) {
        groups[header] = [];
      }
      groups[header].push(tx);
    });

    return Object.entries(groups).map(([title, data]) => ({
      title,
      data,
    }));
  }, [filteredTransactions]);

  const todayKey = getDateKey(new Date());
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const reportDaysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
  const reportMonthStartDay = new Date(calendarYear, calendarMonth, 1).getDay();
  const isCurrentOrFutureCalendarMonth =
    calendarYear > new Date().getFullYear() ||
    (calendarYear === new Date().getFullYear() && calendarMonth >= new Date().getMonth());
  const isFutureReportYearPage = yearPageStart >= Math.floor(new Date().getFullYear() / 10) * 10;

  const getSelectedReportRange = (): { start: string; end: string; label: string } | null => {
    const today = new Date();
    if (reportPeriod === 'week') {
      const weekStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay());
      const weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6);
      return {
        start: getDateKey(weekStart),
        end: todayKey,
        label: `Week ${formatDateKey(getDateKey(weekStart))} – ${formatDateKey(getDateKey(weekEnd))}`,
      };
    }
    if (reportPeriod === 'month') {
      const year = reportMonth.getFullYear();
      const month = reportMonth.getMonth();
      const start = getDateKey(new Date(year, month, 1));
      const endOfMonth = getDateKey(new Date(year, month + 1, 0));
      const end = endOfMonth > todayKey ? todayKey : endOfMonth;
      if (start > end) return null;
      return {
        start,
        end,
        label: `${monthNames[month]} ${year}`,
      };
    }
    if (reportPeriod === 'year') {
      const start = getDateKey(new Date(reportYear, 0, 1));
      const endOfYear = getDateKey(new Date(reportYear, 11, 31));
      const end = endOfYear > todayKey ? todayKey : endOfYear;
      if (start > end) return null;
      return { start, end, label: `${reportYear}` };
    }
    if (!customStartDate || !customEndDate || customEndDate < customStartDate) {
      return null;
    }
    return {
      start: customStartDate,
      end: customEndDate,
      label: `${formatDateKey(customStartDate)} to ${formatDateKey(customEndDate)}`,
    };
  };

  const exportReport = async (format: 'csv' | 'pdf') => {
    const range = getSelectedReportRange();
    if (!range) {
      Alert.alert('Choose a date range', 'Select both a start and end date for your custom report.');
      return;
    }
    const reportTransactions = filteredTransactions.filter((transaction) => {
      const date = new Date(transaction.date);
      if (Number.isNaN(date.getTime())) return false;
      const dateKey = getDateKey(date);
      return dateKey >= range.start && dateKey <= range.end;
    });
    if (reportTransactions.length === 0) {
      Alert.alert('No Data', 'No transactions were found for the selected dates and current filters.');
      return;
    }
    const title = `SpendSense_Transactions_${range.start}_to_${range.end}`;
    try {
      if (format === 'csv') {
        await reportService.exportCSV(reportTransactions, title);
      } else {
        await reportService.exportPDF(reportTransactions, `Transaction History · ${range.label}`);
      }
      setReportPickerVisible(false);
    } catch {
      Alert.alert('Export Error', `Could not export ${format.toUpperCase()}.`);
    }
  };

  const changeCalendarMonth = (direction: -1 | 1) => {
    const next = new Date(calendarYear, calendarMonth + direction, 1);
    const today = new Date();
    if (next.getFullYear() > today.getFullYear() ||
      (next.getFullYear() === today.getFullYear() && next.getMonth() > today.getMonth())) {
      return;
    }
    setCalendarMonth(next.getMonth());
    setCalendarYear(next.getFullYear());
  };

  const selectCustomDate = (day: number) => {
    const selected = getDateKey(new Date(calendarYear, calendarMonth, day));
    if (customDateTarget === 'start') {
      setCustomStartDate(selected);
      if (customEndDate < selected) setCustomEndDate(selected);
      setCustomDateTarget('end');
      setCustomSelectingEnd(true);
      return;
    }
    if (selected < customStartDate) {
      setCustomStartDate(selected);
      setCustomEndDate(selected);
    } else {
      setCustomEndDate(selected);
    }
    setCustomDateTarget('start');
    setCustomSelectingEnd(false);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <Modal
        visible={reportPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setReportPickerVisible(false)}
      >
        <Pressable style={styles.reportOverlay} onPress={() => setReportPickerVisible(false)}>
          <Pressable
            style={[styles.reportModal, { backgroundColor: colors.surface }]}
            onStartShouldSetResponder={() => true}
          >
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.reportModalContent}
            >
              <View style={styles.reportModalHeading}>
                <View style={[styles.reportHeadingIcon, { backgroundColor: colors.primaryLight }]}>
                  <Ionicons name="download-outline" size={20} color={colors.primary} />
                </View>
                <View style={styles.reportHeadingText}>
                  <Text style={[styles.reportTitle, { color: colors.text }]}>Export transactions</Text>
                  <Text style={[styles.reportSubtitle, { color: colors.textSecondary }]}>
                    Choose which dates to include.
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.reportCloseButton}
                  onPress={() => setReportPickerVisible(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Close export options"
                >
                  <Ionicons name="close" size={21} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <View style={styles.periodOptions}>
                {([
                  ['week', 'This week'],
                  ['month', 'Month'],
                  ['year', 'Year'],
                  ['custom', 'Custom'],
                ] as [ReportPeriod, string][]).map(([period, label]) => {
                  const selected = reportPeriod === period;
                  return (
                    <TouchableOpacity
                      key={period}
                      style={[
                        styles.periodOption,
                        {
                          backgroundColor: selected ? colors.primary : colors.surfaceElevated,
                          borderColor: selected ? colors.primary : colors.border,
                        },
                      ]}
                      onPress={() => setReportPeriod(period)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                    >
                      <Text style={[styles.periodOptionText, { color: selected ? '#FFFFFF' : colors.text }]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {reportPeriod === 'week' && (
                <View style={[styles.reportSelectionCard, { backgroundColor: colors.surfaceElevated }]}>
                  <Ionicons name="calendar-outline" size={19} color={colors.primary} />
                  <View style={styles.reportSelectionText}>
                    <Text style={[styles.reportSelectionTitle, { color: colors.text }]}>Sunday – Saturday</Text>
                    <Text style={[styles.reportSubtitle, { color: colors.textSecondary }]}>
                      {getSelectedReportRange()?.label} · includes dates through today
                    </Text>
                  </View>
                </View>
              )}

              {reportPeriod === 'month' && (
                <View style={[styles.reportSelectionCard, { backgroundColor: colors.surfaceElevated }]}>
                  <View style={styles.calendarYearHeader}>
                    <TouchableOpacity
                      style={styles.calendarNavButton}
                      onPress={() => setReportMonth((current) => new Date(current.getFullYear() - 1, current.getMonth(), 1))}
                      accessibilityRole="button"
                      accessibilityLabel="Previous year"
                    >
                      <Ionicons name="chevron-back" size={19} color={colors.text} />
                    </TouchableOpacity>
                    <Text style={[styles.calendarHeaderTitle, { color: colors.text }]}>{reportMonth.getFullYear()}</Text>
                    <TouchableOpacity
                      style={styles.calendarNavButton}
                      disabled={reportMonth.getFullYear() >= new Date().getFullYear()}
                      onPress={() => setReportMonth((current) => {
                        const today = new Date();
                        const nextYear = current.getFullYear() + 1;
                        const month = nextYear === today.getFullYear()
                          ? Math.min(current.getMonth(), today.getMonth())
                          : current.getMonth();
                        return new Date(nextYear, month, 1);
                      })}
                      accessibilityRole="button"
                      accessibilityLabel="Next year"
                    >
                      <Ionicons
                        name="chevron-forward"
                        size={19}
                        color={reportMonth.getFullYear() >= new Date().getFullYear() ? colors.textMuted : colors.text}
                      />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.monthGrid}>
                    {monthNames.map((month, index) => {
                      const currentYear = reportMonth.getFullYear() === new Date().getFullYear();
                      const disabled = currentYear && index > new Date().getMonth();
                      const selected = reportMonth.getMonth() === index;
                      return (
                        <TouchableOpacity
                          key={month}
                          disabled={disabled}
                          style={[
                            styles.monthOption,
                            { backgroundColor: selected ? colors.primary : colors.surface, borderColor: selected ? colors.primary : colors.border },
                            disabled && styles.disabledDateOption,
                          ]}
                          onPress={() => setReportMonth(new Date(reportMonth.getFullYear(), index, 1))}
                          accessibilityRole="button"
                          accessibilityState={{ selected, disabled }}
                        >
                          <Text style={[styles.monthOptionText, { color: selected ? '#FFFFFF' : colors.text }]}>
                            {month.slice(0, 3)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <Text style={[styles.reportSelectionHint, { color: colors.textSecondary }]}>
                    Current month reports include dates through today only.
                  </Text>
                </View>
              )}

              {reportPeriod === 'year' && (
                <View style={[styles.reportSelectionCard, { backgroundColor: colors.surfaceElevated }]}>
                  <View style={styles.calendarYearHeader}>
                    <TouchableOpacity
                      style={styles.calendarNavButton}
                      onPress={() => setYearPageStart((start) => start - 10)}
                      accessibilityRole="button"
                      accessibilityLabel="Previous years"
                    >
                      <Ionicons name="chevron-back" size={19} color={colors.text} />
                    </TouchableOpacity>
                    <Text style={[styles.calendarHeaderTitle, { color: colors.text }]}>
                      {yearPageStart} – {yearPageStart + 9}
                    </Text>
                    <TouchableOpacity
                      style={styles.calendarNavButton}
                      disabled={isFutureReportYearPage}
                      onPress={() => setYearPageStart((start) => start + 10)}
                      accessibilityRole="button"
                      accessibilityLabel="Next years"
                    >
                      <Ionicons
                        name="chevron-forward"
                        size={19}
                        color={isFutureReportYearPage ? colors.textMuted : colors.text}
                      />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.yearGrid}>
                    {Array.from({ length: 10 }, (_, index) => yearPageStart + index).map((year) => {
                      const disabled = year > new Date().getFullYear();
                      const selected = year === reportYear;
                      return (
                        <TouchableOpacity
                          key={year}
                          disabled={disabled}
                          style={[
                            styles.yearOption,
                            { backgroundColor: selected ? colors.primary : colors.surface, borderColor: selected ? colors.primary : colors.border },
                            disabled && styles.disabledDateOption,
                          ]}
                          onPress={() => setReportYear(year)}
                          accessibilityRole="button"
                          accessibilityState={{ selected, disabled }}
                        >
                          <Text style={[styles.monthOptionText, { color: selected ? '#FFFFFF' : colors.text }]}>{year}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <Text style={[styles.reportSelectionHint, { color: colors.textSecondary }]}>
                    The current year includes dates through today only.
                  </Text>
                </View>
              )}

              {reportPeriod === 'custom' && (
                <View style={[styles.reportSelectionCard, { backgroundColor: colors.surfaceElevated }]}>
                  <Text style={[styles.reportSelectionTitle, { color: colors.text }]}>Choose dates</Text>
                  <View style={styles.customDateRow}>
                    {(['start', 'end'] as const).map((target) => {
                      const selected = customDateTarget === target;
                      const date = target === 'start' ? customStartDate : customEndDate;
                      return (
                        <TouchableOpacity
                          key={target}
                          style={[
                            styles.customDateButton,
                            { backgroundColor: selected ? colors.primaryLight : colors.surface, borderColor: selected ? colors.primary : colors.border },
                          ]}
                          onPress={() => {
                            setCustomDateTarget(target);
                            setCustomSelectingEnd(target === 'end');
                            const [year, month] = date.split('-').map(Number);
                            setCalendarYear(year);
                            setCalendarMonth(month - 1);
                          }}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                        >
                          <Text style={[styles.customDateLabel, { color: colors.textSecondary }]}>
                            {target === 'start' ? 'FROM' : 'TO'}
                          </Text>
                          <Text style={[styles.customDateValue, { color: colors.text }]}>{formatDateKey(date)}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <View style={styles.calendarYearHeader}>
                    <TouchableOpacity
                      style={styles.calendarNavButton}
                      onPress={() => changeCalendarMonth(-1)}
                      accessibilityRole="button"
                      accessibilityLabel="Previous month"
                    >
                      <Ionicons name="chevron-back" size={19} color={colors.text} />
                    </TouchableOpacity>
                    <Text style={[styles.calendarHeaderTitle, { color: colors.text }]}>
                      {monthNames[calendarMonth]} {calendarYear}
                    </Text>
                    <TouchableOpacity
                      style={styles.calendarNavButton}
                      disabled={isCurrentOrFutureCalendarMonth}
                      onPress={() => changeCalendarMonth(1)}
                      accessibilityRole="button"
                      accessibilityLabel="Next month"
                    >
                      <Ionicons
                        name="chevron-forward"
                        size={19}
                        color={isCurrentOrFutureCalendarMonth ? colors.textMuted : colors.text}
                      />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.calendarDaysGrid}>
                    {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => (
                      <Text key={day} style={[styles.calendarWeekday, { color: colors.textMuted }]}>{day}</Text>
                    ))}
                    {Array.from({ length: reportMonthStartDay }, (_, index) => (
                      <View key={`empty-${index}`} style={styles.calendarDayCell} />
                    ))}
                    {Array.from({ length: reportDaysInMonth }, (_, index) => {
                      const day = index + 1;
                      const dateKey = getDateKey(new Date(calendarYear, calendarMonth, day));
                      const future = dateKey > todayKey;
                      const beforeStart = customDateTarget === 'end' && dateKey < customStartDate;
                      const isSelected = dateKey === customStartDate || dateKey === customEndDate;
                      const inRange = dateKey > customStartDate && dateKey < customEndDate;
                      return (
                        <TouchableOpacity
                          key={dateKey}
                          disabled={future || beforeStart}
                          style={[
                            styles.calendarDayCell,
                            inRange && { backgroundColor: colors.primaryLight },
                            isSelected && { backgroundColor: colors.primary, borderRadius: BorderRadius.full },
                            (future || beforeStart) && styles.disabledDateOption,
                          ]}
                          onPress={() => selectCustomDate(day)}
                          accessibilityRole="button"
                          accessibilityLabel={formatDateKey(dateKey)}
                        >
                          <Text style={[
                            styles.calendarDayText,
                            { color: isSelected ? '#FFFFFF' : dateKey === todayKey ? colors.primary : colors.text },
                            isSelected && styles.selectedCalendarDayText,
                          ]}>
                            {day}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <Text style={[styles.reportSelectionHint, { color: colors.textSecondary }]}>
                    {customSelectingEnd ? 'Now choose the end date.' : 'Future dates are unavailable.'}
                  </Text>
                </View>
              )}

              {getSelectedReportRange() && (
                <Text style={[styles.reportRangeSummary, { color: colors.textSecondary }]}>
                  Report dates: {getSelectedReportRange()?.label}
                </Text>
              )}
              <View style={styles.reportActions}>
                <TouchableOpacity
                  style={[styles.reportActionButton, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
                  onPress={() => { void exportReport('csv'); }}
                  accessibilityRole="button"
                >
                  <Ionicons name="document-text-outline" size={18} color={colors.primary} />
                  <Text style={[styles.reportActionText, { color: colors.primary }]}>Export CSV</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.reportActionButton, { backgroundColor: colors.primary, borderColor: colors.primary }]}
                  onPress={() => { void exportReport('pdf'); }}
                  accessibilityRole="button"
                >
                  <Ionicons name="print-outline" size={18} color="#FFFFFF" />
                  <Text style={[styles.reportActionText, { color: '#FFFFFF' }]}>Export PDF</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Transaction Detail Modal */}
      <Modal
        visible={detailTx !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setDetailTx(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setDetailTx(null)}>
          <Pressable style={[styles.detailSheet, { backgroundColor: colors.surface }]} onStartShouldSetResponder={() => true}>
            {detailTx && (
              <>
                {/* Amount + category header */}
                <View style={styles.detailHeader}>
                  <View style={[styles.detailIconCircle, { backgroundColor: detailTx.type === 'expense' ? colors.expenseBg : colors.incomeBg }]}>
                    <Ionicons name={detailTx.categoryIcon as any} size={28} color={detailTx.type === 'expense' ? colors.expense : colors.income} />
                  </View>
                  <Text style={[styles.detailAmount, { color: detailTx.type === 'expense' ? colors.expense : colors.income }]}>
                    {detailTx.type === 'expense' ? '-' : '+'}{formatPaiseToINR(detailTx.amountPaise)}
                  </Text>
                  <Text style={[styles.detailCategory, { color: colors.text }]}>{detailTx.categoryName}</Text>
                  {detailTx.note ? (
                    <Text style={[styles.detailNote, { color: colors.textSecondary }]}>"{detailTx.note}"</Text>
                  ) : null}
                </View>

                {/* Details rows */}
                <View style={[styles.detailCard, { backgroundColor: colors.surfaceElevated }]}>
                  <View style={styles.detailRow}>
                    <Ionicons name="card-outline" size={16} color={colors.primary} />
                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Account</Text>
                    <Text style={[styles.detailValue, { color: colors.text }]}>{detailTx.accountName}</Text>
                  </View>
                  <View style={[styles.detailRowDivider, { backgroundColor: colors.border }]} />
                  <View style={styles.detailRow}>
                    <Ionicons name="calendar-outline" size={16} color={colors.primary} />
                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Transaction Date</Text>
                    <Text style={[styles.detailValue, { color: colors.text }]}>
                      {new Date(detailTx.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </Text>
                  </View>
                  <View style={[styles.detailRowDivider, { backgroundColor: colors.border }]} />
                  <View style={styles.detailRow}>
                    <Ionicons name="time-outline" size={16} color={colors.primary} />
                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Recorded On</Text>
                    <Text style={[styles.detailValue, { color: colors.text }]}>
                      {detailTx.createdAt
                        ? `${new Date(detailTx.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}, ${new Date(detailTx.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}`
                        : `${new Date(detailTx.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, ${new Date(detailTx.date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}`}
                    </Text>
                  </View>
                  <View style={[styles.detailRowDivider, { backgroundColor: colors.border }]} />
                  <View style={styles.detailRow}>
                    <Ionicons name="pricetag-outline" size={16} color={colors.primary} />
                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Type</Text>
                    <Text style={[styles.detailValue, { color: detailTx.type === 'expense' ? colors.expense : colors.income, textTransform: 'capitalize', fontWeight: '700' }]}>
                      {detailTx.type}
                    </Text>
                  </View>
                </View>

                {/* Action buttons */}
                <View style={styles.detailActions}>
                  <TouchableOpacity
                    style={[styles.detailActionBtn, { backgroundColor: colors.primary }]}
                    onPress={() => {
                      const id = detailTx.id;
                      setDetailTx(null);
                      router.push({ pathname: '/(tabs)/add', params: { id: id.toString() } });
                    }}
                  >
                    <Ionicons name="create-outline" size={18} color="#FFFFFF" />
                    <Text style={styles.detailActionText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.detailActionBtn, { backgroundColor: colors.surfaceElevated }]}
                    onPress={() => setDetailTx(null)}
                  >
                    <Ionicons name="close" size={18} color={colors.text} />
                    <Text style={[styles.detailActionText, { color: colors.text }]}>Close</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Header with Export Actions */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <View>
            <Text style={[styles.title, { color: colors.text }]}>Transactions</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              {filteredTransactions.length} {filteredTransactions.length === 1 ? 'record' : 'records'} found
            </Text>
          </View>

          <View style={styles.headerExportRow}>
            <TouchableOpacity
              style={[styles.headerExportBtn, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
              onPress={() => setReportPickerVisible(true)}
              accessibilityRole="button"
              accessibilityLabel="Choose dates and export CSV"
            >
              <Ionicons name="document-text-outline" size={14} color={colors.primary} />
              <Text style={[styles.headerExportText, { color: colors.primary }]}>CSV</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.headerExportBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]}
              onPress={() => setReportPickerVisible(true)}
              accessibilityRole="button"
              accessibilityLabel="Choose dates and export PDF"
            >
              <Ionicons name="print-outline" size={14} color="#FFFFFF" />
              <Text style={[styles.headerExportText, { color: '#FFFFFF' }]}>PDF</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Top Totals Bar */}
      <View style={[styles.totalsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.totalCol}>
          <Text style={[styles.totalLabel, { color: colors.income }]}>+ Income</Text>
          <Text style={[styles.totalValue, { color: colors.income }]}>
            {formatPaiseToINR(totalIncomePaise)}
          </Text>
        </View>
        <View style={[styles.verticalDivider, { backgroundColor: colors.border }]} />
        <View style={styles.totalCol}>
          <Text style={[styles.totalLabel, { color: colors.expense }]}>- Expense</Text>
          <Text style={[styles.totalValue, { color: colors.expense }]}>
            {formatPaiseToINR(totalExpensePaise)}
          </Text>
        </View>
        <View style={[styles.verticalDivider, { backgroundColor: colors.border }]} />
        <View style={styles.totalCol}>
          <Text style={[styles.totalLabel, { color: colors.textSecondary }]}>Net Balance</Text>
          <Text style={[styles.totalValue, { color: netPaise >= 0 ? colors.text : colors.expense }]}>
            {formatPaiseToINR(netPaise)}
          </Text>
        </View>
      </View>

      {/* Search Input */}
      <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Ionicons name="search-outline" size={18} color={colors.textSecondary} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search note, category, or account..."
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Multi-Filters: Type & Account Chips */}
      <View style={styles.filterSection}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipsRow}>
          {/* Type filters */}
          {(['all', 'expense', 'income'] as FilterType[]).map((f) => {
            const active = filterType === f;
            return (
              <TouchableOpacity
                key={f}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: active ? colors.primary : colors.surface,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => setFilterType(f)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    { color: active ? '#FFFFFF' : colors.text, textTransform: 'capitalize' },
                  ]}
                >
                  {f === 'all' ? 'All Types' : f}
                </Text>
              </TouchableOpacity>
            );
          })}

          <View style={[styles.chipDivider, { backgroundColor: colors.border }]} />

          {/* Account filters */}
          <TouchableOpacity
            style={[
              styles.filterChip,
              {
                backgroundColor: selectedAccountId === null ? colors.primary : colors.surface,
                borderColor: selectedAccountId === null ? colors.primary : colors.border,
              },
            ]}
            onPress={() => setSelectedAccountId(null)}
          >
            <Text style={[styles.filterChipText, { color: selectedAccountId === null ? '#FFFFFF' : colors.text }]}>
              All Accounts
            </Text>
          </TouchableOpacity>

          {accounts.map((acc) => {
            const active = selectedAccountId === acc.id;
            return (
              <TouchableOpacity
                key={acc.id}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: active ? colors.primary : colors.surface,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => setSelectedAccountId(active ? null : acc.id)}
              >
                <Text style={[styles.filterChipText, { color: active ? '#FFFFFF' : colors.text }]}>
                  {acc.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Grouped History List */}
      <FlatList
        data={groupedSections}
        keyExtractor={(item) => item.title}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="receipt-outline" size={44} color={colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No transactions found</Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
              {searchQuery ? 'Try clearing your search query or filters' : 'Tap the + Add tab to record your first entry'}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.groupContainer}>
            <Text style={[styles.groupTitle, { color: colors.textSecondary }]}>{item.title}</Text>
            <View style={[styles.groupCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {item.data.map((tx, idx) => {
                const isLast = idx === item.data.length - 1;
                return (
                  <View key={tx.id}>
                    <TouchableOpacity
                      style={styles.txRow}
                      onPress={() => setDetailTx(tx)}
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
                        <View style={styles.txMetaRow}>
                          <Text style={[styles.txMetaBadge, { backgroundColor: colors.surfaceElevated, color: colors.textSecondary }]}>
                            {tx.accountName}
                          </Text>
                          {getTimeString(tx.date) ? (
                            <Text style={[styles.txTimeText, { color: colors.textSecondary }]}>
                              • {getTimeString(tx.date)}
                            </Text>
                          ) : null}
                        </View>
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
                    {!isLast && <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />}
                  </View>
                );
              })}
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  headerTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerExportRow: {
    flexDirection: 'row',
    gap: 6,
  },
  headerExportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 36,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  headerExportText: {
    fontSize: Typography.xs,
    fontWeight: '700',
  },
  reportOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    padding: Spacing.md,
  },
  reportModal: {
    width: '100%',
    maxWidth: 460,
    maxHeight: '92%',
    alignSelf: 'center',
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
  },
  reportModalContent: {
    padding: Spacing.md,
    gap: Spacing.md,
  },
  reportModalHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  reportHeadingIcon: {
    width: 42,
    height: 42,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportHeadingText: {
    flex: 1,
  },
  reportTitle: {
    fontSize: Typography.lg,
    fontWeight: '800',
  },
  reportSubtitle: {
    fontSize: Typography.xs,
    lineHeight: 17,
    marginTop: 2,
  },
  reportCloseButton: {
    width: 38,
    height: 38,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  periodOption: {
    flexGrow: 1,
    minWidth: '23%',
    minHeight: 40,
    paddingHorizontal: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  periodOptionText: {
    fontSize: Typography.xs,
    fontWeight: '700',
  },
  reportSelectionCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  reportSelectionText: {
    flex: 1,
  },
  reportSelectionTitle: {
    fontSize: Typography.sm,
    fontWeight: '700',
  },
  reportSelectionHint: {
    fontSize: Typography.xs,
    lineHeight: 17,
    textAlign: 'center',
  },
  calendarYearHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  calendarNavButton: {
    width: 38,
    height: 38,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarHeaderTitle: {
    fontSize: Typography.md,
    fontWeight: '800',
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    justifyContent: 'space-between',
  },
  monthOption: {
    width: '31%',
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  monthOptionText: {
    fontSize: Typography.xs,
    fontWeight: '700',
  },
  disabledDateOption: {
    opacity: 0.35,
  },
  yearGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    justifyContent: 'space-between',
  },
  yearOption: {
    width: '31%',
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  customDateRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  customDateButton: {
    flex: 1,
    minHeight: 58,
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  customDateLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  customDateValue: {
    fontSize: Typography.xs,
    fontWeight: '700',
    marginTop: 3,
  },
  calendarDaysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarWeekday: {
    width: '14.285%',
    height: 30,
    textAlign: 'center',
    textAlignVertical: 'center',
    fontSize: 11,
    fontWeight: '700',
  },
  calendarDayCell: {
    width: '14.285%',
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarDayText: {
    fontSize: Typography.xs,
  },
  selectedCalendarDayText: {
    fontWeight: '800',
  },
  reportRangeSummary: {
    fontSize: Typography.xs,
    textAlign: 'center',
    lineHeight: 18,
  },
  reportActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  reportActionButton: {
    flex: 1,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.xs,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  reportActionText: {
    fontSize: Typography.xs,
    fontWeight: '700',
  },
  title: {
    fontSize: Typography.xxl,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: Typography.xs,
    marginTop: 2,
  },
  totalsCard: {
    flexDirection: 'row',
    marginHorizontal: Spacing.md,
    marginVertical: Spacing.xs,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.sm,
  },
  totalCol: {
    flex: 1,
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: Typography.xs,
    fontWeight: '700',
  },
  totalValue: {
    fontSize: Typography.sm,
    fontWeight: '800',
    marginTop: 2,
  },
  verticalDivider: {
    width: 1,
    height: '70%',
    alignSelf: 'center',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.md,
    marginVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm + 2,
    minHeight: 46,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    gap: Spacing.xs,
  },
  searchInput: {
    flex: 1,
    fontSize: Typography.sm,
    paddingVertical: 4,
  },
  filterSection: {
    marginVertical: Spacing.xs,
  },
  filterChipsRow: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
    alignItems: 'center',
  },
  filterChip: {
    paddingHorizontal: Spacing.sm + 2,
    minHeight: 36,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: Typography.xs,
    fontWeight: '600',
  },
  chipDivider: {
    width: 1,
    height: 18,
    marginHorizontal: 4,
  },
  listContent: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  groupContainer: {
    marginTop: Spacing.md,
  },
  groupTitle: {
    fontSize: Typography.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.xs,
  },
  groupCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#163B28',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 72,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    gap: Spacing.sm,
  },
  txIconCircle: {
    width: 40,
    height: 40,
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
  txMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  txMetaBadge: {
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: 'hidden',
  },
  txTimeText: {
    fontSize: 11,
  },
  txAmount: {
    fontSize: Typography.md,
    fontWeight: '800',
  },
  rowDivider: {
    height: 1,
    marginLeft: 64,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
    gap: Spacing.xs,
  },
  emptyTitle: {
    fontSize: Typography.md,
    fontWeight: '700',
    marginTop: Spacing.xs,
  },
  emptySubtitle: {
    fontSize: Typography.xs,
    textAlign: 'center',
  },
  // Detail modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  detailSheet: {
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
    gap: Spacing.md,
  },
  detailHeader: {
    alignItems: 'center',
    gap: Spacing.xs,
    paddingBottom: Spacing.sm,
  },
  detailIconCircle: {
    width: 60,
    height: 60,
    borderRadius: BorderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  detailAmount: {
    fontSize: Typography.hero,
    fontWeight: '800',
    letterSpacing: -1,
  },
  detailCategory: {
    fontSize: Typography.md,
    fontWeight: '700',
  },
  detailNote: {
    fontSize: Typography.sm,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  detailCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.sm,
    gap: 0,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
  },
  detailLabel: {
    fontSize: Typography.sm,
    flex: 1,
  },
  detailValue: {
    fontSize: Typography.sm,
    fontWeight: '600',
    textAlign: 'right',
  },
  detailRowDivider: {
    height: 1,
    marginHorizontal: Spacing.xs,
  },
  detailActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  detailActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  detailActionText: {
    color: '#FFFFFF',
    fontSize: Typography.sm,
    fontWeight: '700',
  },
});
