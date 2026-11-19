/**
 * Which avoid-list codes an ingredient falls under, from its name. Products found online carry only an ingredient list,
 * so this is how Clara knows a product contains fragrance, retinoids or essential oils.
 * Deliberately broad: a false "contains fragrance" only hides a product, a missed one could show it to someone who reacts.
 */
const RULES: { code: string; pattern: RegExp }[] = [
  { code: 'fragrance', pattern: /\b(parfum|fragrance|perfume|aroma)\b/i },
  { code: 'retinol', pattern: /\b(retinol|retinal|retinaldehyde|retinyl|retinoate|tretinoin|adapalene)\b/i },
  {
    code: 'essential_oils',
    pattern:
      /\b(essential oil|lavandula|lavender oil|tea tree|melaleuca|eucalyptus|peppermint|mentha|citrus aurantium|citrus limon|lemon peel oil|bergamot|rosmarinus|rosemary oil|ylang|geranium oil|clove oil|cinnamon oil)\b/i,
  },
];

export function restrictionCodesFor(ingredient: string): string[] {
  return RULES.filter((rule) => rule.pattern.test(ingredient)).map((rule) => rule.code);
}

/** Every avoid-list code a list of ingredients triggers, without repeats. */
export function restrictionCodesForAll(ingredients: string[]): string[] {
  return [...new Set(ingredients.flatMap(restrictionCodesFor))].sort();
}
