# Figma to API mapping — onboarding and skin dashboard

**Date:** 2026-10-28  
**Source:** Figma page Design `30:6` in file `nZAL6KFqTYEileWQ1cCga1`.  
**Companions:** `FIGMA_SCREEN_ANALYSIS.md`, `END_TO_END_DATA_FLOW.md`, `DATABASE_DESIGN_PROPOSAL.md`, `PHASE1_API_SPECIFICATION.md`.

The client renders `label` from the API and posts `option_codes`. Labels below are the file’s text, except the two Question 4 spellings called out as proposed corrections and the Question 7 option that is omitted.

`Reading your skin` (`109:2411`) has no pre-account API. Cart, checkout, orders, wishlist, payment, and dermatologist booking have no routes in this contract.

## Onboarding

| Figma screen | Field / component | Data type | Database entity | API | AI usage |
|---|---|---|---|---|---|
| Splash `31:49` | Beauty Meets Intelligence | Display | — | — | None |
| Welcome `35:740` | See your skin. Understand your glow. | Display | — | — | None |
| Welcome | Get started | Action | `onboarding_sessions`, `questionnaire_submissions` | `POST /api/v1/onboarding/sessions` | None |
| Welcome | Already have an account? Sign in | Hidden navigation | — | Client route to Sign in | None |
| Question 1 `38:1144` | What is your age range? | Single code | `questionnaire_answers` → `skin_profiles.age_range` | `PUT /api/v1/questionnaire-submissions/:id/answers` | Constraint. `under_18` blocks face upload |
| Question 1 | Under 18 | `under_18` | `questionnaire_options` | Active questionnaire payload | Scan gate |
| Question 1 | 18-24 | `age_18_24` | `questionnaire_options` | Same | Constraint |
| Question 1 | 25-34 | `age_25_34` | `questionnaire_options` | Same | Constraint. Overlaps 34 with the next band |
| Question 1 | 34-44 | `age_34_44` | `questionnaire_options` | Same | Constraint. Overlaps 34 |
| Question 1 | 45-54 | `age_45_54` | `questionnaire_options` | Same | Constraint |
| Question 1 | 55+ | `age_55_plus` | `questionnaire_options` | Same | Constraint |
| Question 2 `39:1384` | How would you describe your skin? | Single code | `skin_profiles.self_reported_skin_type` | `PUT .../answers` | Vision context, RAG, routine. Not an observed type |
| Question 2 | Oily, Dry, Combination, Normal / Balanced, Not sure | `oily`, `dry`, `combination`, `normal`, `not_sure` | `questionnaire_options` | Questionnaire payload | `not_sure` applies no skin-type filter |
| Question 3 `39:1462` | What are your main skin concerns? | Multi codes, min 1 | `skin_profile_concerns` | `PUT .../answers` | Vision context, RAG, concern match |
| Question 3 | Acne & breakouts | `acne_breakouts` | `questionnaire_options` | Questionnaire payload | Concern match |
| Question 3 | Dark spots / pigmentation | `dark_spots` | `questionnaire_options` | Questionnaire payload | Concern match |
| Question 3 | Dryness & dehydration | `dryness_dehydration` | `questionnaire_options` | Questionnaire payload | Concern match |
| Question 3 | Fine lines & wrinkles | `fine_lines` | `questionnaire_options` | Questionnaire payload | Concern match |
| Question 3 | Redness & sensitivity | `redness_sensitivity` | `questionnaire_options` | Questionnaire payload | Concern match |
| Question 3 | Uneven texture | `uneven_texture` | `questionnaire_options` | Questionnaire payload | Concern match |
| Question 4 `40:1556` | How sensitive is your skin? | Single code | `skin_profiles.sensitivity_level` | `PUT .../answers` | Ranking caution. Not an ingredient exclusion |
| Question 4 | Very sensitive | `very_sensitive` | `questionnaire_options` | Questionnaire payload | Gentler routine |
| Question 4 | Sometime sensitive | `sometimes_sensitive` | `questionnaire_options` | Label proposed as “Sometimes sensitive” | Mild caution |
| Question 4 | Rarelr sensitive | `rarely_sensitive` | `questionnaire_options` | Label proposed as “Rarely sensitive” | No extra caution |
| Question 4 | Not sure | `not_sure` | `questionnaire_options` | Questionnaire payload | No extra caution |
| Question 5 `40:1630` | What is your main skincare goal? | Single code | `user_preferences.primary_goal` | `PUT .../answers` | Ranking |
| Question 5 | Reduce breakouts | `reduce_breakouts` | `questionnaire_options` | Questionnaire payload | Ranking |
| Question 5 | Improve skin hydration | `improve_hydration` | `questionnaire_options` | Questionnaire payload | Ranking |
| Question 5 | Improve appearance of dark spots | `improve_dark_spots` | `questionnaire_options` | Questionnaire payload | Ranking |
| Question 5 | Reduce appearance of fine lines | `reduce_fine_lines` | `questionnaire_options` | Questionnaire payload | Ranking |
| Question 5 | Build a healthy daily routine | `build_daily_routine` | `questionnaire_options` | Questionnaire payload | Ranking |
| Question 5 | Maintain my current skin | `maintain_current_skin` | `questionnaire_options` | Questionnaire payload | Ranking |
| Question 6 `41:1699` | What is your current skincare routine? | Single code | `skin_profiles.current_routine_level` | `PUT .../answers` | Template length |
| Question 6 | I don't have a routine | `none` | `questionnaire_options` | Questionnaire payload | Short template |
| Question 6 | Only cleanser or face wash | `cleanser_only` | `questionnaire_options` | Questionnaire payload | Short template |
| Question 6 | Cleanser + moisturizer | `cleanser_moisturizer` | `questionnaire_options` | Questionnaire payload | Standard template |
| Question 6 | Cleanser + moisturizer + sunscreen | `cleanser_moisturizer_spf` | `questionnaire_options` | Questionnaire payload | Adds morning SPF |
| Question 6 | I use multiple skincare products | `multi_product` | `questionnaire_options` | Questionnaire payload | Longer template |
| Question 7 `41:1769` | Any skincare reactions? | Single code | `skin_profiles.reaction_history` | `PUT .../answers` | Context only |
| Question 7 | Yes, I know which ingredients/products | `knows_ingredient` | `questionnaire_options` | Questionnaire payload | Does not exclude products by itself |
| Question 7 | Yes, but I'm not sure what caused it | `unknown_cause` | `questionnaire_options` | Questionnaire payload | Context |
| Question 7 | No known reactions | `no_known_reactions` | `questionnaire_options` | Questionnaire payload | Context |
| Question 7 | Not sure | `not_sure` | `questionnaire_options` | Questionnaire payload | Context |
| Question 7 | Reduce appearance of fine lines | Omitted | — | Not accepted | Design copy from Question 5 |
| Question 8 `41:1838` | Monthly spend | Single code | `user_preferences.monthly_budget_band` | `PUT .../answers` | Ranking |
| Question 8 | Under $20 | `under_20` | `questionnaire_options` | Questionnaire payload | Price penalty |
| Question 8 | $20–$50 | `20_50` | `questionnaire_options` | Questionnaire payload | Price penalty |
| Question 8 | $50-$100 | `50_100` | `questionnaire_options` | Questionnaire payload | Price penalty |
| Question 8 | $100+ | `100_plus` | `questionnaire_options` | Questionnaire payload | Price penalty |
| Question 8 | No fixed budget | `no_budget` | `questionnaire_options` | Questionnaire payload | Skips price penalty |
| Question 9 `42:1905` | Which product types are you interested in? | Multi codes, min 1 | `user_preference_categories` | `PUT .../answers` | Category filter |
| Question 9 | Cleansers | `cleansers` | `questionnaire_options` | Questionnaire payload | Category filter |
| Question 9 | Moisturizers | `moisturizers` | `questionnaire_options` | Questionnaire payload | Category filter |
| Question 9 | Serums | `serums` | `questionnaire_options` | Questionnaire payload | Category filter |
| Question 9 | Sunscreens | `sunscreens` | `questionnaire_options` | Questionnaire payload | Category filter |
| Question 9 | Exfoliants | `exfoliants` | `questionnaire_options` | Questionnaire payload | Category filter |
| Question 9 | Not sure — recommend for me | `recommend_for_me` | `questionnaire_options` | Questionnaire payload | Clears the category filter |
| Question 10 `43:1974` | Would you like an AI-assisted face scan? | Single code | `questionnaire_answers` | `PUT .../answers` | Gate |
| Question 10 | Start face scan | `start_scan` | Answer plus `consent_records` | Then capture flow | Consent before any object is stored |
| Question 10 | Continue without scan | `continue_without_scan` | Answer only | `POST .../complete` with no scan | None |
| Question 10 | Detects concerns; AI-powered analysis; Personalized recommendations; Track your progress | Display | — | — | None |
| Capture `100:2328` | Capture | Local image | Not stored until review | Device camera | Future vision input |
| Review `100:2371` | Analyze this photo | Submit when signed in | `scan_images.object_key`, `scan_sessions.status` | `POST /api/v1/scans/:id/upload-url` then `POST /api/v1/scans/:id/submit` | Phase 1 sets `ready_for_analysis` only. No checklist |
| Review | Retake photo | Discard | Deletes unconfirmed object | `DELETE /api/v1/scans/:id/image` | None |
| Reading your skin `109:2411` | Checklist and 30-second copy | No pre-account API | Phase 2 `ai_jobs` only after sign-in | Not called before auth | Ignored for this flow |
| Sign up `38:1031` | Full Name | String 1–80 | `user_profiles.display_name` | Supabase metadata, then `PATCH /api/v1/me` | None |
| Sign up | Email address | Email | Supabase Auth | Client Supabase call | None |
| Sign up | Password | Secret | Supabase Auth | Never a Nest field | None |
| Sign up | Facebook | OAuth | Supabase identity | Supabase Auth | None |
| Sign up | Unlabeled social button | Unresolved provider | — | Not specified | None |
| Sign in `37:822` | Email, Password, Forgot Password?, Sign in | Auth | Supabase Auth | Bearer JWT on later Nest calls | None |
| Sign in | Facebook | OAuth | Supabase identity | Supabase Auth | None |

## Dashboard and profile

| Figma screen | Field / component | Data type | Database entity | API | AI usage |
|---|---|---|---|---|---|
| Home `209:3219` | Hello, {name} | String | `user_profiles.display_name` | `GET /api/v1/home` | None |
| Home | Latest skin check date and status | Date, text | Latest `scan_sessions`, assessment when present | `GET /api/v1/home` | Observed fields empty until Phase 2 |
| Home | Hydration 85%, Texture 91% | Integer 0–100, nullable | `assessment_observations` | `GET /api/v1/home` | Phase 2 only |
| Home | Morning routine progress | Counts | `skincare_routine_steps` | `GET /api/v1/home` | Deterministic routine |
| Home | Mon–Sun strip, last 4 scan scores | Series | `progress_entries` | `GET /api/v1/home` | Empty until assessments exist |
| Your scan `309:2105` | Here is what Clara noticed | Display when `basis=assessed` | `skin_assessments.summary` | `GET /api/v1/scans/:id/result` | Must not wrap self-reported answers |
| Your scan | Combination skin, Comfortable barrier | Observed summary | `skin_assessments` | Result payload | Phase 2 |
| Your scan | Hydration, Redness, Texture, Fine lines cards | Observations | `assessment_observations` | Result payload | Codes `hydration`, `redness`, `texture`, `fine_lines` |
| Your scan | Search products | Query | Catalog | `GET /api/v1/products?q=` | Catalog search, not RAG |
| Your scan | Cart tab | Navigation | Later `carts` | No route in this contract | None |
| Progress `209:3407` | Two scans side by side | Pair of scans | `scan_sessions` | `GET /api/v1/progress` | Phase 2 comparison text |
| Progress | Overall skin score | Integer, nullable | `progress_entries.score` | `GET /api/v1/progress` | Phase 2 |
| Progress | Next skin scan date | Date | `user_preferences.next_scan_on` | `GET /api/v1/progress` | None |
| Recommendations `209:3590` | Morning and evening plan | Steps | `skincare_routines` | `GET /api/v1/recommendations/latest` | Phase 1 returns products. Explanation is `not_implemented` |
| Recommendations | Scan snapshot notes | Observations | `assessment_observations` | Same, null in Phase 1 | Phase 2 |
| Skin report `209:3739` | Trend labels | Enum, nullable | `progress_entries` | `GET /api/v1/skin-report` | Phase 2 |
| Skin report | Morning and evening step counts | Integers | Routine steps | `GET /api/v1/skin-report` | None |
| Skin report | Share / Talk to dermatologist | Later | — | No route | None |
| Routine `209:3910` | Dated routine and 3/5 progress | Steps | `skincare_routines`, completions | `GET /api/v1/routines/current` | Deterministic |
| Routine detail `209:4062` | Mark as complete | Boolean | `routine_step_completions` | `POST /api/v1/routines/current/steps/:id/complete` | None |
| Profile `310:2917` | Name, email, skin type, concerns, last scan | Read model | Profile, skin profile, latest scan | `GET /api/v1/me` | Skin type here is self-reported until an assessment exists. The response uses separate fields |
| Personal details `209:4158` | Full name | String | `user_profiles.display_name` | `PATCH /api/v1/me` | None |
| Personal details | Email address | Email | Supabase Auth | Read-only on `GET /api/v1/me` | None |
| Personal details | Date of birth | Date | `user_profiles.birth_date` | `PATCH /api/v1/me` | Adult check can use this once set. Question 1 remains the onboarding gate |
| Personal details | State/Province | String | `user_profiles.state_province` | `PATCH /api/v1/me` | Market context. Sample is Missouri |
| Personal details | Your Address | String | `user_profiles.address_line` | `PATCH /api/v1/me` | Not used for ranking in this contract |
| Personal details | Change Photo | Image | `user_profiles.avatar_object_key` | `POST /api/v1/me/avatar` | Not a vision input |
| Skin preferences `209:4651` | Hydration, Calm redness, Even tone, Clearer skin | Multi codes | `user_preference_goals` | `PUT /api/v1/me/preferences` | Ranking. Separate from Question 5 |
| Skin preferences | Fragrance, Retinol, Essential oils | Multi codes | `skin_profile_sensitivities` | `PUT /api/v1/me/preferences` | Hard ingredient exclusion |
| Skin preferences | Morning 8:00 AM, Evening 9:00 PM | Time | `user_preferences.morning_time`, `evening_time` | `PUT /api/v1/me/preferences` | Reminder display |
| Skin preferences | Next skin scan 28 October | Date | `user_preferences.next_scan_on` | `PUT /api/v1/me/preferences` | Schedule only |
| Privacy `443:766` | Camera, photo library, AI analysis, personal data | Consent purposes | `consent_records` | `POST /api/v1/consents` | AI-analysis grant is required before scan submit |
| Product details `309:2271` | Glow Skin, Hydrating Face Serum | Catalog sample | `brands`, `products` | `GET /api/v1/products/:id` | Agent must copy stored facts |
| Product details | $34.00, $40.00 | Money | `product_prices.amount`, `compare_at_amount` | Product DTO | Ranking snapshot |
| Product details | 4.5 (1,069 reviews) | Decimal, integer | `product_rating_snapshots` | Product DTO | Display |
| Product details | Key Benefits, Ingredients, How to use, Suitable for, Cautions | Text sections | `products` and `product_ingredients` | Product DTO | Eligibility and later RAG |
| Product details | Add to Cart, Buy Now | Later | — | No route in this contract | None |

## Answer shape

```json
{
  "question_key": "skin_concerns",
  "option_codes": ["acne_breakouts", "dark_spots", "uneven_texture"]
}
```

`recommend_for_me` cannot be combined with other Question 9 codes. The server rejects that mix with `422`.

## Result shape the scan screens read

Phase 1, after a signed-in submit and before any model exists:

```json
{
  "scan_id": "uuid",
  "status": "ready_for_analysis",
  "basis": "not_ready",
  "analysis_available": false,
  "assessment": null,
  "recommendations": null
}
```

`basis: "self_reported"` is reserved for a deterministic plan built from answers and Skin preferences. `basis: "assessed"` is reserved for a later validated assessment. The headline “Here is what Clara noticed about your skin” is valid only for `assessed`.
