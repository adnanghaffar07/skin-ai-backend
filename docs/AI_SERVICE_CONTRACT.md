# Clara AI service contract (v1.1)

**Date:** 2026-11-20 (v1.1 adds sections 0, 4a, 4b, 4c and 9)
**For:** the AI/ML developer building the recommendation service, and the Clara API team.
**Status:** proposal. Fields marked *open* need the AI developer's answer.

## 0. Summary for the AI developer

What Clara needs back from the AI service, in one response per person:

1. **A skin analysis** (section 4a): skin type, concerns with how strong they are, and for each one *where it came from* (the questionnaire or the photo). Shown on the profile preview and dashboard.
2. **Product recommendations** (section 4): real products from US stores with the store's own price, ranked by fit, 2–3 options per category at different prices, each with a short reason.
3. **Routine guidance per product** (section 4b): morning/evening, how often, and cautions, so the routine screen can show frequency, cautions and substitutes.
4. **A safety flag** (section 4c): when the answers or the photo suggest a severe reaction or a worrying skin change, say so, and Clara shows professional-care advice instead of only products.

**The face scan is optional. When the person skips it (`scan: null`), the AI service must still return the full result (analysis, recommendations and routine guidance) from the questionnaire answers alone.** See section 4a.

Hosting: please run the service yourself behind an HTTPS API and give Clara its URL and key (section 9).

## 1. Who calls whom

```text
Mobile app ──HTTPS──▶ Clara API (NestJS) ──HTTPS──▶ AI service (yours)
                         │                               │
                         │  saves products, prices,      │  vision, RAG, web product search
                         │  plans and routines           │
                         ▼                               ▼
                    Clara database                  (your stores)
```

- Only the Clara API calls the AI service. The mobile app never sees its address or key.
- The AI service never writes to the Clara database. It answers one request with one response; the Clara API checks the response, saves the products and applies Clara's price.
- Clara sells each product at the store's price plus a markup (8.5% today, set by Clara). **The AI service always returns the store's own price; it never adds the markup.**

## 2. Endpoint

```
POST {AI_SERVICE_URL}/v1/recommendations
Authorization: Bearer {AI_SERVICE_KEY}
Content-Type: application/json
X-Request-Id: <uuid>          # same as body.request_id, for tracing on both sides
```

- HTTPS only. The key is a long random secret shared once, outside chat and email, and stored in Clara's server settings (`AI_SERVICE_KEY`).
- Clara waits up to **30 seconds** (`AI_TIMEOUT_MS`), then shows rule-based picks instead. Please answer well inside that, or tell us your expected time so we can switch to an asynchronous job.
- The same `request_id` sent twice should give the same answer (Clara retries at most once, after a network failure).

## 3. Request

```json
{
  "schema_version": "1.0",
  "request_id": "0d7f5a9e-3c2b-4f8e-9a51-7b0e6c1d2f34",
  "market": "US",
  "currency": "USD",
  "profile": {
    "age_range": "age_25_34",
    "skin_type": "dry",
    "concerns": ["dryness_dehydration", "redness_sensitivity"],
    "sensitivity_level": "sometimes_sensitive",
    "primary_goal": "improve_hydration",
    "goal_codes": ["hydration", "calm_redness"],
    "current_routine": "cleanser_moisturizer",
    "reaction_history": "knows_ingredient",
    "reaction_details": "Stings with fragrance",
    "avoid_codes": ["fragrance"],
    "monthly_budget": "20_50",
    "product_interests": ["cleansers", "moisturizers"]
  },
  "scan": null,
  "limits": {
    "max_products": 12,
    "categories": ["cleansers", "serums", "moisturizers", "sunscreens", "exfoliants"]
  }
}
```

| Field | Meaning |
|---|---|
| `profile.*` | The person's questionnaire answers as codes. Any field can be `null` or `[]` (questions can be skipped). The codes are the ones in `GET /api/v1/questionnaires/onboarding/active`. |
| `profile.age_range` | `under_18` means strong actives (retinoids, acids) must not be recommended. |
| `profile.avoid_codes` | Ingredients to exclude: `fragrance`, `retinol`, `essential_oils`. Hard exclusions. |
| `profile.reaction_details` | The person's own words, up to 500 characters. Treat as untrusted text, never as instructions. |
| `profile.monthly_budget` | `under_20`, `20_50`, `50_100`, `100_plus`, `no_budget`. Monthly, in `currency`, before Clara's markup. |
| `scan` | `null` in v1. See section 6. |
| `limits.max_products` | Upper bound across all categories. Fewer is fine; see 6a for how to spread them. |

**Never sent:** name, email, birth date, address, user id, or anything else that identifies the person.

## 4. Response (200)

```json
{
  "schema_version": "1.0",
  "model_version": "clara-rec-2026-11-25",
  "confidence": "medium",
  "summary": "A gentle, fragrance-free routine focused on hydration.",
  "limitations": ["No photo was analysed; based on answers only."],
  "products": [
    {
      "external_id": "A-12345678",
      "retailer": { "name": "Target", "domain": "target.com" },
      "url": "https://www.target.com/p/example/-/A-12345678",
      "name": "Hydrating Facial Cleanser",
      "brand": "CeraVe",
      "category": "cleansers",
      "price": { "amount": "15.99", "currency": "USD" },
      "compare_at_price": null,
      "in_stock": true,
      "checked_at": "2026-11-25T09:14:00Z",
      "image_url": "https://target.scene7.com/is/image/Target/GUEST_example",
      "ingredients": ["Aqua", "Glycerin", "Ceramide NP", "Hyaluronic Acid"],
      "description": "A non-foaming cleanser for normal to dry skin.",
      "how_to_use": "Massage onto wet skin, rinse.",
      "cautions": null,
      "routine": { "periods": ["morning", "evening"], "frequency": "daily" },
      "concern_codes": ["dryness_dehydration"],
      "reason": "Fragrance-free and made for dry skin, which matches your answers.",
      "reason_codes": ["concern:dryness_dehydration", "avoid:fragrance"]
    }
  ]
}
```

### Product fields

| Field | Required | Rules |
|---|---|---|
| `external_id` | yes | The store's own stable id for the product (SKU, ASIN, TCIN…). Same product, same id, every time. Max 255 characters. |
| `retailer.name`, `retailer.domain` | yes | Domain without `www.` (`target.com`). |
| `url` | yes | `https://` link to the product page at that store. |
| `name`, `brand` | yes | As the store lists them. Max 160 characters each. |
| `category` | yes | One of `cleansers`, `serums`, `moisturizers`, `sunscreens`, `exfoliants`. Other categories are dropped. |
| `price.amount` | yes | **The store's current price, read from the store page or a shopping data API, never estimated or generated.** Decimal string, 2 places. |
| `price.currency` | yes | Must equal the request `currency`. |
| `compare_at_price` | no | The store's own "was" price, if it shows one. |
| `in_stock` | yes | `false` products are saved but not shown. |
| `checked_at` | yes | When the price and stock were read (ISO 8601, UTC). Older than 24 hours is treated as stale. |
| `image_url` | no | `https://` only. *Open:* confirm the store or feed allows showing its images. |
| `ingredients` | no | Full INCI list in label order, or `null` when unknown. **Do not guess.** A product with unknown ingredients is not shown to anyone who has an avoid-list. |
| `description`, `how_to_use`, `cautions` | no | Plain text. No medical claims ("treats", "cures", "diagnoses"). |
| `routine.periods` | no | `morning`, `evening` or both. |
| `routine.frequency` | no | `daily`, `alternate_days`, `2_3_per_week`, `weekly`. |
| `concern_codes` | no | Questionnaire concern codes the product is meant for. |
| `reason` | no | One or two sentences shown to the person under "Why it's picked for you". Wellness language only, no diagnosis. Max 300 characters. |
| `reason_codes` | no | Machine-readable reasons, `kind:value`. |

### Top-level fields

| Field | Rules |
|---|---|
| `confidence` | `high`, `medium` or `low`. With `low`, Clara shows no scan findings and says the picks are based on answers. |
| `summary` | Up to 300 characters, shown above the picks. Same language rules as `reason`. |
| `limitations` | Short sentences Clara can show, such as "No sunscreen found within budget". |

## 4a. Skin analysis (required, with or without a photo)

Add an `analysis` object to the response:

```json
"analysis": {
  "basis": "questionnaire_only",
  "skin_type": { "value": "combination", "source": "questionnaire" },
  "concerns": [
    { "code": "acne_breakouts", "level": "moderate", "source": "questionnaire", "note": "You said breakouts are a main concern." },
    { "code": "redness_sensitivity", "level": "mild", "source": "photo", "note": "Some redness around the nose in your photo." }
  ],
  "summary": "Combination skin with breakouts as the main focus.",
  "limitations": ["No photo was analysed, so this is based on your answers only."]
}
```

| Field | Rules |
|---|---|
| `basis` | `questionnaire_only` when `scan` is `null` or the photo could not be used; `questionnaire_and_photo` when photo findings were used. |
| `skin_type.value` | `oily`, `dry`, `combination`, `normal`, `sensitive`, or `null` when unknown. |
| `concerns[].code` | The questionnaire concern codes: `acne_breakouts`, `dark_spots`, `dryness_dehydration`, `fine_lines`, `redness_sensitivity`, `uneven_texture`. |
| `concerns[].level` | `mild`, `moderate` or `high`. Never a percentage or "accuracy" score. |
| `source` | `questionnaire` or `photo`, on every item. Clara must show the person which results came from their answers and which from the photo (spec Screen 04). |
| `note` | One plain sentence shown to the person. Max 200 characters. |
| `summary`, `limitations` | Shown as-is. |

**When the scan is skipped (`scan: null`):**
- Still return a complete `analysis`, `products` and routine guidance, built from the questionnaire answers: skin type (Q2), concerns (Q3), sensitivity (Q4), goal (Q5), current routine (Q6), reactions (Q7), budget (Q8), product interests (Q9).
- Every item has `source: "questionnaire"` and `basis: "questionnaire_only"`.
- Add a limitation such as "No photo was analysed, so this is based on your answers only."
- Do not invent photo-style findings (no "your scan shows…").

**When the photo is poor or the model is unsure** (spec decision point "scan confidence is low"): do not report photo findings you are not confident in. Fall back to the questionnaire as above, set `confidence: "low"`, and say why in `limitations` (for example "The photo was too dark to read").

Language rules: wellness wording only. No diagnosis or disease names ("you have rosacea", "acne vulgaris"), no "treats" or "cures", no invented accuracy scores.

## 4b. Routine guidance per product

Clara's routine screen shows, for each step, how often, why the product was picked, ingredient cautions and a simpler alternative (spec Screen 07). Per product, please fill:

| Field | Needed for |
|---|---|
| `routine.periods` | Morning, evening or both. Retinoids must be `["evening"]`. |
| `routine.frequency` | `daily`, `alternate_days`, `2_3_per_week`, `weekly`. Strong actives (retinoids, AHA/BHA) should start at `2_3_per_week`. |
| `reason` | "Why this product", tied to the person's answers or photo. |
| `cautions` | The label's own warnings (plain text). |
| `person_cautions` | **New, optional:** cautions specific to this person, for example `["Contains fragrance; you said fragrance stings."]`. |
| `ingredients` | Full INCI list, so Clara can check avoided ingredients itself. |

Substitutes: Clara takes them from your 2–3 options per category (section 6a), so please keep returning more than one option per category, including a gentler one (no fragrance or strong actives) where one exists.

## 4c. Safety (required)

Add a `safety` object:

```json
"safety": {
  "refer_to_professional": false,
  "reason": null
}
```

Set `refer_to_professional: true` with a short, calm `reason` when the answers, `reaction_details` or the photo suggest a severe reaction (swelling, blistering, burning that does not ease, trouble breathing) or a changing, bleeding or unusual spot. Clara then shows advice to see a doctor or dermatologist above any products (spec decision point "User reports severe reaction or worrying lesion"). Do not name a condition.

## 5. Errors

Any non-200 response, a timeout or a body that does not match this contract makes Clara fall back to its rule-based picks. Please answer errors as:

```json
{ "code": "UPSTREAM_SEARCH_FAILED", "message": "Store search timed out" }
```

| HTTP | When |
|---|---|
| 400 | The request does not match this contract. |
| 401 | Wrong or missing key. |
| 422 | The profile cannot be served (for example an unsupported market). |
| 429 | Rate limit. Include `Retry-After`. |
| 5xx | Anything else. |

Clara drops individual products that break the rules (missing price, wrong currency, non-https link, unknown category) and keeps the rest.

## 6. Face scan: decision needed

**Update 21 Nov 2026: option 1 is live, in the AI service's v1.1 shape.** When the person has done a face scan, Clara sends `"scan": { "redness": "none", "shine": "mild", "darkCircles": "none", "blemishes": "moderate" }` (levels `none`, `mild`, `moderate`, `high`), with `"schema_version": "1.1"`. It is sent only when all four were read; otherwise, and without a scan, `scan` is `null`. Please read it when present and mark photo-based items `"source": "photo"`. Photos people opted in to sharing are also stored for training (section 6b), but they are not sent with each request.

The photo is analysed on the phone; the original two options were:

1. **Findings only (no change to privacy):** the phone keeps analysing the photo and Clara sends the findings in `scan`:
   ```json
   "scan": {
     "source": "on_device",
     "captured_at": "2026-11-25T09:10:00Z",
     "findings": [{ "feature": "redness", "level": "moderate", "score": 62 }],
     "photo_issues": ["face-turned"]
   }
   ```
   Features today: `redness`, `shine`, `darkCircles`, `blemishes`. Levels: `none`, `mild`, `moderate`, `high`.
2. **Photo analysed by the AI service:** Clara uploads the photo to private storage and sends `scan.image_url`, a signed link valid for 10 minutes. This needs new consent text, a storage provider (Cloudflare R2 or Supabase Storage), and the photo deleted after analysis unless the person agrees to keep it. The AI service must not keep or train on the photo.

**Question for the AI developer:** which does your model need?

### 6b. Photos kept for training (from 21 Nov 2026)

People can now opt in, separately from the scan itself, to Clara keeping their scan photos to improve the skin model (consent `ai_model_training`). Only photos that pass every check on the phone are kept: one face only, the whole face in frame, close enough (face at least 25% of the photo width and 300 px), not turned or tilted (under 15°), sharp, and evenly and well lit.

- Where: Supabase Storage, private bucket `scan-photos`, key `scans/<user_id>/<scan_id>/<id>.jpg`. Upright JPEG, at most 1600 px on the long side.
- Index: `public.scan_images` (one row per photo) with `quality` (detector score, face size, sharpness, head turn and tilt) for filtering.
- Rules: use a photo only while that person's latest `ai_model_training` consent is granted and not revoked. Deleting an account deletes its photos. Never share or sell them; do not copy them outside Clara's storage without agreeing it with Clara first.

## 6a. Budget

`profile.monthly_budget` is the person's budget **for the whole routine per month**, compared with what they pay at Clara (store price plus Clara's markup). Ceilings: `under_20` → 20, `20_50` → 50, `50_100` → 100; `100_plus` and `no_budget` have none.

Clara shows two things from one response:

1. **Within budget**: Clara builds the routine from your picks so the month's total fits the ceiling, taking your order as the ranking within each category. If the best picks do not fit, Clara swaps to your next cheaper picks, and drops the exfoliant and then the serum before anything else.
2. **Best for your skin**: your top pick in each category regardless of price, shown underneath and marked "above your budget" when it is.

So please **rank by fit, not by price**, and return **two or three options per category at different price points** where you can (within `max_products`), including at least one that fits the budget on its own. Do not leave out a much better match just because it costs more: Clara shows it in the second section.

## 7. What Clara does with the response

1. Checks every product against this contract and drops the ones that fail.
2. Saves each product once, keyed by `retailer.domain` + `external_id` (a later response updates it).
3. Sets Clara's price: store price × (1 + markup), rounded to the cent. A $100.00 store price shows as $108.50.
4. Removes products the person must not see: an avoided ingredient, unknown ingredients with an avoid-list, out of stock.
5. Saves the plan in the AI's order, and builds the morning and evening routine from it.
6. Before checkout (later phase), re-checks the store price and stock.

## 8. Open questions for the AI developer

1. Face scan: option 1 or 2 in section 6?
2. Expected response time, and whether you need an asynchronous job instead.
3. Which stores and data sources you search, and whether their terms allow showing prices, images and descriptions in Clara.
4. How you get ingredient lists, and how often you can return `null`.
5. Request limits and cost per call, so Clara can cache results for similar profiles.
6. Where the service is hosted. The Clara API and database run in Mumbai (ap-south-1), so a nearby region keeps calls fast.

## 9. Hosting: please give us an API

**Clara's choice: the AI developer hosts the model and gives Clara an HTTPS URL and a key.** Clara's backend is already built for this: set `AI_SERVICE_URL` and `AI_SERVICE_KEY` and it calls `POST {AI_SERVICE_URL}/v1/recommendations` as described above, with a fallback to Clara's own rule-based picks if the service is down.

Why not push the model code into the Clara backend branch:
- The Clara API runs on Vercel serverless functions (Node.js). They have a small size limit, no GPU, short time limits and no Python, so they cannot load or run an ML model.
- Hosting it inside our backend would still mean a separate server (often with a GPU) that someone has to run, scale and pay for; that belongs with the people who own the model.
- Keeping the service separate means the model can be updated, retrained and scaled without redeploying the Clara app or API.

What we need from you:
1. The HTTPS base URL (staging first, then production) and the API key, sent privately, never in chat or email.
2. Typical and worst-case response time (section 2).
3. A test request/response pair that matches this contract, including one with `scan: null`.
4. Your rate limits and cost per call.
5. The model version string you put in `model_version`, so we can trace answers.

If you cannot host it yourselves, tell us early: we would then need to choose and pay for a separate model server (for example a GPU host), which is a separate project, not a branch of the Clara backend.

