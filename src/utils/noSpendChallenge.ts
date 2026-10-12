import { getLocalDateOnly, parseDateOnly, toDateOnly } from './date';

export type NoSpendChallengeGoal = 1 | 2 | 3;

export interface NoSpendChallenge {
  goalDays: NoSpendChallengeGoal;
  startedOn: string;
  startedAt?: number;
}

export function hasNoSpendChallengeBeenLost(
  challenge: NoSpendChallenge,
  transactions: { type: string; date: string; createdAt?: number }[],
  now = new Date()
): boolean {
  const today = toDateOnly(now);
  return transactions.some((transaction) => {
    if (transaction.type !== 'expense') return false;
    const expenseDate = getLocalDateOnly(transaction.date);
    if (expenseDate < challenge.startedOn || expenseDate > today) return false;
    if (expenseDate > challenge.startedOn || challenge.startedAt === undefined) return true;
    return transaction.createdAt !== undefined && transaction.createdAt >= challenge.startedAt;
  });
}

export function getConsecutiveNoSpendDays(
  challenge: NoSpendChallenge,
  transactions: { type: string; date: string }[],
  now = new Date()
): number {
  const today = toDateOnly(now);
  if (challenge.startedOn > today) return 0;

  const expenseDates = new Set(
    transactions
      .filter((transaction) => transaction.type === 'expense')
      .map((transaction) => getLocalDateOnly(transaction.date))
  );

  if (expenseDates.has(today)) return 0;

  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  let streak = 0;
  while (toDateOnly(date) >= challenge.startedOn) {
    if (expenseDates.has(toDateOnly(date))) break;
    streak += 1;
    date.setDate(date.getDate() - 1);
  }
  return streak;
}

export function parseNoSpendChallenge(value: string | null): NoSpendChallenge | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<NoSpendChallenge>;
    if (
      (parsed.goalDays === 1 || parsed.goalDays === 2 || parsed.goalDays === 3) &&
      typeof parsed.startedOn === 'string' &&
      parseDateOnly(parsed.startedOn) !== null
    ) {
      return {
        goalDays: parsed.goalDays,
        startedOn: parsed.startedOn,
        ...(typeof parsed.startedAt === 'number' ? { startedAt: parsed.startedAt } : {}),
      };
    }
  } catch (error) {
    console.error('Failed to read no-spend challenge:', error);
  }
  return null;
}
