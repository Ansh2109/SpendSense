import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BorderRadius, Spacing, Typography } from '../constants/theme';
import { useAppTheme } from '../context/ThemeContext';
import { BudgetPeriod, BUDGET_PERIOD_LABELS } from '../utils/budgetPeriod';
import { paiseToRupees, rupeesToPaise } from '../utils/money';

interface BudgetEditorModalProps {
  visible: boolean;
  initialPeriod: BudgetPeriod;
  limits: Record<BudgetPeriod, number>;
  onClose: () => void;
  onSave: (period: BudgetPeriod, limitPaise: number) => void;
}

const PERIODS: BudgetPeriod[] = ['weekly', 'monthly', 'yearly'];

export function BudgetEditorModal({
  visible,
  initialPeriod,
  limits,
  onClose,
  onSave,
}: BudgetEditorModalProps) {
  const { colors } = useAppTheme();
  const [period, setPeriod] = useState<BudgetPeriod>(initialPeriod);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) {
      setPeriod(initialPeriod);
      const currentLimit = limits[initialPeriod];
      setAmount(currentLimit > 0 ? String(paiseToRupees(currentLimit)) : '');
      setError('');
    }
  }, [initialPeriod, limits, visible]);

  const selectPeriod = (nextPeriod: BudgetPeriod) => {
    setPeriod(nextPeriod);
    const nextLimit = limits[nextPeriod];
    setAmount(nextLimit > 0 ? String(paiseToRupees(nextLimit)) : '');
    setError('');
  };

  const handleSave = () => {
    const normalized = amount.trim();
    if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
      setError('Enter an amount with up to 2 decimal places.');
      return;
    }
    const limitPaise = rupeesToPaise(Number(normalized));
    if (!Number.isSafeInteger(limitPaise) || limitPaise <= 0) {
      setError('Your limit must be greater than ₹0.');
      return;
    }
    onSave(period, limitPaise);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={(event) => event.stopPropagation()}
        >
          <View style={styles.header}>
            <View style={[styles.iconCircle, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="wallet-outline" size={22} color={colors.primary} />
            </View>
            <TouchableOpacity onPress={onClose} accessibilityLabel="Close budget editor">
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <Text style={[styles.title, { color: colors.text }]}>Set a spending limit</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Choose a period and set how much you want to spend.
          </Text>

          <View style={[styles.periodPicker, { backgroundColor: colors.surfaceElevated }]}>
            {PERIODS.map((option) => {
              const selected = period === option;
              return (
                <TouchableOpacity
                  key={option}
                  style={[
                    styles.periodButton,
                    selected && { backgroundColor: colors.primary },
                  ]}
                  onPress={() => selectPeriod(option)}
                >
                  <Text style={[styles.periodText, { color: selected ? '#FFFFFF' : colors.textSecondary }]}>
                    {BUDGET_PERIOD_LABELS[option]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {period === 'yearly' && (
            <Text style={[styles.periodHint, { color: colors.textSecondary }]}>
              Financial year runs from April through March.
            </Text>
          )}

          <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
            {BUDGET_PERIOD_LABELS[period].toUpperCase()} LIMIT
          </Text>
          <View style={[styles.inputBox, { backgroundColor: colors.surfaceElevated, borderColor: error ? colors.expense : colors.border }]}>
            <Text style={[styles.currency, { color: colors.textSecondary }]}>₹</Text>
            <TextInput
              value={amount}
              onChangeText={(value) => {
                setAmount(value.replace(/[^\d.]/g, ''));
                setError('');
              }}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, { color: colors.text }]}
              accessibilityLabel={`${BUDGET_PERIOD_LABELS[period]} spending limit`}
            />
          </View>
          {error ? <Text style={[styles.error, { color: colors.expense }]}>{error}</Text> : null}

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.cancelButton, { backgroundColor: colors.surfaceElevated }]}
              onPress={onClose}
            >
              <Text style={[styles.cancelText, { color: colors.text }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveButton, { backgroundColor: colors.primary }]}
              onPress={handleSave}
            >
              <Ionicons name="checkmark" size={18} color="#FFFFFF" />
              <Text style={styles.saveText}>Save limit</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  card: {
    borderWidth: 1,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  iconCircle: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.full,
  },
  title: {
    fontSize: Typography.xl,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: Typography.sm,
    lineHeight: 19,
    marginTop: Spacing.xs,
  },
  periodPicker: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: BorderRadius.md,
    gap: 3,
    marginTop: Spacing.lg,
  },
  periodButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 38,
    borderRadius: BorderRadius.sm,
  },
  periodText: {
    fontSize: Typography.xs,
    fontWeight: '700',
  },
  periodHint: {
    fontSize: Typography.xs,
    marginTop: Spacing.xs,
  },
  inputLabel: {
    fontSize: Typography.xs,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: Spacing.lg,
    marginBottom: Spacing.xs,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
  },
  currency: {
    fontSize: Typography.lg,
    fontWeight: '700',
  },
  input: {
    flex: 1,
    fontSize: Typography.lg,
    fontWeight: '700',
    paddingVertical: Spacing.sm,
    marginLeft: Spacing.sm,
  },
  error: {
    fontSize: Typography.xs,
    marginTop: Spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  cancelButton: {
    flex: 1,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.md,
  },
  cancelText: {
    fontSize: Typography.sm,
    fontWeight: '700',
  },
  saveButton: {
    flex: 1.3,
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    borderRadius: BorderRadius.md,
  },
  saveText: {
    color: '#FFFFFF',
    fontSize: Typography.sm,
    fontWeight: '700',
  },
});
