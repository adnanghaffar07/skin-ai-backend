# Implementation status

**Updated:** 2026-10-29  
**Current milestone:** 3 — authentication, profile, consent, preferences, and onboarding  
**Phase:** Those routes are in Nest and Swagger. They read Supabase when `DATABASE_URL` is set in `.env`  
**Next step:** scans, catalog, recommendations, and dashboard reads after this slice is reviewed

## Scope locked with this revision

The approved plan fixes the first contract to onboarding plus the skin dashboard. These decisions are now written into the docs:

| Decision | Contract |
|---|---|
| First slice | Splash, Welcome, Questions 1–10, face-scan capture, photo review, Sign in, Sign up, Home, Your scan, Progress, Recommendations, Skin report, Routine, Profile, Personal details, Skin preferences, Privacy, and product read |
| Analysis before sign-in | Excluded. Frame `109:2411` Reading your skin has no pre-account API. Scan create and submit require a JWT |
| Face photo | Capture and review stay on the onboarding canvas. If the customer is anonymous at **Analyze this photo**, the app signs them in, claims the draft, then submits. Status stops at `ready_for_analysis` |
| Ingredient exclusions | Skin preferences (`fragrance`, `retinol`, `essential_oils`), not Question 7 |
| Later surfaces | Cart, checkout, orders, wishlist, payment, notifications, dermatologist booking, consultation history, appointments |
| NestJS | Milestone 1 foundation is in place. Domain modules are not |

## Milestone 0 report

### Implemented

Documentation revised against Figma page Design `30:6` in file `nZAL6KFqTYEileWQ1cCga1`. Text layers were read from the file. The earlier screenshot-only option lists are superseded.

| Document | Contents |
|---|---|
| `docs/FIGMA_SCREEN_ANALYSIS.md` | Onboarding and dashboard frames, node ids, exact prompts, and the screens left for later |
| `docs/FIGMA_TO_API_MAPPING.md` | Field, option code, table, route, and AI use |
| `docs/END_TO_END_DATA_FLOW.md` | Account, questionnaire, preferences, post-login image submit, deterministic plan, dashboard reads |
| `docs/DATABASE_DESIGN_PROPOSAL.md` | Proposed PostgreSQL model for this slice |
| `docs/PHASE1_API_SPECIFICATION.md` | Proposed `/api/v1` contract |
| `docs/IMPLEMENTATION_STATUS.md` | This file |

### Files created or modified

Updated the six documents above.

No file under `src/`, `test/`, or `prisma/` was changed. `package.json` was not changed.

### Database changes

None. No migration and no seed have been applied.

### API endpoints

None added. The starter still exposes:

| Method | Path | Behaviour today |
|---|---|---|
| `GET` | `/` | Returns `Hello World!` |

### Test results

No tests were executed. This revision does not change runtime code, so the existing Vitest files were not run and are not reported as passed or failed.

### Design facts now in the contract

- Question 3 is multi-select with six concerns, including dryness and uneven texture.
- Question 5 goals and Question 6 routine levels match the file.
- Question 8 bands start at Under $20, not Under $25.
- Question 9 says “Select all that apply” and includes Exfoliants and “Not sure — recommend for me”.
- Question 10 has **Continue without scan**.
- Question 7 is “Any skincare reactions?”. The fine-lines row on that frame is omitted as a copy error.
- Question 4 codes use corrected labels for “Sometime sensitive” and “Rarelr sensitive”.
- Age bands are stored as drawn, including the overlap of `25-34` and `34-44` at 34.
- Facebook is the only named social button.
- Personal details add birth date, state/province, address, and avatar.
- Dashboard scores and observation sentences stay null until a later validated assessment.

### Remaining risks

1. Age band 34 belongs to two options until design changes the labels.
2. “Yes, I know which ingredients/products” has no follow-up screen. The avoid-list is only the three Skin preferences chips.
3. The second social button is still unnamed, so only Facebook is in the auth contract.
4. Under 18 can complete the questionnaire and cannot submit a face image.
5. Routine product names on the frame are samples. They need matching catalog rows before the routine payload shows those exact names.
6. Home scores, Progress “what changed”, and Your scan “Clara noticed” will look empty in Phase 1 on purpose.
7. Market is not a labeled onboarding field. Recommendation create returns `MARKET_REQUIRED` until profile or request supplies one. The personal-details sample is Missouri and prices are in dollars.

### How to verify

1. Open the six files in `docs/`.
2. Compare Question 1–10 prompts with Figma frames `38:1144` through `43:1974`.
3. Confirm `109:2411` is described as excluded from the pre-account flow.
4. Confirm no file under `src/` or `test/` changed for this revision.

## Milestone 1 report

### Implemented

- Global prefix `/api/v1`.
- `GET /api/v1/health` returns `{ "status": "ok", "service": "skincare-api" }`.
- Environment validation for `NODE_ENV` and `PORT` through `@nestjs/config` and class-validator. See `.env.example`.
- Global validation pipe: whitelist, forbid non-whitelisted fields, transform.
- Shared error body: `statusCode`, `code`, `message`, `details`, `requestId`. Unexpected errors do not leak the exception text.
- `x-request-id` is accepted when it is a short token and otherwise generated.
- Swagger UI at `/api/docs` and OpenAPI JSON at `/api/docs-json`. Bearer auth is declared. The health route is the only documented operation.
- ESM and Vitest are unchanged.

### Files created or modified

Created:

- `src/app.setup.ts`
- `src/config/env.validation.ts`
- `src/config/env.validation.spec.ts`
- `src/common/filters/error-codes.ts`
- `src/common/filters/all-exceptions.filter.ts`
- `src/common/filters/all-exceptions.filter.spec.ts`
- `src/common/middleware/request-id.middleware.ts`
- `src/health/health.module.ts`
- `src/health/health.controller.ts`
- `src/health/health.controller.spec.ts`
- `src/health/health.service.ts`
- `src/health/health.service.spec.ts`
- `src/health/dto/health-response.dto.ts`
- `.env.example`

Modified:

- `src/main.ts`
- `src/app.module.ts`
- `src/app.controller.ts`
- `test/app.e2e-spec.ts`
- `package.json`
- `package-lock.json`

### Database changes

None.

### API endpoints

| Method | Path | Auth |
|---|---|---|
| `GET` | `/api/v1/health` | Public |
| `GET` | `/api/v1` | Public starter hello. Hidden from Swagger |
| `GET` | `/api/docs` | Swagger UI |
| `GET` | `/api/docs-json` | OpenAPI document |

### Test results

Executed after the final compile fix:

- `npm test`: 5 files, 11 tests, all passed.
- `npm run test:e2e`: 1 file, 3 tests, all passed.
- `npm run lint`: passed.
- Manual check on port 3011: health returned 200 with the request id echoed, an unknown path returned the 404 error body, and `/api/docs` returned the Swagger page. The process was stopped after that check.

### Remaining risks

- Supabase, Postgres, R2, and JWT verification are not configured. Invalid values for those future variables are not rejected yet.
- The starter `GET /api/v1` hello route is still present so the original smoke test keeps a target. It is excluded from the OpenAPI document.
- Rate limiting is specified and not installed in this milestone.

### How to verify

```bash
npm test
npm run test:e2e
npm run start
```

Then open `http://localhost:3000/api/v1/health` and `http://localhost:3000/api/docs`. Copy `.env.example` to `.env` to override `PORT`.

### Next milestone dependencies

Milestone 2 needs a Supabase Postgres connection string and approval to add Prisma. Milestone 1 does not read a database.

## Milestone 3 and 4 report

### Implemented

- Supabase access tokens are verified with the project JWKS. The JWT subject is the owner. A body field named `user_id` is rejected. Passwords are still not accepted.
- `GET /api/v1/me` upserts `users` and `user_profiles`. `PATCH /api/v1/me` saves personal details. Email is not writable.
- Consent create and list, and skin-preferences get and replace.
- Public `GET /api/v1/questionnaires/onboarding/active` is optional. The app keeps screen selections locally.
- `POST /api/v1/onboarding/form` saves every screen in one request after sign-up and projects the skin profile. Per-screen answer calls are removed.
- Swagger at `/api/docs` includes example payloads for these routes.

### Not in this slice

Avatar upload, scans, catalog, recommendations, routines, and dashboard reads. Those need object storage or the later ranking rules.

### Database

Queries use the `pg` driver and the SQL already applied on `skin-ai`. Prisma is not installed. The local `.env` still needs `DATABASE_URL` with the database password. Without it the server boots and Swagger loads, and a database route returns 503.

### Test results

- `npm test`: 9 files, 23 tests, all passed.
- `npm run test:e2e`: 1 file, 5 tests, all passed.
- `npm run lint`: passed.
- Manual check: `/api/docs` returned 200, `/api/v1/me` without a token returned 401 `UNAUTHENTICATED`, and the active questionnaire returned 503 until `DATABASE_URL` is set.

## Milestone board

| Milestone | State |
|---|---|
| 0 Figma review | Revised from the live Design page |
| 1 Nest foundation | Complete |
| 2 PostgreSQL and Prisma | Schema and seed applied on Supabase `skin-ai`. Nest uses `pg` against that SQL. Prisma is not added |
| 3 Authentication | Bearer JWT via Supabase JWKS. `GET` and `PATCH /api/v1/me` |
| 4 Onboarding and questionnaires | Active questionnaire, sessions, claim, answers, complete, consent, and preferences |
| 5 Catalog | Not started |
| 6 Face scan and R2 | Not started. Submit stays behind auth |
| 7 Deterministic recommendations | Not started |
| 8 Phase 2 contracts | Not started |
| 9 API finalization | Not started |

## Deviations

- Screenshot guesses from the first Milestone 0 pass are replaced by the live text layers.
- Analysis before Sign in is out, even though the canvas places Reading your skin before Sign in.
- Cart and dermatologist booking are visible and excluded from this contract.
- Question 4 seed labels correct two typos. Question 7 drops one copied option.
- `knowledge_chunks` remains beside `knowledge_documents` with no vector column.
- Passwords stay in Supabase Auth. The named social provider is Facebook.
- Milestone 1 keeps the starter hello response and serves it at `GET /api/v1` because every public route uses that prefix. It is hidden from Swagger.
- Nest queries Postgres with `pg` instead of Prisma. The SQL migrations remain the schema source.
