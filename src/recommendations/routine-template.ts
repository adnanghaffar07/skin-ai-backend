import type { RankedProduct } from './ranking.js';

export interface RoutineStepDraft {
  period: 'morning' | 'evening';
  position: number;
  product_id: string;
  step_type: 'cleanse' | 'treat' | 'nourish' | 'moisturise';
  title: string;
  duration_label: string | null;
}

export const MORNING_TITLE = 'Calm and protect';
export const EVENING_TITLE = 'Repair and smooth';

const SPF_LEVELS = ['cleanser_moisturizer_spf', 'multi_product'];

type Slot = Omit<RoutineStepDraft, 'position' | 'period' | 'product_id'> & {
  category: string;
};

const MORNING: Slot[] = [
  { category: 'cleansers', step_type: 'cleanse', title: 'Cleanse', duration_label: '1 min' },
  { category: 'serums', step_type: 'treat', title: 'Treat', duration_label: null },
  { category: 'moisturizers', step_type: 'moisturise', title: 'Moisturise', duration_label: null },
  { category: 'sunscreens', step_type: 'nourish', title: 'Protect', duration_label: null },
];

const EVENING: Slot[] = [
  { category: 'cleansers', step_type: 'cleanse', title: 'Cleanse', duration_label: '1 min' },
  { category: 'exfoliants', step_type: 'treat', title: 'Smooth', duration_label: null },
  { category: 'serums', step_type: 'treat', title: 'Treat', duration_label: null },
  { category: 'moisturizers', step_type: 'moisturise', title: 'Moisturise', duration_label: null },
];

/** Steps come only from the chosen products. SPF is a morning step only for users who already use it. */
export function buildRoutineSteps(
  products: RankedProduct[],
  routineLevel: string | null,
): RoutineStepDraft[] {
  const byCategory = new Map(products.map((p) => [p.category_code, p]));
  const make = (period: 'morning' | 'evening', slots: Slot[]) =>
    slots
      .filter(
        (slot) =>
          byCategory.has(slot.category) &&
          (slot.category !== 'sunscreens' ||
            SPF_LEVELS.includes(routineLevel ?? '')),
      )
      .map((slot, index) => ({
        period,
        position: index + 1,
        product_id: (byCategory.get(slot.category) as RankedProduct).id,
        step_type: slot.step_type,
        title: slot.title,
        duration_label: slot.duration_label,
      }));
  return [...make('morning', MORNING), ...make('evening', EVENING)];
}
