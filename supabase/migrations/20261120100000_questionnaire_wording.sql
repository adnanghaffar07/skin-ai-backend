-- Question 7 and the Question 10 answers now use the wording of the approved questionnaire document.
-- Option codes are unchanged, so saved answers are unaffected.

update public.questionnaire_questions q
set prompt = 'Have you experienced reactions to skincare ingredients or products?'
from public.questionnaire_definitions d
where d.id = q.definition_id
  and d.key = 'onboarding'
  and d.status = 'active'
  and q.key = 'reaction_history';

update public.questionnaire_options o
set label = case o.code
  when 'start_scan' then 'Yes, scan my skin'
  when 'continue_without_scan' then 'Not now — continue without a photo'
end
from public.questionnaire_questions q
join public.questionnaire_definitions d on d.id = q.definition_id
where o.question_id = q.id
  and d.key = 'onboarding'
  and d.status = 'active'
  and q.key = 'face_scan_opt_in'
  and o.code in ('start_scan', 'continue_without_scan');
