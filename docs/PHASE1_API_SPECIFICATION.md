# Phase 1 API specification

**Date:** 2026-10-28  
**Status:** Approved. Profile, consent, preferences, and onboarding routes are implemented. Scans, catalog, recommendations, and dashboard reads are not.  
**Base path:** `/api/v1`  
**Format:** JSON, UTF-8. Times are ISO 8601 UTC.  
**Auth:** `Authorization: Bearer <Supabase access token>` except `GET /api/v1/health` and the optional public questionnaire definition. Onboarding selections stay on the device until `POST /api/v1/onboarding/form`.

Sign up, sign in, forgot password, and Facebook sign-in are Supabase Auth calls from the app. Nest never accepts a password. The unlabeled social button in Figma is not a provider in this contract.

`Reading your skin` has no route. Cart, checkout, orders, wishlist, payment, and dermatologist booking have no routes.

## Conventions

- Ids are server-generated UUIDs.
- `POST /api/v1/scans` and `POST /api/v1/recommendations` require `Idempotency-Key`. The same key and user return the original resource.
- Lists use `limit` and `cursor`. `next_cursor` is null at the end.
- Money is a decimal string plus `currency_code`.
- A body field named `user_id` is rejected.
- Owner mismatches return `404`.

```json
{
  "statusCode": 422,
  "code": "ANSWERS_INCOMPLETE",
  "message": "Answer every required question before completing onboarding.",
  "details": [{ "question_key": "reaction_history" }],
  "requestId": "req_01h..."
}
```

| HTTP | `code` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | DTO failed |
| 401 | `UNAUTHENTICATED` | Missing or invalid JWT, including scan submit |
| 403 | `FORBIDDEN` | Wrong role, or `under_18` scan attempt |
| 404 | `NOT_FOUND` | Unknown id, including another user’s id |
| 409 | `CONFLICT` | Illegal transition or idempotency body mismatch |
| 413 | `PAYLOAD_TOO_LARGE` | Image over 8 MB |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Not jpeg, png, or webp |
| 422 | `ANSWERS_INCOMPLETE` | Complete with gaps |
| 422 | `CONSENT_REQUIRED` | Scan create without a live AI-analysis grant |
| 422 | `QUESTION_VERSION_MISMATCH` | Code not on this version |
| 422 | `EXCLUSIVE_OPTION` | `recommend_for_me` mixed with other product types |
| 422 | `MARKET_REQUIRED` | Priced recommendation with no market |
| 429 | `RATE_LIMITED` | Global limiter, stricter on upload-url and recommendation create |

## Health and profile

### `GET /api/v1/health`

Public. `{ "status": "ok", "service": "skincare-api" }`.

### `GET /api/v1/me`

Upserts the user from the token. Returns the Profile header and onboarding pointer.

```json
{
  "id": "uuid",
  "email": "ameliajane43@gmail.com",
  "role": "customer",
  "display_name": "Amelia Jane",
  "birth_date": "1996-05-14",
  "state_province": "Missouri",
  "address_line": "91821 Mante Ranch",
  "avatar_url": null,
  "market_code": "US",
  "locale": "en",
  "skin": {
    "self_reported_skin_type": "combination",
    "concerns": ["dryness_dehydration", "uneven_texture"],
    "last_scan_at": null
  },
  "onboarding": { "status": "completed", "submission_id": "uuid" }
}
```

`skin.self_reported_skin_type` is Question 2. It is not the observed “Combination skin” card.

### `PATCH /api/v1/me`

Personal details **Save changes**. Email is not writable.

```json
{
  "display_name": "Amelia Jane",
  "birth_date": "1996-05-14",
  "state_province": "Missouri",
  "address_line": "91821 Mante Ranch",
  "market_code": "US",
  "locale": "en"
}
```

### `POST /api/v1/me/avatar`

Signed PUT for a profile photo. Same type and size limits as scans. The object prefix is `avatars/{user_id}/`. Completing it sets `avatar_object_key` and does not create a scan.

## Consent

### `POST /api/v1/consents`

```json
{
  "purpose": "facial_image_processing",
  "policy_version": "2026-10-28",
  "granted": true,
  "source": "privacy_screen"
}
```

`purpose` is `facial_image_processing`, `camera_access`, `photo_library`, or `terms_of_service`.

### `GET /api/v1/consents`

The caller’s records, newest first. Powers Privacy & permissions.

## Onboarding

The mobile app keeps every screen’s selection on the device. Back navigation and reselection do not call the API. After sign-up, one request stores the whole form.

### `GET /api/v1/questionnaires/onboarding/active`

Public and optional. Returns version, prompts, help text, selection mode, and options (`code`, `label`, `position`). The app can ship these screens itself and skip this call during the flow.

### `POST /api/v1/onboarding/form`

Authenticated. Body is every screen, once.

```json
{
  "answers": [
    { "question_key": "age_range", "option_codes": ["age_25_34"] },
    { "question_key": "skin_type", "option_codes": ["combination"] },
    { "question_key": "skin_concerns", "option_codes": ["dryness_dehydration", "uneven_texture"] },
    { "question_key": "sensitivity_level", "option_codes": ["sometimes_sensitive"] },
    { "question_key": "primary_goal", "option_codes": ["improve_hydration"] },
    { "question_key": "current_routine", "option_codes": ["cleanser_moisturizer"] },
    { "question_key": "reaction_history", "option_codes": ["no_known_reactions"] },
    { "question_key": "monthly_budget", "option_codes": ["20_50"] },
    { "question_key": "product_interests", "option_codes": ["serums", "sunscreens"] },
    { "question_key": "face_scan_opt_in", "option_codes": ["continue_without_scan"] }
  ]
}
```

Single-select accepts one code. Multi-select must satisfy min and max. `recommend_for_me` alone is valid. Combined with another code it returns `EXCLUSIVE_OPTION`. A missing required screen returns `ANSWERS_INCOMPLETE`.

The server writes one answer row per selected option, marks the submission `completed`, and projects the skin profile and preferences. `continue_without_scan` stores the choice and creates no scan. A later submit stores a new form and replaces the projection.

### `GET /api/v1/onboarding/form`

Authenticated. Returns the latest saved form for the caller.

## Preferences

### `GET /api/v1/me/preferences`

### `PUT /api/v1/me/preferences`

Skin preferences **Save preferences**. Replaces goals and avoid-list.

```json
{
  "goal_codes": ["hydration", "calm_redness", "even_tone", "clearer_skin"],
  "avoid_codes": ["fragrance", "retinol", "essential_oils"],
  "morning_time": "08:00",
  "evening_time": "21:00",
  "next_scan_on": "2026-10-28"
}
```

Unknown codes return `VALIDATION_ERROR`. This does not change questionnaire history.

## Scans

Submit and create require a JWT. An anonymous photo review must sign in and claim the draft before these routes.

| Method | Path | Effect |
|---|---|---|
| `POST` | `/api/v1/scans` | `awaiting_upload` |
| `POST` | `/api/v1/scans/:id/upload-url` | Signed PUT |
| `POST` | `/api/v1/scans/:id/submit` | Verify object, set `ready_for_analysis` |
| `GET` | `/api/v1/scans/:id` | Status |
| `GET` | `/api/v1/scans` | History |
| `GET` | `/api/v1/scans/:id/result` | Truthful result |
| `DELETE` | `/api/v1/scans/:id/image` | Retake, before submit |
| `DELETE` | `/api/v1/scans/:id` | Delete object, `cancelled` |

### `POST /api/v1/scans`

`Idempotency-Key` required. Body `{ "submission_id": "uuid" }`.

`CONSENT_REQUIRED` without a live `facial_image_processing` grant. `FORBIDDEN` / `AGE_RESTRICTED` when `age_range` is `under_18`. `422` when the submission is not complete or `face_scan_opt_in` is not `start_scan`.

There is no request that starts the analysis checklist.

### `POST /api/v1/scans/:id/upload-url`

```json
{ "content_type": "image/jpeg", "byte_size": 2401122 }
```

Response includes `upload_url`, `method`, `headers`, `expires_at` (10 minutes), and `object_key`. The key is not a public URL. Maximum size is 8388608 bytes.

### `POST /api/v1/scans/:id/submit`

No body. The server HEADs the object and checks prefix, content type, and size.

```json
{
  "id": "uuid",
  "status": "ready_for_analysis",
  "submitted_at": "2026-10-28T00:12:00Z",
  "analysis_available": false
}
```

`analysis_available: false` means the photo was accepted and no model has run.

### `GET /api/v1/scans/:id/result`

```json
{
  "scan_id": "uuid",
  "status": "ready_for_analysis",
  "basis": "not_ready",
  "analysis_available": false,
  "submitted_at": "2026-10-28T00:12:00Z",
  "assessment": null,
  "recommendations": null,
  "routine": null,
  "sources": [],
  "disclaimer": "AI results are estimates, not medical diagnoses, and should not replace professional dermatological advice.",
  "generated_at": null
}
```

The disclaimer text is taken from Privacy `443:766`. Your scan must not use “Here is what Clara noticed about your skin” while `basis` is `not_ready` or `self_reported`.

A self-reported plan may be attached with `basis: "self_reported"` and `assessment: null`. `basis: "assessed"` is reserved for a later validated row. Observation cards then use `feature_code` values `hydration`, `redness`, `texture`, and `fine_lines`.

## Dashboard reads

All require a JWT and the owner’s data.

### `GET /api/v1/home`

```json
{
  "greeting_name": "Amelia",
  "latest_scan": null,
  "focus": null,
  "morning_routine": { "completed_count": 0, "step_count": 0, "steps": [] },
  "week": [],
  "recent_scores": []
}
```

`latest_scan.hydration_score` and `texture_score` are present only when an assessment has those scores. `recent_scores` is an empty array until `progress_entries` exist. `morning_routine` is the active routine’s morning steps for today.

### `GET /api/v1/progress`

```json
{
  "next_scan_on": "2026-10-28",
  "latest": null,
  "previous": null,
  "overall_score": null,
  "changes": []
}
```

`changes` stays empty in this contract. It is the later “what changed” list.

### `GET /api/v1/skin-report`

Returns the caller’s name, `morning_step_count`, `evening_step_count`, and nullable trend fields `hydration`, `redness`, `uneven_tone`. Trends stay null. Share and Talk to dermatologist are not routes.

### `GET /api/v1/recommendations/latest`

```json
{
  "id": "uuid",
  "basis": "self_reported",
  "rule_version": "2026-10-28",
  "limitations": [],
  "explanation_status": "not_implemented",
  "morning_title": "Calm and protect",
  "evening_title": "Repair and smooth",
  "products": [],
  "snapshot": null
}
```

`snapshot` is the scan-observation block on Recommendations. It is null until an assessment exists. Morning and evening titles are the frame’s labels and describe the template, not an AI sentence about the photo.

### `POST /api/v1/recommendations`

Body `{ "submission_id": "uuid", "market_code": "US" }`. `market_code` falls back to the profile, then `MARKET_REQUIRED`.

Eligibility order:

1. Active products available in the market.
2. Category filter from Question 9, skipped when the answer is only `recommend_for_me`.
3. Drop products whose ingredients intersect `avoid_codes`.
4. Drop products with an empty ingredient list when any avoid-code is set, and add `ingredient_data_missing`.
5. Rank by concern overlap, preference goals, skin-type fit, primary goal, then price distance. `no_budget` skips price.
6. Tie-break by product name, then id.

SPF is included in the morning template when `current_routine_level` is `cleanser_moisturizer_spf` or `multi_product`.

`explanation_status` is always `not_implemented` in this contract.

### `GET /api/v1/routines/current`

```json
{
  "routine_id": "uuid",
  "routine_date": "2026-10-16",
  "completed_count": 3,
  "step_count": 5,
  "morning": [
    {
      "step_id": "uuid",
      "position": 1,
      "step_type": "cleanse",
      "title": "Cleanse",
      "product_id": "uuid",
      "product_name": "Gentle Cream Cleanser",
      "duration_label": "1 min",
      "amount_label": null,
      "instruction": null,
      "completed": false
    }
  ],
  "evening": []
}
```

Product names come from the catalog. The names on the Figma routine frame are samples until those products are seeded.

### `POST /api/v1/routines/current/steps/:stepId/complete`

**Mark as complete** for today. Idempotent per step and date. Returns the updated counts.

## Catalog

### `GET /api/v1/products`

Query `q`, `category`, `market`, `limit`, `cursor`. Powers Your scan search. `category` omitted returns the market’s available products.

### `GET /api/v1/products/:id`

Product details: brand, name, price, compare-at price, rating, image, benefits, ingredients, how to use, suitable for, cautions. Add to Cart and Buy Now are not in the payload.

### Admin

Role `admin`.

| Method | Path |
|---|---|
| `POST` | `/api/v1/admin/brands` |
| `POST` | `/api/v1/admin/products` |
| `PATCH` | `/api/v1/admin/products/:id` |
| `PUT` | `/api/v1/admin/products/:id/ingredients` |
| `PUT` | `/api/v1/admin/products/:id/prices` |
| `PUT` | `/api/v1/admin/products/:id/markets` |
| `POST` | `/api/v1/admin/ingredients` |

Customer routes cannot write price or ingredients.

## Internal interfaces

| Interface | This contract |
|---|---|
| `ProductEligibilityService` | Implemented from the rules above |
| `ProductRankingService` | Implemented |
| `RecommendationService` | Implemented, `self_reported` only |
| `RoutineBuilderService` | Implemented from the routine template |
| `AIRecommendationExplainer` | Stub, `explanation_status: not_implemented` |
| `VisionAnalysisService` | Interface only. No client. Not called from photo review |
| `KnowledgeRetrievalService` | Interface. Empty result |
| `KnowledgeDocumentRepository` | Repository for the empty tables |
| `EmbeddingProvider` | Interface. Not registered |
| `VectorSearchProvider` | Interface. Not registered |

## Security

| Control | Where |
|---|---|
| JWT | Global guard. Health and the active questionnaire are exempt |
| Owner check | Every id lookup |
| DTO whitelist | Global validation pipe |
| Consent and age | Scan create |
| Auth required before analysis | Scan create and submit return `401` with no token. No analysis job exists |
| Signed URL expiry | Upload and avatar |
| Secrets | Environment only |
| Logs | `requestId`, user id, route, status. No passwords, tokens, or signed URLs |

## Out of this contract

- The Reading-your-skin checklist and any status past `ready_for_analysis`.
- Returning design-sample scores or “Clara noticed” sentences.
- Cart, checkout, orders, wishlist, payment, notifications, dermatologist booking.
- A second social provider besides Facebook.
- Medical diagnosis fields.
