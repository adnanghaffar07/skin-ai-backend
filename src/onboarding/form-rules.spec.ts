import {
  assertFormTexts,
  assertOnboardingForm,
  type FormQuestion,
} from './form-rules.js';

const questions: FormQuestion[] = [
  {
    key: 'age_range',
    required: true,
    selectionMode: 'single',
    minSelections: 1,
    maxSelections: 1,
    allowedCodes: ['age_25_34'],
  },
  {
    key: 'product_interests',
    required: true,
    selectionMode: 'multi',
    minSelections: 1,
    maxSelections: null,
    allowedCodes: ['serums', 'recommend_for_me'],
  },
];

describe('assertOnboardingForm', () => {
  it('accepts one complete form', () => {
    expect(
      assertOnboardingForm(questions, [
        { question_key: 'age_range', option_codes: ['age_25_34'] },
        { question_key: 'product_interests', option_codes: ['serums'] },
      ]),
    ).toEqual({
      age_range: ['age_25_34'],
      product_interests: ['serums'],
    });
  });

  it('rejects a form that skips a screen', () => {
    expect(() =>
      assertOnboardingForm(questions, [
        { question_key: 'age_range', option_codes: ['age_25_34'] },
      ]),
    ).toThrow(/every required question/);
  });

  it('rejects recommend_for_me mixed with another product', () => {
    expect(() =>
      assertOnboardingForm(questions, [
        { question_key: 'age_range', option_codes: ['age_25_34'] },
        {
          question_key: 'product_interests',
          option_codes: ['recommend_for_me', 'serums'],
        },
      ]),
    ).toThrow(/recommend_for_me/);
  });

  it('accepts a form that skips an optional screen', () => {
    const withOptional = [questions[0], { ...questions[1], required: false }];
    expect(
      assertOnboardingForm(withOptional, [
        { question_key: 'age_range', option_codes: ['age_25_34'] },
      ]),
    ).toEqual({ age_range: ['age_25_34'] });
  });
});

describe('assertFormTexts', () => {
  it('keeps trimmed reaction details on a yes answer', () => {
    expect(
      assertFormTexts([
        {
          question_key: 'reaction_history',
          option_codes: ['knows_ingredient'],
          text_value: '  Retinol serum ',
        },
      ]),
    ).toEqual({ reaction_history: 'Retinol serum' });
  });

  it('treats blank details as no details', () => {
    expect(
      assertFormTexts([
        {
          question_key: 'reaction_history',
          option_codes: ['no_known_reactions'],
          text_value: '   ',
        },
      ]),
    ).toEqual({});
  });

  it('rejects details when no reaction was reported', () => {
    expect(() =>
      assertFormTexts([
        {
          question_key: 'reaction_history',
          option_codes: ['no_known_reactions'],
          text_value: 'Retinol',
        },
      ]),
    ).toThrow(/reaction is reported/);
  });

  it('rejects details on any other question', () => {
    expect(() =>
      assertFormTexts([
        {
          question_key: 'age_range',
          option_codes: ['age_25_34'],
          text_value: 'hello',
        },
      ]),
    ).toThrow(/reaction is reported/);
  });
});
