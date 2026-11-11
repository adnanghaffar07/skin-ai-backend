-- Reference data applied to Supabase project skin-ai.
-- Question 4 uses the corrected labels. Question 7 omits the copied fine-lines option.
-- No sample products and no skin assessments.
-- Re-running this file fails on the unique keys, which is intentional.

insert into public.product_categories (code, name, position) values
  ('cleansers', 'Cleansers', 1),
  ('moisturizers', 'Moisturizers', 2),
  ('serums', 'Serums', 3),
  ('sunscreens', 'Sunscreens', 4),
  ('exfoliants', 'Exfoliants', 5);

do $$
declare
  def_id uuid;
  q_id uuid;
begin
  insert into public.questionnaire_definitions (key, version, status, locale, title)
  values ('onboarding', 1, 'active', 'en', 'Onboarding')
  returning id into def_id;

  insert into public.questionnaire_questions (definition_id, key, position, prompt, help_text, selection_mode, required, min_selections, max_selections)
  values (def_id, 'age_range', 1, 'What is your age range?', 'Beautiful skin has no age. Let''s find care for your stage of life.', 'single', true, 1, 1)
  returning id into q_id;
  insert into public.questionnaire_options (question_id, code, label, position) values
    (q_id, 'under_18', 'Under 18', 1),
    (q_id, 'age_18_24', '18-24', 2),
    (q_id, 'age_25_34', '25-34', 3),
    (q_id, 'age_34_44', '34-44', 4),
    (q_id, 'age_45_54', '45-54', 5),
    (q_id, 'age_55_plus', '55+', 6);

  insert into public.questionnaire_questions (definition_id, key, position, prompt, help_text, selection_mode, required, min_selections, max_selections)
  values (def_id, 'skin_type', 2, 'How would you describe your skin?', 'Think about how your skin feels on a typical day.', 'single', true, 1, 1)
  returning id into q_id;
  insert into public.questionnaire_options (question_id, code, label, position) values
    (q_id, 'oily', 'Oily', 1),
    (q_id, 'dry', 'Dry', 2),
    (q_id, 'combination', 'Combination', 3),
    (q_id, 'normal', 'Normal / Balanced', 4),
    (q_id, 'not_sure', 'Not sure', 5);

  insert into public.questionnaire_questions (definition_id, key, position, prompt, help_text, selection_mode, required, min_selections, max_selections)
  values (def_id, 'skin_concerns', 3, 'What are your main skin concerns?', 'Choose everything that feels relevant to you.', 'multi', true, 1, null)
  returning id into q_id;
  insert into public.questionnaire_options (question_id, code, label, position) values
    (q_id, 'acne_breakouts', 'Acne & breakouts', 1),
    (q_id, 'dark_spots', 'Dark spots / pigmentation', 2),
    (q_id, 'dryness_dehydration', 'Dryness & dehydration', 3),
    (q_id, 'fine_lines', 'Fine lines & wrinkles', 4),
    (q_id, 'redness_sensitivity', 'Redness & sensitivity', 5),
    (q_id, 'uneven_texture', 'Uneven texture', 6);

  insert into public.questionnaire_questions (definition_id, key, position, prompt, help_text, selection_mode, required, min_selections, max_selections)
  values (def_id, 'sensitivity_level', 4, 'How sensitive is your skin?', 'A gentler approach starts with understanding your skin.', 'single', true, 1, 1)
  returning id into q_id;
  insert into public.questionnaire_options (question_id, code, label, position) values
    (q_id, 'very_sensitive', 'Very sensitive', 1),
    (q_id, 'sometimes_sensitive', 'Sometimes sensitive', 2),
    (q_id, 'rarely_sensitive', 'Rarely sensitive', 3),
    (q_id, 'not_sure', 'Not sure', 4);

  insert into public.questionnaire_questions (definition_id, key, position, prompt, help_text, selection_mode, required, min_selections, max_selections)
  values (def_id, 'primary_goal', 5, 'What is your main skincare goal?', 'One intention. A routine that feels like you.', 'single', true, 1, 1)
  returning id into q_id;
  insert into public.questionnaire_options (question_id, code, label, position) values
    (q_id, 'reduce_breakouts', 'Reduce breakouts', 1),
    (q_id, 'improve_hydration', 'Improve skin hydration', 2),
    (q_id, 'improve_dark_spots', 'Improve appearance of dark spots', 3),
    (q_id, 'reduce_fine_lines', 'Reduce appearance of fine lines', 4),
    (q_id, 'build_daily_routine', 'Build a healthy daily routine', 5),
    (q_id, 'maintain_current_skin', 'Maintain my current skin', 6);

  insert into public.questionnaire_questions (definition_id, key, position, prompt, help_text, selection_mode, required, min_selections, max_selections)
  values (def_id, 'current_routine', 6, 'What is your current skincare routine?', 'Starting fresh or refining your ritual? Both are beautiful.', 'single', true, 1, 1)
  returning id into q_id;
  insert into public.questionnaire_options (question_id, code, label, position) values
    (q_id, 'none', 'I don''t have a routine', 1),
    (q_id, 'cleanser_only', 'Only cleanser or face wash', 2),
    (q_id, 'cleanser_moisturizer', 'Cleanser + moisturizer', 3),
    (q_id, 'cleanser_moisturizer_spf', 'Cleanser + moisturizer + sunscreen', 4),
    (q_id, 'multi_product', 'I use multiple skincare products', 5);

  insert into public.questionnaire_questions (definition_id, key, position, prompt, help_text, selection_mode, required, min_selections, max_selections)
  values (def_id, 'reaction_history', 7, 'Any skincare reactions?', 'Help us understand what your skin prefers to avoid.', 'single', true, 1, 1)
  returning id into q_id;
  insert into public.questionnaire_options (question_id, code, label, position) values
    (q_id, 'knows_ingredient', 'Yes, I know which ingredients/products', 1),
    (q_id, 'unknown_cause', 'Yes, but I''m not sure what caused it', 2),
    (q_id, 'no_known_reactions', 'No known reactions', 3),
    (q_id, 'not_sure', 'Not sure', 4);

  insert into public.questionnaire_questions (definition_id, key, position, prompt, help_text, selection_mode, required, min_selections, max_selections)
  values (def_id, 'monthly_budget', 8, 'How much would you like to spend on skincare per month?', 'Thoughtful skincare, at a budget that feels right.', 'single', true, 1, 1)
  returning id into q_id;
  insert into public.questionnaire_options (question_id, code, label, position) values
    (q_id, 'under_20', 'Under $20', 1),
    (q_id, '20_50', '$20–$50', 2),
    (q_id, '50_100', '$50-$100', 3),
    (q_id, '100_plus', '$100+', 4),
    (q_id, 'no_budget', 'No fixed budget', 5);

  insert into public.questionnaire_questions (definition_id, key, position, prompt, help_text, selection_mode, required, min_selections, max_selections)
  values (def_id, 'product_interests', 9, 'Which product types are you interested in?', 'Purpose: Learn shopping interests. Select all that apply.', 'multi', true, 1, null)
  returning id into q_id;
  insert into public.questionnaire_options (question_id, code, label, position) values
    (q_id, 'cleansers', 'Cleansers', 1),
    (q_id, 'moisturizers', 'Moisturizers', 2),
    (q_id, 'serums', 'Serums', 3),
    (q_id, 'sunscreens', 'Sunscreens', 4),
    (q_id, 'exfoliants', 'Exfoliants', 5),
    (q_id, 'recommend_for_me', 'Not sure — recommend for me', 6);

  insert into public.questionnaire_questions (definition_id, key, position, prompt, help_text, selection_mode, required, min_selections, max_selections)
  values (def_id, 'face_scan_opt_in', 10, 'Would you like an AI-assisted face scan?', 'Our AI will analyze your skin in seconds to give you personalized insights.', 'single', true, 1, 1)
  returning id into q_id;
  insert into public.questionnaire_options (question_id, code, label, position) values
    (q_id, 'start_scan', 'Start face scan', 1),
    (q_id, 'continue_without_scan', 'Continue without scan', 2);
end $$;
