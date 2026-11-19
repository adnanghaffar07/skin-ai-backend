/**
 * Clara's selling price: the store's price plus Clara's markup. Worked in whole cents and basis points so no float
 * rounding can move a price by a cent. Half a cent rounds up.
 */

/** 8.5 -> 850. Percent with up to two decimals. */
export function percentToBasisPoints(percent: number): number {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new Error(`Markup must be between 0 and 100 percent, got ${percent}.`);
  }
  return Math.round(percent * 100);
}

/** "100.00" -> 10000. Rejects anything that is not a non-negative amount with at most two decimals. */
export function toCents(amount: string | number): number {
  const text = typeof amount === 'number' ? amount.toFixed(2) : amount.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    throw new Error(`Not a valid amount: ${amount}`);
  }
  const [whole, fraction = ''] = text.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

/** 10850 -> "108.50" */
export const fromCents = (cents: number): string => `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;

/** Store price plus markup, as a decimal string. "100.00" at 850 bp -> "108.50". */
export function sellingPrice(storeAmount: string | number, markupBp: number): string {
  const cents = toCents(storeAmount);
  // Integer maths: cents × (10000 + bp) / 10000, rounding half up.
  return fromCents(Math.floor((cents * (10000 + markupBp) + 5000) / 10000));
}
