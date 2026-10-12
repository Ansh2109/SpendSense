import { create } from 'zustand';
import {
  transactionRepository,
  categoryRepository,
  accountRepository,
  limitRepository,
  noteRepository,
  taskRepository,
} from '../db/repositories';
import { TransactionWithDetails } from '../db/repositories/transactionRepository';
import { Category, Account, InsertTransaction } from '../db/schema';
import { rupeesToPaise } from '../utils/money';
import { BudgetPeriod } from '../utils/budgetPeriod';
import { SETTING_KEYS, settingsRepository } from '../db/repositories/settingsRepository';

type BudgetLimits = Record<BudgetPeriod, number>;

interface AppState {
  transactions: TransactionWithDetails[];
  categories: Category[];
  accounts: Account[];
  budgetPeriod: BudgetPeriod;
  budgetLimits: BudgetLimits;
  isLoading: boolean;

  // Actions
  refreshAll: () => void;
  addTransaction: (tx: InsertTransaction) => void;
  updateTransaction: (id: number, tx: Partial<InsertTransaction>) => void;
  deleteTransaction: (id: number) => void;
  setBudgetPeriod: (period: BudgetPeriod) => void;
  setBudget: (period: BudgetPeriod, limitPaise: number) => boolean;
  resetAllData: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  transactions: [],
  categories: [],
  accounts: [],
  budgetPeriod: 'monthly',
  budgetLimits: { weekly: 0, monthly: 200000, yearly: 0 },
  isLoading: true,

  refreshAll: () => {
    try {
      const allTx = transactionRepository.getAll();
      const allCats = categoryRepository.getAll();
      const allAccs = accountRepository.getAll();
      const savedPeriod = settingsRepository.get(SETTING_KEYS.budgetPeriod);
      const budgetPeriod: BudgetPeriod =
        savedPeriod === 'weekly' || savedPeriod === 'yearly' ? savedPeriod : 'monthly';
      if (!savedPeriod) settingsRepository.set(SETTING_KEYS.budgetPeriod, budgetPeriod);

      let monthlyLimit = limitRepository.getOverallLimit('monthly');
      if (!monthlyLimit) monthlyLimit = limitRepository.setOverallLimit('monthly', rupeesToPaise(2000));
      const budgetLimits: BudgetLimits = {
        weekly: limitRepository.getOverallLimit('weekly')?.limitPaise ?? 0,
        monthly: monthlyLimit.limitPaise,
        yearly: limitRepository.getOverallLimit('yearly')?.limitPaise ?? 0,
      };

      set({
        transactions: allTx,
        categories: allCats,
        accounts: allAccs,
        budgetPeriod,
        budgetLimits,
        isLoading: false,
      });
    } catch (err) {
      console.error('Error refreshing app store:', err);
      set({ isLoading: false });
    }
  },

  addTransaction: (tx: InsertTransaction) => {
    try {
      transactionRepository.add(tx);
      get().refreshAll();
    } catch (err) {
      console.error('Failed to add transaction in store:', err);
    }
  },

  updateTransaction: (id: number, tx: Partial<InsertTransaction>) => {
    try {
      transactionRepository.update(id, tx);
      get().refreshAll();
    } catch (err) {
      console.error('Failed to update transaction in store:', err);
    }
  },

  deleteTransaction: (id: number) => {
    try {
      transactionRepository.delete(id);
      get().refreshAll();
    } catch (err) {
      console.error('Failed to delete transaction in store:', err);
    }
  },

  setBudgetPeriod: (period: BudgetPeriod) => {
    try {
      settingsRepository.set(SETTING_KEYS.budgetPeriod, period);
      set({ budgetPeriod: period });
    } catch (err) {
      console.error('Failed to set budget period in store:', err);
    }
  },

  setBudget: (period: BudgetPeriod, limitPaise: number) => {
    try {
      limitRepository.setOverallLimit(period, limitPaise);
      settingsRepository.set(SETTING_KEYS.budgetPeriod, period);
      set((state) => ({
        budgetPeriod: period,
        budgetLimits: { ...state.budgetLimits, [period]: limitPaise },
      }));
      return true;
    } catch (err) {
      console.error('Failed to set budget limit in store:', err);
      return false;
    }
  },

  resetAllData: () => {
    try {
      transactionRepository.clearAll();
      taskRepository.clearAll();
      noteRepository.clearAll();
      limitRepository.clearAll();
      limitRepository.setOverallLimit('monthly', rupeesToPaise(2000));
      settingsRepository.set(SETTING_KEYS.budgetPeriod, 'monthly');
      settingsRepository.set(SETTING_KEYS.noSpendChallenge, '');
      get().refreshAll();
    } catch (err) {
      console.error('Failed to reset all data:', err);
    }
  },
}));
