-- Brings the active onboarding questionnaire in line with the approved 10-question document.
-- Saved answers are unaffected: no option is removed and no code changes.

-- Question 3 gains the "None / General maintenance" answer.
insert into public.questionnaire_options (question_id, code, label, position)
select q.id, 'none_general_maintenance', 'None / General maintenance', 7
from public.questionnaire_questions q
join public.questionnaire_definitions d on d.id = q.definition_id
where d.key = 'onboarding' and d.status = 'active' and q.key = 'skin_concerns'
on conflict (question_id, code) do nothing;

-- Nonessential questions can be skipped. Age stays required because it decides the under-18 safeguards,
-- and the scan choice stays required because the app always sends it.
update public.questionnaire_questions q
set required = false
from public.questionnaire_definitions d
where d.id = q.definition_id
  and d.key = 'onboarding'
  and d.status = 'active'
  and q.key not in ('age_range', 'face_scan_opt_in');

-- Question 9 was showing the document's internal "Purpose:" note to customers.
update public.questionnaire_questions q
set help_text = 'Select all that apply.'
from public.questionnaire_definitions d
where d.id = q.definition_id
  and d.key = 'onboarding'
  and d.status = 'active'
  and q.key = 'product_interests';
