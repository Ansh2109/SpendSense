export type BudgetPeriod = 'weekly' | 'monthly' | 'yearly';

export const BUDGET_PERIOD_LABELS: Record<BudgetPeriod, string> = {
  weekly: 'Week',
  monthly: 'Month',
  yearly: 'Financial Year',
};

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getBudgetPeriodRange(
  period: BudgetPeriod,
  now = new Date()
): { start: string; end: string } {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let start: Date;
  let nextStart: Date;

  if (period === 'weekly') {
    const daysFromMonday = (today.getDay() + 6) % 7;
    start = new Date(today);
    start.setDate(today.getDate() - daysFromMonday);
    nextStart = new Date(start);
    nextStart.setDate(start.getDate() + 7);
  } else if (period === 'monthly') {
    start = new Date(today.getFullYear(), today.getMonth(), 1);
    nextStart = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  } else {
    const startYear = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
    start = new Date(startYear, 3, 1);
    nextStart = new Date(startYear + 1, 3, 1);
  }

  const end = new Date(nextStart);
  end.setDate(end.getDate() - 1);
  return { start: formatDate(start), end: formatDate(end) };
}

export function isDateInBudgetPeriod(
  date: string,
  period: BudgetPeriod,
  now = new Date()
): boolean {
  const dateOnly = date.slice(0, 10);
  const range = getBudgetPeriodRange(period, now);
  return dateOnly >= range.start && dateOnly <= range.end;
}
