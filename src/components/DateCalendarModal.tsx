import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../context/ThemeContext';
import { BorderRadius, Spacing, Typography } from '../constants/theme';
import { parseDateOnly, toDateOnly } from '../utils/date';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface DateCalendarModalProps {
  visible: boolean;
  selectedDate: string;
  onSelect: (dateStr: string) => void;
  onClose: () => void;
  allowClear?: boolean;
  onClear?: () => void;
}

export function DateCalendarModal({
  visible,
  selectedDate,
  onSelect,
  onClose,
  allowClear,
  onClear,
}: DateCalendarModalProps) {
  const { colors } = useAppTheme();
  const today = new Date();
  const parsed = parseDateOnly(selectedDate);
  const [viewYear, setViewYear] = useState(parsed?.getFullYear() ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsed?.getMonth() ?? today.getMonth());

  useEffect(() => {
    if (!visible) return;
    const next = parseDateOnly(selectedDate) ?? new Date();
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  }, [visible, selectedDate]);

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const startDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
  const todayKey = toDateOnly(today);

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleSelectDay = (day: number) => {
    const formatted = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    onSelect(formatted);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={[styles.card, { backgroundColor: colors.surface }]} onStartShouldSetResponder={() => true}>
          <View style={styles.headerRow}>
            <TouchableOpacity style={styles.navBtn} onPress={handlePrevMonth}>
              <Ionicons name="chevron-back" size={20} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: colors.text }]}>
              {MONTH_NAMES[viewMonth]} {viewYear}
            </Text>
            <TouchableOpacity style={styles.navBtn} onPress={handleNextMonth}>
              <Ionicons name="chevron-forward" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.shortcutsRow}>
            <TouchableOpacity
              style={[styles.shortcutBtn, { backgroundColor: colors.surfaceElevated }]}
              onPress={() => {
                onSelect(todayKey);
                onClose();
              }}
            >
              <Text style={[styles.shortcutText, { color: colors.primary }]}>Today</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.shortcutBtn, { backgroundColor: colors.surfaceElevated }]}
              onPress={() => {
                const y = new Date();
                y.setDate(y.getDate() + 1);
                onSelect(toDateOnly(y));
                onClose();
              }}
            >
              <Text style={[styles.shortcutText, { color: colors.textSecondary }]}>Tomorrow</Text>
            </TouchableOpacity>
            {allowClear ? (
              <TouchableOpacity
                style={[styles.shortcutBtn, { backgroundColor: colors.surfaceElevated }]}
                onPress={() => {
                  onClear?.();
                  onClose();
                }}
              >
                <Text style={[styles.shortcutText, { color: colors.textSecondary }]}>No date</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.weekdaysRow}>
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((w) => (
              <Text key={w} style={[styles.weekdayText, { color: colors.textMuted }]}>
                {w}
              </Text>
            ))}
          </View>

          <View style={styles.daysGrid}>
            {Array.from({ length: startDayOfWeek }).map((_, idx) => (
              <View key={`empty-${idx}`} style={styles.dayCell} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, idx) => {
              const dayNum = idx + 1;
              const dateKey = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
              const isSelected = selectedDate === dateKey;
              const isToday = todayKey === dateKey;

              return (
                <TouchableOpacity
                  key={`day-${dayNum}`}
                  style={[
                    styles.dayCell,
                    isSelected && { backgroundColor: colors.primary, borderRadius: BorderRadius.full },
                    !isSelected && isToday && { borderWidth: 1, borderColor: colors.primary, borderRadius: BorderRadius.full },
                  ]}
                  onPress={() => handleSelectDay(dayNum)}
                >
                  <Text
                    style={[
                      styles.dayText,
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

          <TouchableOpacity style={[styles.closeBtn, { backgroundColor: colors.surfaceElevated }]} onPress={onClose}>
            <Text style={[styles.closeText, { color: colors.text }]}>Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.md,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  headerTitle: {
    fontSize: Typography.md,
    fontWeight: '700',
  },
  navBtn: {
    padding: Spacing.xs,
  },
  shortcutsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  shortcutBtn: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.full,
  },
  shortcutText: {
    fontSize: Typography.xs,
    fontWeight: '700',
  },
  weekdaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
    paddingHorizontal: 4,
  },
  weekdayText: {
    width: 38,
    textAlign: 'center',
    fontSize: Typography.xs,
    fontWeight: '600',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.28%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayText: {
    fontSize: Typography.sm,
    fontWeight: '500',
  },
  closeBtn: {
    marginTop: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  closeText: {
    fontSize: Typography.sm,
    fontWeight: '700',
  },
});
