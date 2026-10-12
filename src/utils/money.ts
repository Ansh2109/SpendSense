/**
 * Money utilities for SpendSense (India).
 *
 * CRITICAL RULE (from AGENTS.md):
 * - Always store and calculate money in INTEGER PAISE (1 Rupee = 100 Paise).
 * - Never use floating point numbers for stored money or totals.
 * - Decimal conversions happen ONLY during user input and UI rendering.
 */

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/**
 * Converts a rupee decimal string or number (e.g., "50.75" or 50.75) into integer paise (e.g., 5075).
 * Safely rounds to avoid JavaScript floating point errors (e.g. 50.75 * 100 = 5074.9999999).
 */
export function rupeesToPaise(rupees: number | string): number {
  if (typeof rupees === 'string') {
    const cleaned = rupees.trim().replace(/,/g, '');
    const parsed = parseFloat(cleaned);
    if (isNaN(parsed)) return 0;
    return Math.round(parsed * 100);
  }
  return Math.round(rupees * 100);
}

/**
 * Converts integer paise into a rupee number for calculations or input displays.
 * e.g., 5075 -> 50.75
 */
export function paiseToRupees(paise: number): number {
  return paise / 100;
}

/**
 * Formats integer paise into an Indian Rupee string with the ₹ symbol and lakh/crore commas.
 * e.g., 10000000 paise -> ₹1,00,000
 * e.g., 5075 paise -> ₹50.75
 */
export function formatPaiseToINR(paise: number, showSign = false): string {
  const rupees = paise / 100;
  const formatted = inrFormatter.format(Math.abs(rupees));

  if (showSign) {
    if (paise > 0) return `+${formatted}`;
    if (paise < 0) return `-${formatted}`;
  }
  return formatted;
}
