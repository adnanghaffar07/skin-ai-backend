import { assertAnswerCodes } from './answer-rules.js';

const productInterests = {
  key: 'product_interests',
  selectionMode: 'multi',
  minSelections: 1,
  maxSelections: null,
  allowedCodes: [
    'cleansers',
    'moisturizers',
    'serums',
    'sunscreens',
    'exfoliants',
    'recommend_for_me',
  ],
};

describe('assertAnswerCodes', () => {
  it('accepts recommend_for_me on its own', () => {
    expect(() =>
      assertAnswerCodes(productInterests, ['recommend_for_me']),
    ).not.toThrow();
  });

  it('rejects recommend_for_me mixed with another product type', () => {
    expect(() =>
      assertAnswerCodes(productInterests, ['recommend_for_me', 'serums']),
    ).toThrow(/recommend_for_me/);
  });

  it('rejects a code that is not on this version', () => {
    expect(() => assertAnswerCodes(productInterests, ['toner'])).toThrow(
      /not on this questionnaire version/,
    );
  });

  it('requires one code for a single-select question', () => {
    expect(() =>
      assertAnswerCodes(
        {
          key: 'age_range',
          selectionMode: 'single',
          minSelections: 1,
          maxSelections: 1,
          allowedCodes: ['under_18', 'age_25_34'],
        },
        ['under_18', 'age_25_34'],
      ),
    ).toThrow(/Choose one option/);
  });
});
