# Clara Skin API — built work and next phases

**Date:** 2026-11-11  
**Repository:** [skin-ai-backend](https://github.com/adnanghaffar07/skin-ai-backend/tree/dev), branch `dev`  
**Service:** NestJS API, base path `/api/v1`  
**Docs:** Swagger UI at `/api/docs`  
**Database:** Supabase project `skin-ai`. The API reads and writes Postgres with the `pg` driver. Prisma is not used.

This note says what is already callable, what Phase 1 still has to build, and what belongs to the AI phase after that.

## Where the work stands

Phase 1 is partly built. Sign-in, profile, consent, skin preferences, and the one-shot onboarding save are implemented and documented in Swagger.

The rest of Phase 1 is specified and not implemented: face-photo upload, product catalog, deterministic recommendations, routines, and dashboard reads. Calling those paths returns 404.

Vision, retrieval (RAG), and the feedback agent are the phase after that. They are not implemented, and the API does not invent scan findings or “Clara noticed” text.

Sign-up, sign-in, forgot password, and Facebook sign-in stay on Supabase Auth. This API never accepts or stores a password. The app sends `Authorization: Bearer <Supabase access token>` on protected routes. The token subject is the owner. A body field named `user_id` is rejected.

## Phase 1 — built

The phone keeps every onboarding answer on the device. Going back and changing a selection does not call the API. After sign-up, one request saves the whole form.

| Method | Path | Auth | What it does |
|---|---|---|---|
| `GET` | `/api/v1/health` | Public | Returns `{ "status": "ok", "service": "skincare-api" }` |
| `GET` | `/api/v1/me` | Bearer | Creates the app user from the token if needed, then returns profile, skin summary, and onboarding status |
| `PATCH` | `/api/v1/me` | Bearer | Saves personal details: display name, birth date, state, address, market, locale. Email is not writable |
| `POST` | `/api/v1/consents` | Bearer | Records a grant or revocation for facial-image processing, camera, photo library, or terms |
| `GET` | `/api/v1/consents` | Bearer | Lists that user’s consent records, newest first |
| `GET` | `/api/v1/me/preferences` | Bearer | Returns skin-preference goals, avoid-list, and reminder times |
| `PUT` | `/api/v1/me/preferences` | Bearer | Replaces goals and the avoid-list. Omitted times keep their current values |
| `GET` | `/api/v1/questionnaires/onboarding/active` | Public | Optional question definition: prompts, selection mode, and option codes. The app can ship the screens itself and skip this during the flow |
| `POST` | `/api/v1/onboarding/form` | Bearer | Saves all 10 screens once, marks the submission completed, and projects the skin profile |
| `GET` | `/api/v1/onboarding/form` | Bearer | Returns the latest saved form |

`GET /api/v1` still returns the starter hello response. It is hidden from Swagger.

### Onboarding rules that are live

Only two screens accept more than one option:

- Question 3, `skin_concerns` — at least one concern
- Question 9, `product_interests` — at least one product type

`recommend_for_me` cannot be combined with another product type. That returns `422 EXCLUSIVE_OPTION`. The other eight questions take exactly one code. A missing required screen returns `422 ANSWERS_INCOMPLETE`. An unknown question or option returns `422 QUESTION_VERSION_MISMATCH`.

Saving the form copies answers into the skin profile: age range, self-reported skin type, concerns, sensitivity, routine level, reaction history, primary goal, monthly budget, and product categories. `recommend_for_me` alone stores no categories. `continue_without_scan` stores the choice and does not create a scan. Question 7 (reaction history) is context only. Ingredient exclusions come from Skin preferences: `fragrance`, `retinol`, and `essential_oils`.

Under 18 can finish the questionnaire. Face upload is not built yet; when it is, `under_18` will be blocked from submitting a photo.

### What a saved form does not do

`POST /api/v1/onboarding/form` does not analyze a face, call a model, or return product feedback. Avatar URL stays null because profile-photo upload is not built.

## Phase 1 — next

Build these in this order. The contract is already written in `docs/PHASE1_API_SPECIFICATION.md`. None of these routes exist in the running API.

### 1. Face photo, stored only

After sign-in, and only when the form choice is `start_scan` and facial-image consent is granted:

| Method | Path | Effect |
|---|---|---|
| `POST` | `/api/v1/scans` | Create a scan waiting for upload |
| `POST` | `/api/v1/scans/:id/upload-url` | Return a short-lived signed upload URL |
| `POST` | `/api/v1/scans/:id/submit` | Confirm the file and set status `ready_for_analysis` |
| `GET` | `/api/v1/scans` and `/api/v1/scans/:id` | History and status |
| `GET` | `/api/v1/scans/:id/result` | Honest empty result until a later phase analyzes the photo |
| `DELETE` | `/api/v1/scans/:id/image` and `/api/v1/scans/:id` | Retake or cancel |
| `POST` | `/api/v1/me/avatar` | Profile photo, separate from a scan |

Submit stops at `ready_for_analysis` with `analysis_available: false`. No vision job runs. The photo stays in private object storage. Under 18 cannot create a scan.

### 2. Catalog

| Method | Path | Effect |
|---|---|---|
| `GET` | `/api/v1/products` | Search and list products for a market |
| `GET` | `/api/v1/products/:id` | Product detail: price, ingredients, how to use, cautions |
| Admin writes | `/api/v1/admin/brands`, `/products`, `/ingredients` | Staff-only catalog maintenance |

Add to Cart and Buy Now are not part of this API.

### 3. Deterministic plan, routine, and dashboard

Recommendations in this phase use the saved answers, preferences, and catalog. They do not use a photo score and they do not call an AI explainer. `explanation_status` stays `not_implemented`.

| Method | Path | Effect |
|---|---|---|
| `POST` | `/api/v1/recommendations` | Build a self-reported product plan for a market |
| `GET` | `/api/v1/recommendations/latest` | Latest plan. The scan-observation block stays null |
| `GET` | `/api/v1/routines/current` | Morning and evening steps from the catalog |
| `POST` | `/api/v1/routines/current/steps/:stepId/complete` | Mark one step done for today |
| `GET` | `/api/v1/home` | Greeting and empty scores until an assessment exists |
| `GET` | `/api/v1/progress` | Next scan date. “What changed” stays empty |
| `GET` | `/api/v1/skin-report` | Step counts and null trend fields |

Home scores, Progress changes, and “Here is what Clara noticed” stay empty on purpose until a validated assessment exists.

## Phase 2 — AI feedback

Start this only after a signed-in photo can be stored and the self-reported plan is in place.

1. Vision reads the stored face photo and writes an assessment.
2. Retrieval uses the assessment plus the onboarding answers to pull relevant guidance.
3. The agent returns feedback in a form the app can show.
4. The same values and feedback are stored, and scan result, home, progress, and recommendations can then show assessed data.

Until that phase exists, result payloads keep `basis: "not_ready"` or `basis: "self_reported"`, and `assessment` stays null. The API must not fill those fields with sample copy from the design.

## Not in either phase

These screens can exist in the design and still have no API:

- Cart, checkout, orders, wishlist, and payment
- Notifications
- Dermatologist booking, consultation history, and appointments
- The Reading-your-skin checklist before an account exists
- A second social sign-in provider. Only Facebook is named in the design
- Medical diagnosis fields

## Mobile sequence for what works today

1. Optional: `GET /api/v1/questionnaires/onboarding/active` once, to load option codes. Do not call it on every screen.
2. Keep all 10 answers on the device, including when the user goes back.
3. Sign up or sign in with Supabase. Use the returned access token as the Bearer token.
4. `POST /api/v1/onboarding/form` once with every answer.
5. `GET /api/v1/me`, `PATCH /api/v1/me`, consent, and preferences as the user opens those screens later.

Full request and response examples are in `docs/PHASE1_API_SPECIFICATION.md`. Swagger at `/api/docs` matches the routes in the “built” table.
