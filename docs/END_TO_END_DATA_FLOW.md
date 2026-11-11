# End-to-end data flow

**Date:** 2026-10-28  
**Source:** Figma Design page `30:6`.

Phase 1 stores real answers, profile fields, preferences, catalog rows, deterministic recommendations, and routine completion. It does not call a vision model, an embedding API, or an agent. It does not store the Reading-your-skin checklist or the “Clara noticed” sample sentences as findings.

Analysis does not run before Sign up or Sign in. The frame `109:2411` is not a step in this flow.

## Path

```text
Mobile app
    |  HTTPS JSON
    |  Bearer JWT after Sign in or Sign up
    v
NestJS /api/v1
    |-- DTO validation
    |-- owner = JWT subject
    v
PostgreSQL                         Cloudflare R2
answers, profile, preferences      private scan objects
catalog, routines                  avatar objects in a separate prefix
    |
    |  later, and only for a signed-in scan
    v
Vision, RAG, agent
    |
    v
Validated assessment back through Nest
```

The app never receives database credentials, R2 secrets, or a worker URL.

## Source of truth

| Topic | Source of truth | Projection | Rule |
|---|---|---|---|
| Identity | Supabase JWT `sub` | `users.id` | Ignore a body `user_id` |
| Email and password | Supabase Auth | Profile may cache email | Nest never stores the password |
| Display name | `user_profiles.display_name` | — | Sign up full name, editable on Personal details |
| Birth date, state, address | `user_profiles` | — | Personal details. Sample address is in Missouri |
| Questionnaire answers | `questionnaire_answers` for one definition version | `skin_profiles`, `user_preferences` on complete | Draft edits do not publish the projection |
| Reaction history | Question 7 | `skin_profiles.reaction_history` | Context only. Not an exclusion list |
| Ingredient avoid-list | Skin preferences | `skin_profile_sensitivities` | The only hard exclusion input in this contract |
| Extra goals and schedule | Skin preferences | `user_preference_goals`, time columns, `next_scan_on` | Editable after the questionnaire |
| Face image | R2 object | `scan_images` metadata | No bytea column. Submit requires auth and AI-analysis consent |
| Observed findings | `assessment_observations` | Dashboard cards | Created only from a later validated result |
| Product facts | Catalog tables | Recommendation items snapshot price and name | The client cannot set price or ingredients |
| Market | `user_profiles.market_code` or the request | Price lookup | Personal details shows a US state and `$` prices. If market is missing, recommendation create returns `MARKET_REQUIRED` |

## Flow A — account

```text
Sign up or Sign in
    |
    v
Supabase Auth (email/password or Facebook)
    |
    v
JWT
    |
    v
GET /api/v1/me
    |
    v
Upsert users and user_profiles
    |
    v
Claim token, if the questionnaire was started first
    |
    v
Attach the onboarding session to the JWT user
```

| Mobile field | Nest | Database |
|---|---|---|
| Full name | `display_name` | `user_profiles.display_name` |
| Email | Read from the token | Supabase Auth |
| Password | Not accepted | Supabase Auth |
| Facebook | Supabase OAuth | Supabase identity |

The second social button has no name in the file, so no second provider is wired. Forgot password stays on Supabase.

Anonymous drafts are allowed because the canvas places Sign up after the questions. `onboarding_sessions.user_id` is null until claim. A claim token is returned once and only its hash is stored.

## Flow B — questionnaire

```text
Each onboarding screen
    |
    v
Keep the selection on the device
    |
    v
Sign up, then one POST /api/v1/onboarding/form
    |
    v
Validate every screen and store the answers
    |
    v
Project skin_profiles and user_preferences
```

Question 9 rejects a mix of `recommend_for_me` and any other code.

Question 10 `continue_without_scan` completes with no scan. `start_scan` records the choice and moves the client to capture. Completion still projects the other answers.

A newer completed submission replaces the projection. Older submissions stay as history.

| Answer | After complete | Vision context | RAG | Eligibility | Ranking | Routine |
|---|---|---|---|---|---|---|
| Age range | `skin_profiles.age_range` | Yes | Age guidance | Blocks scan when `under_18` | Mild | No |
| Skin type | `self_reported_skin_type` | Yes | Yes | Texture tags | Yes | Template family |
| Concerns | `skin_profile_concerns` | Yes | Yes | Concern tags | Yes | Emphasis |
| Sensitivity level | `sensitivity_level` | Yes | Caution docs | No ingredient exclusion | Caution | Gentler when `very_sensitive` |
| Main goal | `primary_goal` | Yes | Yes | No | Yes | Emphasis |
| Current routine | `current_routine_level` | No | No | No | No | Template length and SPF |
| Reactions | `reaction_history` | Yes | No | No hard exclusion | No | No |
| Budget | `monthly_budget_band` | No | No | Sort or hide over band | Price score | No |
| Product types | `user_preference_categories` | No | No | Category filter | No | Which steps exist |
| Face-scan choice | Answer plus consent when starting | Gate | No | No | No | No |

## Flow C — preferences after sign-in

```text
Skin preferences, Save preferences
    |
    v
PUT /api/v1/me/preferences
    |
    v
Replace user_preference_goals
Replace skin_profile_sensitivities
Save morning_time, evening_time, next_scan_on
```

Codes:

| Screen label | Code | Effect |
|---|---|---|
| Hydration | `hydration` | Extra ranking signal |
| Calm redness | `calm_redness` | Extra ranking signal |
| Even tone | `even_tone` | Extra ranking signal |
| Clearer skin | `clearer_skin` | Extra ranking signal |
| Fragrance | `fragrance` | Exclude products that contain a fragrance-restricted ingredient |
| Retinol | `retinol` | Exclude retinoid-restricted ingredients |
| Essential oils | `essential_oils` | Exclude essential-oil-restricted ingredients |

If a selected avoid-code exists and a product has no ingredient rows, the product is dropped and the response limitation is `ingredient_data_missing`. The API does not call that product safe.

Saving preferences does not rewrite questionnaire history.

## Flow D — face image, only after auth

```text
Question 10, Start face scan
    |
    v
Capture and photo review
    |
    v
Analyze this photo
    |
    +-- no JWT
    |     keep the onboarding draft
    |     open Sign up or Sign in
    |     claim the draft
    |     then continue
    |
    +-- JWT present
          |
          v
        POST /api/v1/consents
          purpose facial_image_processing, granted true
          |
          v
        POST /api/v1/scans
          |
          v
        Reject under_18
        Reject when consent is missing or revoked
          |
          v
        status awaiting_upload
          |
          v
        Signed R2 PUT, jpeg / png / webp, max 8 MB
          |
          v
        POST /api/v1/scans/:id/submit
          |
          v
        HEAD the object, check owner, type, and size
          |
          v
        status ready_for_analysis
        analysis_available false
```

There is no transition into the Reading-your-skin checklist in this contract. A signed-in client that polls the scan sees `ready_for_analysis` and pending copy, not “Image quality confirmed” or “Tone and texture read”.

Retake before submit deletes the object. `DELETE /api/v1/scans/:id` deletes the object, sets `cancelled`, and writes an audit event with ids only.

Avatar upload on Personal details uses prefix `avatars/{user_id}/` and never creates a scan session.

## Flow E — deterministic plan

This can run with no photo. Basis is `self_reported`.

```text
Completed submission + current Skin preferences
    |
    v
Drop inactive products and the wrong market
    |
    v
Apply category interest, unless recommend_for_me
    |
    v
Drop ingredient conflicts from skin_profile_sensitivities
    |
    v
Rank by concern overlap, preference goals, skin type, primary goal, then price
    |
    v
Persist recommendation_items with a price snapshot
    |
    v
Build morning and evening steps
    |
    v
explanation_status = not_implemented
```

The morning template includes SPF when the routine level is `cleanser_moisturizer_spf` or `multi_product`. Evening does not duplicate SPF. Step products must be eligible ids.

A goal or a preference chip cannot put an excluded product back.

## Flow F — dashboard reads

```text
GET /api/v1/home
GET /api/v1/scans/:id/result
GET /api/v1/progress
GET /api/v1/recommendations/latest
GET /api/v1/skin-report
GET /api/v1/routines/current
```

Each response includes `basis` and leaves assessment fields null when no validated row exists. Routine progress uses `routine_step_completions`, which is a real write from **Mark as complete**.

Home’s “2 of 3 steps complete” and the routine screen’s “3/5 steps” are `completed_count` and `step_count` for today’s morning or full day. They are not hardcoded.

## Flow G — later analysis

Not implemented. After a signed-in scan is `ready_for_analysis`, a future worker may move it through `queued`, `processing`, and `completed`. The internal vision envelope still carries the R2 key, the submission id, self-reported skin type, concerns, sensitivity level, reaction history, and the avoid-list. Provider adapters must not receive a long-lived public image URL.

The mobile result then uses `basis: assessed`. Home scores, Progress comparison, and Your scan cards read `assessment_observations`. They are not copied from `skin_profile_concerns`.

## Deletion

Scan delete removes the R2 object and cancels the session. Account deletion, when built with Profile, removes profile, answers, preferences, recommendations, routines, and remaining objects. Audit rows keep an irreversible actor hash.

## Fixtures

| Allowed | Not allowed |
|---|---|
| The onboarding definition and the option codes in the mapping | A Question 7 option for “Reduce appearance of fine lines” |
| Catalog rows for Glow Skin / Hydrating Face Serum once prices are confirmed as sample data | Hydration 85, score 78, or “Clara noticed” stored as an assessment |
| A scan left at `ready_for_analysis` | A job that pretends the 30-second checklist finished |
| Skin-preference rows for fragrance, retinol, and essential oils | Google or Apple providers until the unlabeled button is named |
