-- QA bug: the age bands read "25-34" and "34-44", so age 34 appears twice. The code stays age_34_44 so saved answers are unaffected.
update public.questionnaire_options
set label = '35-44'
where code = 'age_34_44' and label = '34-44';
