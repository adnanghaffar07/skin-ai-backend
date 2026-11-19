/**
 * Fitting a routine to the monthly budget the person gave in the questionnaire (Q8).
 *
 * The budget is for the whole routine per month, compared with Clara's price (store price plus markup), since that is
 * what the person pays. Pure functions, no database.
 */

/** Monthly ceiling per budget answer, in the market currency. No entry means no ceiling. */
export const BUDGET_CEILING: Record<string, number> = {
  under_20: 20,
  '20_50': 50,
  '50_100': 100,
};

/** Optional steps, dropped in this order when even the cheapest choices do not fit. Other categories are never dropped. */
export const DROP_ORDER = ['exfoliants', 'serums'];

export const ceilingFor = (band: string | null | undefined): number | null => (band ? (BUDGET_CEILING[band] ?? null) : null);

export interface Priced {
  category_code: string;
  amount: number;
}

export interface BudgetFit<T extends Priced> {
  /** One product per category that is kept, in the order of `categories`. */
  picks: T[];
  total: number;
  /** True when even the cheapest essential products cost more than the budget. */
  over: boolean;
  /** Categories left out to stay within budget. */
  dropped: string[];
}

const cents = (amount: number) => Math.round(amount * 100);

/**
 * Picks one product per category so the total fits the ceiling, giving up as little fit as possible.
 * `options` lists each category's eligible products best first. Starting from the best of each, it repeatedly makes the
 * swap that saves the most money per place given up in the ranking, then drops optional steps if it still does not fit.
 */
export function fitToBudget<T extends Priced>(options: Map<string, T[]>, categories: string[], ceiling: number | null): BudgetFit<T> {
  const lists = categories.filter((category) => (options.get(category) ?? []).length > 0).map((category) => ({ category, list: options.get(category) as T[] }));
  const index = new Map(lists.map(({ category }) => [category, 0]));
  const kept = new Set(lists.map(({ category }) => category));
  const pick = (category: string) => (options.get(category) as T[])[index.get(category) as number];
  const total = () => [...kept].reduce((sum, category) => sum + cents(pick(category).amount), 0);

  if (ceiling !== null) {
    const limit = cents(ceiling);
    while (total() > limit) {
      let best: { category: string; to: number; value: number } | null = null;
      for (const category of kept) {
        const list = options.get(category) as T[];
        const from = index.get(category) as number;
        const current = cents(list[from].amount);
        // The best-ranked cheaper option further down this category's list.
        const to = list.findIndex((item, i) => i > from && cents(item.amount) < current);
        if (to === -1) {
          continue;
        }
        const value = (current - cents(list[to].amount)) / (to - from);
        if (!best || value > best.value) {
          best = { category, to, value };
        }
      }
      if (best) {
        index.set(best.category, best.to);
        continue;
      }
      const drop = DROP_ORDER.find((category) => kept.has(category));
      if (!drop) {
        break;
      }
      kept.delete(drop);
    }
  }

  const picks = lists.filter(({ category }) => kept.has(category)).map(({ category }) => pick(category));
  const sum = picks.reduce((acc, item) => acc + cents(item.amount), 0);
  return {
    picks,
    total: sum / 100,
    over: ceiling !== null && sum > cents(ceiling),
    dropped: lists.filter(({ category }) => !kept.has(category)).map(({ category }) => category),
  };
}
