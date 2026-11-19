# Clara AI service contract (v1)

**Date:** 2026-11-20
**For:** the AI/ML developer building the recommendation service, and the Clara API team.
**Status:** proposal. Fields marked *open* need the AI developer's answer.

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

Today the photo is analysed on the phone and **never leaves it**; the consent screen says so. Two ways forward:

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
6. Where the service is hosted (EU data is involved: the Clara database is in Ireland).
