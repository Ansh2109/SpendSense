import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Modal, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { PieChart, BarChart } from 'react-native-gifted-charts';
import { useAppTheme } from '../../src/context/ThemeContext';
import { Spacing, BorderRadius, Typography } from '../../src/constants/theme';
import { formatPaiseToINR, paiseToRupees } from '../../src/utils/money';
import { transactionRepository } from '../../src/db/repositories';
import { TransactionWithDetails } from '../../src/db/repositories/transactionRepository';
import { reportService } from '../../src/services/reportService';
import { BudgetPeriod, BUDGET_PERIOD_LABELS, getBudgetPeriodRange, isDateInBudgetPeriod } from '../../src/utils/budgetPeriod';
import { BudgetEditorModal } from '../../src/components/BudgetEditorModal';
import { useAppStore } from '../../src/store';

type PeriodType = 'week' | 'month' | 'year' | 'custom' | 'fy' | 'all';
type PickerMode = 'month' | 'year' | 'custom';

const toDateKey = (date: Date): string => {
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

interface CategoryBreakdown {
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  totalPaise: number;
  percentage: number;
}

interface AccountBreakdown {
  accountName: string;
  totalPaise: number;
  percentage: number;
}

export default function StatsScreen() {
  const { colors, isDark } = useAppTheme();

  const [period, setPeriod] = useState<PeriodType>('month');
  const [pickerMode, setPickerMode] = useState<PickerMode | null>(null);
  const [reportPickerVisible, setReportPickerVisible] = useState(false);
  const [reportPeriod, setReportPeriod] = useState<PeriodType>('week');
  const [reportFormat, setReportFormat] = useState<'csv' | 'pdf'>('pdf');
  const [selectedMonth, setSelectedMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [yearPageStart, setYearPageStart] = useState(() => Math.floor(new Date().getFullYear() / 10) * 10);
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [customStartDate, setCustomStartDate] = useState(() => toDateKey(new Date()));
  const [customEndDate, setCustomEndDate] = useState(() => toDateKey(new Date()));
  const [customDateTarget, setCustomDateTarget] = useState<'start' | 'end'>('start');
  const [customSelectingEnd, setCustomSelectingEnd] = useState(false);
  const [activeTab, setActiveTab] = useState<'expense' | 'income'>('expense');
  const [transactions, setTransactions] = useState<TransactionWithDetails[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [budgetEditorVisible, setBudgetEditorVisible] = useState(false);
  const { budgetPeriod, budgetLimits, setBudget, setBudgetPeriod, refreshAll } = useAppStore();
  const budgetLimitPaise = budgetLimits[budgetPeriod];

  const loadData = useCallback(() => {
    try {
      refreshAll();
      const all = transactionRepository.getAll();
      setTransactions(all);

    } catch (err) {
      console.error('Failed to load stats data:', err);
    }
  }, [refreshAll]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const todayKey = toDateKey(new Date());
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  const getSelectedRange = useCallback((selectedPeriod: PeriodType = period): { start: string; end: string; label: string } | null => {
    const now = new Date();
    if (selectedPeriod === 'week') {
      const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
      const endDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + 6);
      return {
        start: toDateKey(startDate),
        end: todayKey,
        label: `Week ${formatDateKey(toDateKey(startDate))} – ${formatDateKey(toDateKey(endDate))}`,
      };
    }
    if (selectedPeriod === 'month') {
      const year = selectedMonth.getFullYear();
      const month = selectedMonth.getMonth();
      const start = toDateKey(new Date(year, month, 1));
      const monthEnd = toDateKey(new Date(year, month + 1, 0));
      const end = monthEnd > todayKey ? todayKey : monthEnd;
      if (start > end) return null;
      return { start, end, label: `${monthNames[month]} ${year}` };
    }
    if (selectedPeriod === 'year') {
      const start = toDateKey(new Date(selectedYear, 0, 1));
      const yearEnd = toDateKey(new Date(selectedYear, 11, 31));
      const end = yearEnd > todayKey ? todayKey : yearEnd;
      if (start > end) return null;
      return { start, end, label: `${selectedYear}` };
    }
    if (selectedPeriod === 'custom') {
      if (!customStartDate || !customEndDate || customEndDate < customStartDate) return null;
      return {
        start: customStartDate,
        end: customEndDate,
        label: `${formatDateKey(customStartDate)} to ${formatDateKey(customEndDate)}`,
      };
    }
    if (selectedPeriod === 'fy') {
      const range = getBudgetPeriodRange('yearly', now);
      return {
        start: range.start,
        end: range.end > todayKey ? todayKey : range.end,
        label: `Financial Year ${range.start.slice(0, 4)}–${range.end.slice(0, 4)}`,
      };
    }
    return null;
  }, [period, todayKey, selectedMonth, selectedYear, customStartDate, customEndDate]);

  // Filter transactions by the selected calendar range.
  const periodTransactions = useMemo(() => {
    if (period === 'all') return transactions;
    const range = getSelectedRange();
    if (!range) return [];
    return transactions.filter((transaction) => {
      const transactionDate = new Date(transaction.date);
      if (Number.isNaN(transactionDate.getTime())) return false;
      const dateKey = toDateKey(transactionDate);
      return dateKey >= range.start && dateKey <= range.end;
    });
  }, [transactions, period, getSelectedRange]);

  // Totals for filtered period
  const totalExpensePaise = useMemo(() => {
    return periodTransactions
      .filter((t) => t.type === 'expense')
      .reduce((sum, t) => sum + t.amountPaise, 0);
  }, [periodTransactions]);

  const totalIncomePaise = useMemo(() => {
    return periodTransactions
      .filter((t) => t.type === 'income')
      .reduce((sum, t) => sum + t.amountPaise, 0);
  }, [periodTransactions]);

  const netSavingsPaise = totalIncomePaise - totalExpensePaise;

  // Average daily spend for current period
  const averageDailySpendPaise = useMemo(() => {
    if (totalExpensePaise <= 0) return 0;
    const now = new Date();
    let dayCount = 1;
    if (period === 'week') {
      dayCount = now.getDay() + 1;
    } else if (period !== 'all') {
      const range = getSelectedRange();
      if (range) {
        const [startYear, startMonth, startDay] = range.start.split('-').map(Number);
        const [endYear, endMonth, endDay] = range.end.split('-').map(Number);
        const startDate = new Date(startYear, startMonth - 1, startDay);
        const endDate = new Date(endYear, endMonth - 1, endDay);
        dayCount = Math.floor((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1;
      }
    } else if (transactions.length > 0) {
      const firstDate = transactions.reduce((earliest, tx) => {
        const parsedDate = new Date(tx.date);
        const txDate = Number.isNaN(parsedDate.getTime()) ? todayKey : toDateKey(parsedDate);
        return txDate < earliest ? txDate : earliest;
      }, todayKey);
      const [year, month, day] = firstDate.split('-').map(Number);
      dayCount = Math.floor((now.getTime() - new Date(year, month - 1, day).getTime()) / 86_400_000) + 1;
    }
    return Math.round(totalExpensePaise / Math.max(1, dayCount));
  }, [totalExpensePaise, period, transactions, getSelectedRange]);

  // Filter for active Tab (Expense vs Income)
  const tabTransactions = useMemo(() => {
    return periodTransactions.filter((t) => t.type === activeTab);
  }, [periodTransactions, activeTab]);

  const totalForActiveType = activeTab === 'expense' ? totalExpensePaise : totalIncomePaise;

  // Group by Category
  const categoryBreakdowns: CategoryBreakdown[] = useMemo(() => {
    const categoryMap = new Map<string, { icon: string; color: string; total: number }>();
    tabTransactions.forEach((t) => {
      const existing = categoryMap.get(t.categoryName) || {
        icon: t.categoryIcon,
        color: t.categoryColor,
        total: 0,
      };
      existing.total += t.amountPaise;
      categoryMap.set(t.categoryName, existing);
    });

    return Array.from(categoryMap.entries())
      .map(([categoryName, data]) => ({
        categoryName,
        categoryIcon: data.icon,
        categoryColor: data.color,
        totalPaise: data.total,
        percentage: totalForActiveType > 0 ? Math.round((data.total / totalForActiveType) * 100) : 0,
      }))
      .sort((a, b) => b.totalPaise - a.totalPaise);
  }, [tabTransactions, totalForActiveType]);

  // Top spending category
  const topCategory = categoryBreakdowns[0] || null;

  // Account Breakdown for current period
  const accountBreakdowns: AccountBreakdown[] = useMemo(() => {
    const accMap = new Map<string, number>();
    tabTransactions.forEach((t) => {
      const prev = accMap.get(t.accountName) || 0;
      accMap.set(t.accountName, prev + t.amountPaise);
    });

    return Array.from(accMap.entries())
      .map(([accountName, totalPaise]) => ({
        accountName,
        totalPaise,
        percentage: totalForActiveType > 0 ? Math.round((totalPaise / totalForActiveType) * 100) : 0,
      }))
      .sort((a, b) => b.totalPaise - a.totalPaise);
  }, [tabTransactions, totalForActiveType]);

  // Donut Chart Data
  const pieChartData = useMemo(() => {
    if (categoryBreakdowns.length === 0) return [];
    return categoryBreakdowns.map((item) => ({
      value: Math.max(1, paiseToRupees(item.totalPaise)),
      color: item.categoryColor,
      text: item.percentage >= 10 ? `${item.percentage}%` : '',
      textColor: '#FFFFFF',
      textSize: 10,
    }));
  }, [categoryBreakdowns]);

  // Use daily, monthly, or yearly buckets to match the selected analytics range.
  const trendBarData = useMemo(() => {
    const bars: {
      label: string;
      value: number;
      incomeValue: number;
      frontColor: string;
      labelTextStyle?: { color: string; fontSize: number; fontWeight: '500' | '700' };
      topLabelComponent?: () => React.ReactElement | null;
    }[] = [];
    const today = new Date();
    const range = period === 'all' ? null : getSelectedRange();
    const validDates = periodTransactions
      .map((transaction) => new Date(transaction.date))
      .filter((date) => !Number.isNaN(date.getTime()));
    const firstTransactionDate = validDates.length > 0
      ? new Date(Math.min(...validDates.map((date) => date.getTime())))
      : today;
    const startDate = range
      ? new Date(...range.start.split('-').map(Number).map((value, index) => index === 1 ? value - 1 : value) as [number, number, number])
      : firstTransactionDate;
    const rangeEnd = range
      ? range.end
      : todayKey;
    const endDate = new Date(...rangeEnd.split('-').map(Number).map((value, index) => index === 1 ? value - 1 : value) as [number, number, number]);
    const effectiveEndDate = endDate > today ? today : endDate;
    const daySpan = Math.max(1, Math.floor((effectiveEndDate.getTime() - startDate.getTime()) / 86_400_000) + 1);
    const bucketType: 'day' | 'month' | 'year' = daySpan <= 31
      ? 'day'
      : daySpan <= 800
        ? 'month'
        : 'year';
    const bucketStarts: Date[] = [];
    const cursor = bucketType === 'day'
      ? new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())
      : bucketType === 'month'
        ? new Date(startDate.getFullYear(), startDate.getMonth(), 1)
        : new Date(startDate.getFullYear(), 0, 1);
    while (cursor <= effectiveEndDate) {
      bucketStarts.push(new Date(cursor));
      if (bucketType === 'day') cursor.setDate(cursor.getDate() + 1);
      else if (bucketType === 'month') cursor.setMonth(cursor.getMonth() + 1);
      else cursor.setFullYear(cursor.getFullYear() + 1);
    }

    for (const bucketStart of bucketStarts) {
      const nextBucket = new Date(bucketStart);
      if (bucketType === 'day') nextBucket.setDate(nextBucket.getDate() + 1);
      else if (bucketType === 'month') nextBucket.setMonth(nextBucket.getMonth() + 1);
      else nextBucket.setFullYear(nextBucket.getFullYear() + 1);
      const bucketTransactions = periodTransactions
        .filter((transaction) => {
          const txDate = new Date(transaction.date);
          return txDate >= bucketStart && txDate < nextBucket;
        });
      const expensePaise = bucketTransactions
        .filter((transaction) => transaction.type === 'expense')
        .reduce((sum, transaction) => sum + transaction.amountPaise, 0);
      const incomePaise = bucketTransactions
        .filter((transaction) => transaction.type === 'income')
        .reduce((sum, transaction) => sum + transaction.amountPaise, 0);
      const expenseValue = paiseToRupees(expensePaise);
      const incomeValue = paiseToRupees(incomePaise);
      const label = bucketType === 'day'
        ? bucketStart.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
        : bucketType === 'month'
          ? bucketStart.toLocaleDateString('en-IN', { month: 'short' })
          : String(bucketStart.getFullYear());
      const latestBucket = bucketStart.getFullYear() === effectiveEndDate.getFullYear() &&
        (bucketType === 'year' || bucketStart.getMonth() === effectiveEndDate.getMonth()) &&
        (bucketType !== 'day' || bucketStart.getDate() === effectiveEndDate.getDate());

      bars.push({
        label,
        value: expenseValue,
        incomeValue,
        frontColor: colors.expense,
        labelTextStyle: {
          color: latestBucket ? colors.primary : colors.text,
          fontSize: 11,
          fontWeight: latestBucket ? '700' : '500',
        },
        topLabelComponent: () =>
          expenseValue > 0 ? (
            <Text style={{ fontSize: 9, color: colors.textSecondary, marginBottom: 2, textAlign: 'center', fontWeight: '600' }}>
              ₹{expenseValue >= 1000 ? `${(expenseValue / 1000).toFixed(1)}k` : expenseValue}
            </Text>
          ) : null,
      });
    }

    return bars;
  }, [periodTransactions, period, getSelectedRange, todayKey, colors.expense, colors.text, colors.textSecondary]);

  const incomeTrendBarData = useMemo(
    () => trendBarData.map((bar) => ({
      ...bar,
      value: bar.incomeValue,
      frontColor: colors.income,
      labelTextStyle: { color: colors.text, fontSize: 11, fontWeight: '500' as const },
      topLabelComponent: () => bar.incomeValue > 0 ? (
        <Text style={{ fontSize: 9, color: colors.textSecondary, marginBottom: 2, textAlign: 'center', fontWeight: '600' }}>
          ₹{bar.incomeValue >= 1000 ? `${(bar.incomeValue / 1000).toFixed(1)}k` : bar.incomeValue}
        </Text>
      ) : null,
    })),
    [trendBarData, colors.income, colors.text, colors.textSecondary]
  );

  const activeTrendBarData = activeTab === 'income' ? incomeTrendBarData : trendBarData;
  const hasActiveTrendData = useMemo(
    () => activeTrendBarData.some((bar) => bar.value > 0),
    [activeTrendBarData]
  );
  const maxTrendValue = useMemo(
    () => Math.ceil(Math.max(...activeTrendBarData.map((bar) => bar.value), 50) * 1.25),
    [activeTrendBarData]
  );
  const trendChartTitle = `${activeTab === 'income' ? 'Income' : 'Expense'} Trend`;

  const budgetPeriodExpensePaise = useMemo(
    () =>
      transactions
        .filter((tx) => tx.type === 'expense' && isDateInBudgetPeriod(tx.date, budgetPeriod))
        .reduce((sum, tx) => sum + tx.amountPaise, 0),
    [transactions, budgetPeriod]
  );

  const budgetUsagePercent =
    budgetLimitPaise > 0
      ? Math.round((budgetPeriodExpensePaise / budgetLimitPaise) * 100)
      : 0;
  const isOverBudget = budgetLimitPaise > 0 && budgetPeriodExpensePaise > budgetLimitPaise;

  const openReportPicker = (format: 'csv' | 'pdf') => {
    setReportFormat(format);
    setReportPeriod(period);
    setReportPickerVisible(true);
  };

  const handleReportExport = async () => {
    const range = getSelectedRange(reportPeriod);
    const reportTransactions = reportPeriod === 'all'
      ? transactions
      : range
        ? transactions.filter((transaction) => {
          const parsedDate = new Date(transaction.date);
          if (Number.isNaN(parsedDate.getTime())) return false;
          const dateKey = toDateKey(parsedDate);
          return dateKey >= range.start && dateKey <= range.end;
        })
        : [];
    if (reportTransactions.length === 0) {
      Alert.alert('No Data', 'No transactions found for the selected dates.');
      return;
    }
    setIsExporting(true);
    try {
      if (reportFormat === 'pdf') {
        const dateRange = range ?? {
          start: reportTransactions.reduce((earliest, transaction) => {
            const parsedDate = new Date(transaction.date);
            const key = Number.isNaN(parsedDate.getTime()) ? todayKey : toDateKey(parsedDate);
            return key < earliest ? key : earliest;
          }, todayKey),
          end: todayKey,
        };
        await reportService.exportStatsPDF(
          reportTransactions,
          `${range?.label ?? 'All Time'} Statement`,
          {
            dateRange,
            budget: {
              periodLabel: BUDGET_PERIOD_LABELS[budgetPeriod],
              expensePaise: budgetPeriodExpensePaise,
              limitPaise: budgetLimitPaise,
            },
          }
        );
      } else {
        await reportService.exportCSV(
          reportTransactions,
          `SpendSense_${reportPeriod}_${range?.start ?? 'all'}_${range?.end ?? 'time'}`
        );
      }
      setReportPickerVisible(false);
    } catch (error) {
      console.error('Failed to export Stats report:', error);
      Alert.alert('Export Error', `Failed to generate ${reportFormat.toUpperCase()} report.`);
    } finally {
      setIsExporting(false);
    }
  };

  const openPeriodPicker = (nextPeriod: PeriodType) => {
    setPeriod(nextPeriod);
    if (nextPeriod === 'month' || nextPeriod === 'year' || nextPeriod === 'custom') {
      setPickerMode(nextPeriod);
      if (nextPeriod === 'custom') {
        setCustomStartDate(todayKey);
        setCustomEndDate(todayKey);
        setCustomDateTarget('start');
        setCustomSelectingEnd(false);
        setCalendarMonth(new Date().getMonth());
        setCalendarYear(new Date().getFullYear());
      }
    } else {
      setPickerMode(null);
    }
  };

  const isCurrentOrFutureCalendarMonth =
    calendarYear > new Date().getFullYear() ||
    (calendarYear === new Date().getFullYear() && calendarMonth >= new Date().getMonth());
  const calendarDaysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
  const calendarStartDay = new Date(calendarYear, calendarMonth, 1).getDay();
  const currentYearPageStart = Math.floor(new Date().getFullYear() / 10) * 10;
  const isFutureYearPage = yearPageStart >= currentYearPageStart;

  const changeCalendarMonth = (direction: -1 | 1) => {
    const next = new Date(calendarYear, calendarMonth + direction, 1);
    const now = new Date();
    if (next.getFullYear() > now.getFullYear() ||
      (next.getFullYear() === now.getFullYear() && next.getMonth() > now.getMonth())) return;
    setCalendarMonth(next.getMonth());
    setCalendarYear(next.getFullYear());
  };

  const selectCustomDate = (day: number) => {
    const selected = toDateKey(new Date(calendarYear, calendarMonth, day));
    if (customDateTarget === 'start') {
      setCustomStartDate(selected);
      if (selected > customEndDate) setCustomEndDate(selected);
      setCustomDateTarget('end');
      setCustomSelectingEnd(true);
    } else {
      if (selected < customStartDate) {
        setCustomStartDate(selected);
        setCustomEndDate(selected);
      } else {
        setCustomEndDate(selected);
      }
      setCustomDateTarget('start');
      setCustomSelectingEnd(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Modal
          visible={pickerMode !== null || reportPickerVisible}
          transparent
          animationType="fade"
          onRequestClose={() => {
            setPickerMode(null);
            setReportPickerVisible(false);
          }}
        >
          <Pressable
            style={styles.pickerOverlay}
            onPress={() => {
              setPickerMode(null);
              setReportPickerVisible(false);
            }}
          >
            <Pressable
              style={[styles.pickerCard, { backgroundColor: colors.surface }]}
              onStartShouldSetResponder={() => true}
            >
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.pickerContent}
                keyboardShouldPersistTaps="handled"
              >
              <View style={styles.pickerHeader}>
                <View style={styles.pickerHeaderText}>
                  <Text style={[styles.pickerTitle, { color: colors.text }]}>
                    {reportPickerVisible
                      ? `Export ${reportFormat.toUpperCase()}`
                      : pickerMode === 'month'
                        ? 'Choose a month'
                        : pickerMode === 'year'
                          ? 'Choose a year'
                          : 'Custom date range'}
                  </Text>
                  <Text style={[styles.pickerSubtitle, { color: colors.textSecondary }]}>
                    {reportPickerVisible ? 'Select the report period to export.' : 'Future dates are not available.'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.pickerClose}
                  onPress={() => {
                    setPickerMode(null);
                    setReportPickerVisible(false);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Close date picker"
                >
                  <Ionicons name="close" size={21} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {reportPickerVisible && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.reportPeriodOptions}
                >
                  {([
                    ['week', 'Week'],
                    ['month', 'Month'],
                    ['year', 'Year'],
                    ['custom', 'Custom'],
                    ['fy', 'FY'],
                    ['all', 'All Time'],
                  ] as [PeriodType, string][]).map(([value, label]) => {
                    const selected = reportPeriod === value;
                    return (
                      <TouchableOpacity
                        key={value}
                        style={[
                          styles.reportPeriodOption,
                          { backgroundColor: selected ? colors.primary : colors.surfaceElevated, borderColor: selected ? colors.primary : colors.border },
                        ]}
                        onPress={() => {
                          setReportPeriod(value);
                          if (value === 'custom') {
                            setCustomStartDate(todayKey);
                            setCustomEndDate(todayKey);
                            setCustomDateTarget('start');
                            setCustomSelectingEnd(false);
                            setCalendarMonth(new Date().getMonth());
                            setCalendarYear(new Date().getFullYear());
                          }
                        }}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                      >
                        <Text style={[styles.reportPeriodOptionText, { color: selected ? '#FFFFFF' : colors.text }]}>
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}

              {(reportPickerVisible ? reportPeriod === 'month' : pickerMode === 'month') && (
                <View style={styles.periodPickerCard}>
                  <View style={styles.pickerNavigation}>
                    <TouchableOpacity
                      style={styles.pickerNavButton}
                      onPress={() => setSelectedMonth((current) => new Date(current.getFullYear() - 1, current.getMonth(), 1))}
                      accessibilityRole="button"
                      accessibilityLabel="Previous year"
                    >
                      <Ionicons name="chevron-back" size={20} color={colors.text} />
                    </TouchableOpacity>
                    <Text style={[styles.pickerYearTitle, { color: colors.text }]}>{selectedMonth.getFullYear()}</Text>
                    <TouchableOpacity
                      style={styles.pickerNavButton}
                      disabled={selectedMonth.getFullYear() >= new Date().getFullYear()}
                      onPress={() => setSelectedMonth((current) => {
                        const now = new Date();
                        const nextYear = current.getFullYear() + 1;
                        return new Date(nextYear, Math.min(current.getMonth(), nextYear === now.getFullYear() ? now.getMonth() : 11), 1);
                      })}
                      accessibilityRole="button"
                      accessibilityLabel="Next year"
                    >
                      <Ionicons
                        name="chevron-forward"
                        size={20}
                        color={selectedMonth.getFullYear() >= new Date().getFullYear() ? colors.textMuted : colors.text}
                      />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.monthGrid}>
                    {monthNames.map((month, index) => {
                      const currentYear = selectedMonth.getFullYear() === new Date().getFullYear();
                      const disabled = currentYear && index > new Date().getMonth();
                      const selected = selectedMonth.getMonth() === index;
                      return (
                        <TouchableOpacity
                          key={month}
                          disabled={disabled}
                          style={[
                            styles.monthChoice,
                            { backgroundColor: selected ? colors.primary : colors.surfaceElevated, borderColor: selected ? colors.primary : colors.border },
                            disabled && styles.disabledDate,
                          ]}
                          onPress={() => setSelectedMonth(new Date(selectedMonth.getFullYear(), index, 1))}
                          accessibilityRole="button"
                          accessibilityState={{ selected, disabled }}
                        >
                          <Text style={[styles.pickerChoiceText, { color: selected ? '#FFFFFF' : colors.text }]}>
                            {month.slice(0, 3)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  {!reportPickerVisible && (
                    <TouchableOpacity style={[styles.pickerDoneButton, { backgroundColor: colors.primary }]} onPress={() => setPickerMode(null)}>
                      <Text style={styles.pickerDoneText}>Show month</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {(reportPickerVisible ? reportPeriod === 'year' : pickerMode === 'year') && (
                <View style={styles.periodPickerCard}>
                  <View style={styles.pickerNavigation}>
                    <TouchableOpacity
                      style={styles.pickerNavButton}
                      onPress={() => setYearPageStart((start) => start - 10)}
                      accessibilityRole="button"
                      accessibilityLabel="Previous years"
                    >
                      <Ionicons name="chevron-back" size={20} color={colors.text} />
                    </TouchableOpacity>
                    <Text style={[styles.pickerYearTitle, { color: colors.text }]}>{yearPageStart} – {yearPageStart + 9}</Text>
                    <TouchableOpacity
                      style={styles.pickerNavButton}
                      disabled={isFutureYearPage}
                      onPress={() => setYearPageStart((start) => start + 10)}
                      accessibilityRole="button"
                      accessibilityLabel="Next years"
                    >
                      <Ionicons name="chevron-forward" size={20} color={isFutureYearPage ? colors.textMuted : colors.text} />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.monthGrid}>
                    {Array.from({ length: 10 }, (_, index) => yearPageStart + index).map((year) => {
                      const disabled = year > new Date().getFullYear();
                      const selected = year === selectedYear;
                      return (
                        <TouchableOpacity
                          key={year}
                          disabled={disabled}
                          style={[
                            styles.monthChoice,
                            { backgroundColor: selected ? colors.primary : colors.surfaceElevated, borderColor: selected ? colors.primary : colors.border },
                            disabled && styles.disabledDate,
                          ]}
                          onPress={() => setSelectedYear(year)}
                          accessibilityRole="button"
                          accessibilityState={{ selected, disabled }}
                        >
                          <Text style={[styles.pickerChoiceText, { color: selected ? '#FFFFFF' : colors.text }]}>{year}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  {!reportPickerVisible && (
                    <TouchableOpacity style={[styles.pickerDoneButton, { backgroundColor: colors.primary }]} onPress={() => setPickerMode(null)}>
                      <Text style={styles.pickerDoneText}>Show year</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {(reportPickerVisible ? reportPeriod === 'custom' : pickerMode === 'custom') && (
                <View style={styles.periodPickerCard}>
                  <View style={styles.customDateButtons}>
                    {(['start', 'end'] as const).map((target) => {
                      const selected = customDateTarget === target;
                      const date = target === 'start' ? customStartDate : customEndDate;
                      return (
                        <TouchableOpacity
                          key={target}
                          style={[
                            styles.customDateButton,
                            { backgroundColor: selected ? colors.primaryLight : colors.surfaceElevated, borderColor: selected ? colors.primary : colors.border },
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
                          <Text style={[styles.customDateLabel, { color: colors.textSecondary }]}>{target === 'start' ? 'FROM' : 'TO'}</Text>
                          <Text style={[styles.customDateValue, { color: colors.text }]}>{formatDateKey(date)}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <View style={styles.pickerNavigation}>
                    <TouchableOpacity style={styles.pickerNavButton} onPress={() => changeCalendarMonth(-1)} accessibilityRole="button" accessibilityLabel="Previous month">
                      <Ionicons name="chevron-back" size={20} color={colors.text} />
                    </TouchableOpacity>
                    <Text style={[styles.pickerYearTitle, { color: colors.text }]}>{monthNames[calendarMonth]} {calendarYear}</Text>
                    <TouchableOpacity style={styles.pickerNavButton} disabled={isCurrentOrFutureCalendarMonth} onPress={() => changeCalendarMonth(1)} accessibilityRole="button" accessibilityLabel="Next month">
                      <Ionicons name="chevron-forward" size={20} color={isCurrentOrFutureCalendarMonth ? colors.textMuted : colors.text} />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.calendarGrid}>
                    {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => (
                      <Text key={day} style={[styles.calendarWeekday, { color: colors.textMuted }]}>{day}</Text>
                    ))}
                    {Array.from({ length: calendarStartDay }, (_, index) => (
                      <View key={`empty-${index}`} style={styles.calendarDay} />
                    ))}
                    {Array.from({ length: calendarDaysInMonth }, (_, index) => {
                      const day = index + 1;
                      const dateKey = toDateKey(new Date(calendarYear, calendarMonth, day));
                      const disabled = dateKey > todayKey || (customDateTarget === 'end' && dateKey < customStartDate);
                      const selected = dateKey === customStartDate || dateKey === customEndDate;
                      const between = dateKey > customStartDate && dateKey < customEndDate;
                      return (
                        <TouchableOpacity
                          key={dateKey}
                          disabled={disabled}
                          style={[
                            styles.calendarDay,
                            between && { backgroundColor: colors.primaryLight },
                            selected && { backgroundColor: colors.primary, borderRadius: BorderRadius.full },
                            disabled && styles.disabledDate,
                          ]}
                          onPress={() => selectCustomDate(day)}
                          accessibilityRole="button"
                          accessibilityLabel={formatDateKey(dateKey)}
                          accessibilityState={{ selected, disabled }}
                        >
                          <Text style={[styles.calendarDayText, { color: selected ? '#FFFFFF' : dateKey === todayKey ? colors.primary : colors.text }]}>
                            {day}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <Text style={[styles.pickerSubtitle, { color: colors.textSecondary, textAlign: 'center' }]}>
                    {customSelectingEnd ? 'Select an end date on or after the start date.' : 'Choose a start date; future dates are disabled.'}
                  </Text>
                  {!reportPickerVisible && (
                    <TouchableOpacity style={[styles.pickerDoneButton, { backgroundColor: colors.primary }]} onPress={() => setPickerMode(null)}>
                      <Text style={styles.pickerDoneText}>Apply date range</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
              {reportPickerVisible && (reportPeriod === 'week' || reportPeriod === 'fy' || reportPeriod === 'all') && (
                <View style={[styles.reportRangeSummaryCard, { backgroundColor: colors.surfaceElevated }]}>
                  <Ionicons name="calendar-outline" size={20} color={colors.primary} />
                  <Text style={[styles.reportRangeSummaryText, { color: colors.text }]}>
                    {reportPeriod === 'all'
                      ? 'Includes all saved transactions'
                      : `${getSelectedRange(reportPeriod)?.label ?? ''}${reportPeriod === 'week' ? ' · Sunday–Saturday' : ''}`}
                  </Text>
                  {reportPeriod !== 'all' && (
                    <Text style={[styles.pickerSubtitle, { color: colors.textSecondary, textAlign: 'center' }]}>
                      Includes transactions through today.
                    </Text>
                  )}
                </View>
              )}
              {reportPickerVisible && (
                <TouchableOpacity
                  style={[styles.pickerDoneButton, { backgroundColor: colors.primary }, isExporting && styles.disabledDate]}
                  onPress={() => { void handleReportExport(); }}
                  disabled={isExporting}
                  accessibilityRole="button"
                >
                  <Text style={styles.pickerDoneText}>
                    {isExporting ? 'Preparing…' : `Export ${reportFormat.toUpperCase()}`}
                  </Text>
                </TouchableOpacity>
              )}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>

        <BudgetEditorModal
          visible={budgetEditorVisible}
          initialPeriod={budgetPeriod}
          limits={budgetLimits}
          onClose={() => setBudgetEditorVisible(false)}
          onSave={(nextPeriod, limitPaise) => {
            if (setBudget(nextPeriod, limitPaise)) setBudgetEditorVisible(false);
          }}
        />

        {/* Header */}
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={[styles.title, { color: colors.text }]}>Stats</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Spending insights and category trends
            </Text>
          </View>

          {/* Export Action Buttons */}
          <View style={styles.exportButtonsRow}>
            <TouchableOpacity
              style={[styles.exportBtn, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
              onPress={() => openReportPicker('csv')}
              disabled={isExporting}
            >
              <Ionicons name="document-text-outline" size={14} color={colors.primary} />
              <Text style={[styles.exportBtnText, { color: colors.primary }]}>CSV</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.exportBtn, { backgroundColor: colors.primary }]}
              onPress={() => openReportPicker('pdf')}
              disabled={isExporting}
            >
              <Ionicons name="print-outline" size={14} color="#FFFFFF" />
              <Text style={[styles.exportBtnText, { color: '#FFFFFF' }]}>PDF</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Analytics Period Selector */}
        <View style={[styles.periodToggle, { backgroundColor: colors.surfaceElevated }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.periodOptions}>
            {([
              ['week', 'Week'],
              ['month', 'Month'],
              ['year', 'Year'],
              ['custom', 'Custom'],
              ['fy', 'FY'],
              ['all', 'All Time'],
            ] as [PeriodType, string][]).map(([value, label]) => {
              const selected = period === value;
              return (
                <TouchableOpacity
                  key={value}
                  style={[styles.periodBtn, selected && { backgroundColor: colors.primary }]}
                  onPress={() => openPeriodPicker(value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.periodText, { color: selected ? '#FFFFFF' : colors.textSecondary }]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
        {period !== 'all' && getSelectedRange() && (
          <Text style={[styles.selectedPeriodLabel, { color: colors.textSecondary }]}>
            {getSelectedRange()?.label}
          </Text>
        )}

        {/* Summary Metric Cards */}
        <View style={styles.metricsRow}>
          <View style={[styles.metricCard, { backgroundColor: colors.incomeBg, borderColor: colors.income }]}>
            <View style={styles.metricIconRow}>
              <Ionicons name="arrow-down-circle" size={16} color={colors.income} />
              <Text style={[styles.metricCardLabel, { color: colors.income }]}>Income</Text>
            </View>
            <Text style={[styles.metricCardValue, { color: colors.income }]}>
              {formatPaiseToINR(totalIncomePaise)}
            </Text>
          </View>

          <View style={[styles.metricCard, { backgroundColor: colors.expenseBg, borderColor: colors.expense }]}>
            <View style={styles.metricIconRow}>
              <Ionicons name="arrow-up-circle" size={16} color={colors.expense} />
              <Text style={[styles.metricCardLabel, { color: colors.expense }]}>Expenses</Text>
            </View>
            <Text style={[styles.metricCardValue, { color: colors.expense }]}>
              {formatPaiseToINR(totalExpensePaise)}
            </Text>
          </View>
        </View>

        {/* Highlight Insights: Net Savings + Daily Burn Rate */}
        <View style={styles.insightsRow}>
          <View style={[styles.insightBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.insightHeader}>
              <Ionicons
                name={netSavingsPaise >= 0 ? 'wallet-outline' : 'warning-outline'}
                size={16}
                color={netSavingsPaise >= 0 ? colors.primary : colors.expense}
              />
              <Text style={[styles.insightLabel, { color: colors.textSecondary }]}>Net Savings</Text>
            </View>
            <Text style={[styles.insightValue, { color: netSavingsPaise >= 0 ? colors.text : colors.expense }]}>
              {formatPaiseToINR(netSavingsPaise)}
            </Text>
          </View>

          <View style={[styles.insightBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.insightHeader}>
              <Ionicons name="flame-outline" size={16} color="#F59E0B" />
              <Text style={[styles.insightLabel, { color: colors.textSecondary }]}>Daily Average</Text>
            </View>
            <Text style={[styles.insightValue, { color: colors.text }]}>
              {formatPaiseToINR(averageDailySpendPaise)}
            </Text>
          </View>
        </View>

        {/* Top Expense Badge (if available) */}
        {topCategory && activeTab === 'expense' && (
          <View style={[styles.topCategoryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="trending-up" size={18} color={topCategory.categoryColor} />
            <Text style={[styles.topCategoryText, { color: colors.text }]}>
              Top Spending:{' '}
              <Text style={{ fontWeight: '800', color: topCategory.categoryColor }}>
                {topCategory.categoryName} ({topCategory.percentage}% · {formatPaiseToINR(topCategory.totalPaise)})
              </Text>
            </Text>
          </View>
        )}

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.budgetHeader}>
              <View>
                <Text style={[styles.cardCaption, { color: colors.textSecondary }]}>
                  {BUDGET_PERIOD_LABELS[budgetPeriod]} budget
                </Text>
                <Text style={[styles.budgetAmount, { color: isOverBudget ? colors.expense : colors.text }]}>
                  {formatPaiseToINR(budgetPeriodExpensePaise)} / {budgetLimitPaise > 0 ? formatPaiseToINR(budgetLimitPaise) : 'Not set'}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.budgetEditButton, { backgroundColor: colors.primaryLight }]}
                onPress={() => setBudgetEditorVisible(true)}
              >
                <Ionicons name="create-outline" size={15} color={colors.primary} />
                <Text style={[styles.budgetEditText, { color: colors.primary }]}>Set limit</Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.budgetPeriodPicker, { backgroundColor: colors.surfaceElevated }]}>
              {(['weekly', 'monthly', 'yearly'] as BudgetPeriod[]).map((option) => {
                const selected = budgetPeriod === option;
                return (
                  <TouchableOpacity
                    key={option}
                    style={[styles.budgetPeriodButton, selected && { backgroundColor: colors.primary }]}
                    onPress={() => setBudgetPeriod(option)}
                  >
                    <Text style={[styles.budgetPeriodText, { color: selected ? '#FFFFFF' : colors.textSecondary }]}>
                      {BUDGET_PERIOD_LABELS[option]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {budgetPeriod === 'yearly' && (
              <Text style={[styles.budgetPeriodHint, { color: colors.textSecondary }]}>
                Financial year runs April–March.
              </Text>
            )}

            {budgetLimitPaise > 0 && (
              <>
                <View style={[styles.progressBarTrack, { backgroundColor: colors.surfaceElevated }]}>
                  <View
                    style={[
                      styles.progressBarFill,
                      {
                        width: `${Math.min(budgetUsagePercent, 100)}%`,
                        backgroundColor: isOverBudget ? colors.expense : colors.primary,
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.percentageBadge, { color: isOverBudget ? colors.expense : colors.primary }]}>
                  {budgetUsagePercent}% of this {BUDGET_PERIOD_LABELS[budgetPeriod].toLowerCase()} limit used
                </Text>
              </>
            )}

            {isOverBudget && (
              <Text style={[styles.overBudgetWarning, { color: colors.expense }]}>
                Over limit by {formatPaiseToINR(budgetPeriodExpensePaise - budgetLimitPaise)}.
              </Text>
            )}
          </View>

        {/* Spending trend for the selected analytics range */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.typeToggleContainer, { backgroundColor: colors.surfaceElevated }]}>
            <TouchableOpacity
              style={[styles.typeTab, activeTab === 'expense' && { backgroundColor: colors.surface, elevation: 1 }]}
              onPress={() => setActiveTab('expense')}
              accessibilityRole="button"
              accessibilityState={{ selected: activeTab === 'expense' }}
            >
              <Ionicons
                name="arrow-up-circle"
                size={16}
                color={activeTab === 'expense' ? colors.expense : colors.textSecondary}
              />
              <Text style={[styles.typeTabText, { color: activeTab === 'expense' ? colors.text : colors.textSecondary }]}>
                Expense
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.typeTab, activeTab === 'income' && { backgroundColor: colors.surface, elevation: 1 }]}
              onPress={() => setActiveTab('income')}
              accessibilityRole="button"
              accessibilityState={{ selected: activeTab === 'income' }}
            >
              <Ionicons
                name="arrow-down-circle"
                size={16}
                color={activeTab === 'income' ? colors.income : colors.textSecondary}
              />
              <Text style={[styles.typeTabText, { color: activeTab === 'income' ? colors.text : colors.textSecondary }]}>
                Income
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.cardHeaderRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons
                name="bar-chart-outline"
                size={18}
                color={activeTab === 'income' ? colors.income : colors.expense}
              />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>{trendChartTitle}</Text>
            </View>
            <Text style={[styles.cardCaption, { color: colors.textMuted }]}>
              {period === 'all' ? 'All time' : getSelectedRange()?.label} · ₹
            </Text>
          </View>

          {hasActiveTrendData ? (
            <View style={styles.trendCharts}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <BarChart
                  data={activeTrendBarData}
                  width={Math.max(320, activeTrendBarData.length * 42 + 32)}
                  height={170}
                  barWidth={activeTrendBarData.length > 18 ? 14 : 22}
                  spacing={activeTrendBarData.length > 18 ? 8 : 16}
                  initialSpacing={14}
                  roundedTop
                  hideRules={false}
                  rulesColor={colors.border}
                  rulesType="solid"
                  xAxisThickness={1}
                  yAxisThickness={0}
                  xAxisColor={colors.border}
                  xAxisLabelTextStyle={{ color: colors.text, fontSize: 11, fontWeight: '600' }}
                  yAxisTextStyle={{ color: colors.textSecondary, fontSize: 10 }}
                  noOfSections={3}
                  maxValue={maxTrendValue}
                  isAnimated={false}
                />
              </ScrollView>
            </View>
          ) : (
            <View style={styles.emptyChartContainer}>
              <Ionicons name="bar-chart-outline" size={32} color={colors.textMuted} />
              <Text style={[styles.emptyChartText, { color: colors.textSecondary }]}>
                No {activeTab} found for this period
              </Text>
              <Text style={[styles.emptyChartSubText, { color: colors.textMuted }]}>
                Add {activeTab} transactions within the selected dates to see the trend here.
              </Text>
            </View>
          )}
        </View>

        {/* Category Donut & Breakdown Section */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {/* Donut Chart Visual */}
          {pieChartData.length > 0 ? (
            <View style={styles.pieContainer}>
              <PieChart
                data={pieChartData}
                donut
                radius={85}
                innerRadius={58}
                innerCircleColor={colors.surface}
                centerLabelComponent={() => (
                  <View style={{ justifyContent: 'center', alignItems: 'center' }}>
                    <Text style={{ fontSize: 11, color: colors.textSecondary, fontWeight: '600' }}>
                      {activeTab === 'expense' ? 'Total Spent' : 'Total Income'}
                    </Text>
                    <Text
                      style={{
                        fontSize: Typography.md,
                        color: activeTab === 'expense' ? colors.expense : colors.income,
                        fontWeight: '800',
                        marginTop: 2,
                      }}
                    >
                      {formatPaiseToINR(totalForActiveType)}
                    </Text>
                  </View>
                )}
              />
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Ionicons name="pie-chart-outline" size={44} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                No {activeTab} records found for this period.{'\n'}Add transactions to see visual category breakdown.
              </Text>
            </View>
          )}

          {/* Category Rows with Colored Progress Bars */}
          {categoryBreakdowns.length > 0 && (
            <View style={{ marginTop: Spacing.md }}>
              <Text style={[styles.listHeaderTitle, { color: colors.textSecondary }]}>
                CATEGORIES & PERCENTAGE
              </Text>
              {categoryBreakdowns.map((item) => (
                <View key={item.categoryName} style={styles.categoryItem}>
                  <View style={styles.categoryHeaderRow}>
                    <View style={styles.categoryLeft}>
                      <View style={[styles.iconCircle, { backgroundColor: `${item.categoryColor}20` }]}>
                        <Ionicons name={item.categoryIcon as any} size={18} color={item.categoryColor} />
                      </View>
                      <Text style={[styles.categoryName, { color: colors.text }]}>{item.categoryName}</Text>
                    </View>
                    <View style={styles.categoryRight}>
                      <Text style={[styles.categoryAmount, { color: colors.text }]}>
                        {formatPaiseToINR(item.totalPaise)}
                      </Text>
                      <Text style={[styles.categoryPercent, { color: colors.textSecondary }]}>
                        {item.percentage}%
                      </Text>
                    </View>
                  </View>

                  {/* Visual Bar */}
                  <View style={[styles.itemBarTrack, { backgroundColor: colors.surfaceElevated }]}>
                    <View
                      style={[
                        styles.itemBarFill,
                        { width: `${item.percentage}%`, backgroundColor: item.categoryColor },
                      ]}
                    />
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Account Breakdown Distribution */}
          {accountBreakdowns.length > 0 && (
            <View style={{ marginTop: Spacing.lg, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: colors.border }}>
              <Text style={[styles.listHeaderTitle, { color: colors.textSecondary }]}>
                PAYMENT ACCOUNT DISTRIBUTION
              </Text>
              <View style={styles.accountsRow}>
                {accountBreakdowns.map((acc) => (
                  <View
                    key={acc.accountName}
                    style={[styles.accountChip, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
                  >
                    <Text style={[styles.accountChipName, { color: colors.text }]}>{acc.accountName}</Text>
                    <Text style={[styles.accountChipAmount, { color: colors.primary }]}>
                      {formatPaiseToINR(acc.totalPaise)}
                    </Text>
                    <Text style={[styles.accountChipPercent, { color: colors.textSecondary }]}>
                      {acc.percentage}%
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}
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
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    gap: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
    gap: Spacing.sm,
  },
  headerText: {
    flex: 1,
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
  exportButtonsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  exportBtn: {
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
  exportBtnText: {
    fontSize: Typography.xs,
    fontWeight: '700',
  },
  periodToggle: {
    borderRadius: BorderRadius.lg,
    padding: 4,
  },
  periodOptions: {
    flexDirection: 'row',
    gap: 4,
  },
  periodBtn: {
    minWidth: 64,
    paddingHorizontal: Spacing.sm,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.md,
  },
  periodText: {
    fontSize: Typography.xs,
    fontWeight: '700',
  },
  selectedPeriodLabel: {
    fontSize: Typography.xs,
    textAlign: 'center',
    marginTop: -Spacing.xs,
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    padding: Spacing.md,
  },
  pickerCard: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '92%',
    alignSelf: 'center',
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    gap: Spacing.md,
    overflow: 'hidden',
  },
  pickerContent: {
    gap: Spacing.md,
  },
  reportPeriodOptions: {
    flexDirection: 'row',
    gap: Spacing.xs,
    paddingRight: Spacing.xs,
  },
  reportPeriodOption: {
    minHeight: 38,
    paddingHorizontal: Spacing.sm + 2,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportPeriodOptionText: {
    fontSize: Typography.xs,
    fontWeight: '700',
  },
  reportRangeSummaryCard: {
    alignItems: 'center',
    gap: Spacing.xs,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  reportRangeSummaryText: {
    textAlign: 'center',
    fontSize: Typography.sm,
    fontWeight: '700',
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  pickerHeaderText: {
    flex: 1,
  },
  pickerTitle: {
    fontSize: Typography.lg,
    fontWeight: '800',
  },
  pickerSubtitle: {
    fontSize: Typography.xs,
    lineHeight: 17,
    marginTop: 2,
  },
  pickerClose: {
    width: 38,
    height: 38,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodPickerCard: {
    gap: Spacing.sm,
  },
  pickerNavigation: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pickerNavButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerYearTitle: {
    fontSize: Typography.md,
    fontWeight: '800',
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: Spacing.xs,
  },
  monthChoice: {
    width: '31%',
    minHeight: 42,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerChoiceText: {
    fontSize: Typography.xs,
    fontWeight: '700',
  },
  disabledDate: {
    opacity: 0.35,
  },
  pickerDoneButton: {
    minHeight: 46,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.xs,
  },
  pickerDoneText: {
    color: '#FFFFFF',
    fontSize: Typography.sm,
    fontWeight: '700',
  },
  customDateButtons: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  customDateButton: {
    flex: 1,
    minHeight: 56,
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
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
  calendarGrid: {
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
  calendarDay: {
    width: '14.285%',
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarDayText: {
    fontSize: Typography.xs,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  metricCard: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
  },
  metricIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  metricCardLabel: {
    fontSize: Typography.xs,
    fontWeight: '700',
  },
  metricCardValue: {
    fontSize: Typography.lg,
    fontWeight: '800',
  },
  insightsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  insightBox: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
  },
  insightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },
  insightLabel: {
    fontSize: Typography.xs,
    fontWeight: '700',
  },
  insightValue: {
    fontSize: Typography.md,
    fontWeight: '800',
  },
  topCategoryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: Spacing.sm + 2,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  topCategoryText: {
    fontSize: Typography.xs,
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
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  cardCaption: {
    fontSize: Typography.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  budgetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  budgetEditButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs + 2,
    borderRadius: BorderRadius.full,
  },
  budgetEditText: {
    fontSize: Typography.xs,
    fontWeight: '700',
  },
  budgetPeriodPicker: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: BorderRadius.md,
    gap: 3,
    marginBottom: Spacing.sm,
  },
  budgetPeriodButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
    borderRadius: BorderRadius.sm,
  },
  budgetPeriodText: {
    fontSize: Typography.xs,
    fontWeight: '700',
  },
  budgetPeriodHint: {
    fontSize: Typography.xs,
    marginBottom: Spacing.sm,
  },
  budgetAmount: {
    fontSize: Typography.lg,
    fontWeight: '800',
    marginTop: 2,
  },
  percentageBadge: {
    fontSize: Typography.sm,
    fontWeight: '700',
  },
  progressBarTrack: {
    height: 8,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: BorderRadius.full,
  },
  overBudgetWarning: {
    fontSize: Typography.xs,
    fontWeight: '600',
    marginTop: Spacing.xs,
  },
  barChartContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    overflow: 'hidden',
  },
  trendCharts: {
    gap: Spacing.md,
  },
  trendSeries: {
    gap: Spacing.xs,
  },
  trendSeriesHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.xs,
  },
  trendLegendDot: {
    width: 8,
    height: 8,
    borderRadius: BorderRadius.full,
  },
  trendSeriesTitle: {
    fontSize: Typography.xs,
    fontWeight: '700',
  },
  emptyChartContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xl,
    gap: Spacing.xs,
  },
  emptyChartText: {
    fontSize: Typography.sm,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyChartSubText: {
    fontSize: Typography.xs,
    textAlign: 'center',
  },
  typeToggleContainer: {
    flexDirection: 'row',
    borderRadius: BorderRadius.md,
    padding: 3,
    gap: 3,
    marginBottom: Spacing.md,
  },
  typeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  typeTabText: {
    fontSize: Typography.xs,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: Typography.md,
    fontWeight: '700',
  },
  pieContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
  },
  listHeaderTitle: {
    fontSize: Typography.xs,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    gap: Spacing.sm,
  },
  emptyText: {
    fontSize: Typography.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  categoryItem: {
    marginBottom: Spacing.md,
  },
  categoryHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  categoryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryName: {
    fontSize: Typography.sm,
    fontWeight: '600',
  },
  categoryRight: {
    alignItems: 'flex-end',
  },
  categoryAmount: {
    fontSize: Typography.sm,
    fontWeight: '700',
  },
  categoryPercent: {
    fontSize: Typography.xs,
  },
  itemBarTrack: {
    height: 6,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  itemBarFill: {
    height: '100%',
    borderRadius: BorderRadius.full,
  },
  accountsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  accountChip: {
    flex: 1,
    minWidth: '45%',
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    gap: 2,
  },
  accountChipName: {
    fontSize: Typography.xs,
    fontWeight: '600',
  },
  accountChipAmount: {
    fontSize: Typography.sm,
    fontWeight: '800',
  },
  accountChipPercent: {
    fontSize: 10,
  },
});
