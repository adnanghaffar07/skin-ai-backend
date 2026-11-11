import { assertOnboardingForm, type FormQuestion } from './form-rules.js';

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
});
