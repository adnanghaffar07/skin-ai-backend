# Figma screen analysis — onboarding and skin dashboard

**Date:** 2026-10-28  
**File:** [Clara Skin AI](https://www.figma.com/design/nZAL6KFqTYEileWQ1cCga1/Clara-Skin-AI?node-id=30-6)  
**File key:** `nZAL6KFqTYEileWQ1cCga1`  
**Page:** Design (`30:6`)  
**How this was reviewed:** Figma metadata for page `30:6`, including each text layer name. This replaces the earlier screenshot-only review.

## Scope locked for this contract

The first API contract covers onboarding and the skin dashboard. These frames are in that contract:

| Area | Frames |
|---|---|
| Onboarding | Splash `31:49`, Welcome `35:740`, Questions 1–10, Face scan capture `100:2328`, Photo review `100:2371`, Sign in `37:822`, Sign up `38:1031` |
| Skin dashboard | Home `209:3219`, Your scan `309:2105`, Progress `209:3407`, Recommendations `209:3590`, Skin report `209:3739`, Routine `209:3910` and step detail `209:4062`, Profile `310:2917`, Personal details `209:4158`, Skin preferences `209:4651`, Privacy `443:766` |
| Catalog read used by those screens | Product details `309:2271` |

**Reading your skin** (`109:2411`) is not part of the pre-account flow. The customer does not enter analysis before Sign up or Sign in. Capture and photo review stay on the onboarding canvas. Submitting a photo for analysis requires a signed-in user. Phase 1 still stops a scan at `ready_for_analysis` and does not invent the checklist results.

Visible on the Design page and documented as later surfaces, not this contract: Cart `309:1926`, checkout, payment, order placed, track order, My Orders `310:3164`, Wishlist `310:3315`, Payment Method, Find a dermatologist `326:3725` and its booking frames, Consultation history, Add Notes, Appointments.

## Canvas order

```text
Splash
  → Welcome
  → Questions 1–10
  → Face scan capture
  → Photo review
  → Sign in / Sign up
  → Skin dashboard
```

`Reading your skin` sits between photo review and Sign in on the canvas and is skipped by this contract. Welcome contains the text “Already have an account? Sign in” with `hidden=true`.

Placeholder strings “Good morning, Al” and “For JudyS.” appear on several dashboard cards. They are unfinished layer text, not customer data and not catalog names.

## Design issues recorded, not frozen into seed data

| Frame | What the file shows | Contract treatment |
|---|---|---|
| Question 1 | Bands `25-34` and `34-44` both include 34 | Store both codes as drawn. Eligibility must not assume the bands are disjoint until design fixes them |
| Question 4 | “Sometime sensitive”, “Rarelr sensitive” | Codes `sometimes_sensitive` and `rarely_sensitive`. Proposed labels: “Sometimes sensitive”, “Rarely sensitive” |
| Question 7 | Option “Reduce appearance of fine lines” on a reactions question | Omitted from the accepted option list. It is the Question 5 goal copied onto this frame |
| Question 7 | “Yes, I know which ingredients/products” | No follow-up screen exists. The answer is stored as a code. The ingredient avoid-list is edited later on Skin preferences |
| Sign in / Sign up | A Facebook button and a second social button with no text (`Another Step login`) | Facebook is the only named social provider. The second provider is unresolved |
| Dashboard cards | “Good morning, Al”, “For JudyS.” | Ignored as placeholders |

Under 18 remains an age option. Face upload and analysis stay blocked for that band.

## Shared questionnaire chrome

Questions 1–10 use the header “Your Skin Profile”, a step label `01 / 10` through `10 / 10`, a back control, a hero image, a question, a helper line, option rows, and **Continue**. Hero captions (“A little about you”, and similar) are decoration.

## Onboarding screens

### Splash — `31:49`

Brand opener. Visible line: “Beauty Meets Intelligence”. No inputs. No stored data. Public.

### Welcome — `35:740`

Headline: “See your skin. Understand your glow.”  
Supporting lines: “Your skin journey, personalized.” and “Discover what your skin needs and build a routine that feels right for you.”  
Button: **Get started**.  
Hidden link: “Already have an account? Sign in”.

**Get started** opens an onboarding session and the active questionnaire. No skin answers are collected here.

### Question 1 — `38:1144` and selected state `39:1315`

| Item | Value |
|---|---|
| Step | 01 / 10 |
| Title | What is your age range? |
| Helper | Beautiful skin has no age. Let's find care for your stage of life. |
| Mode | Single select, required |
| Options | Under 18, 18-24, 25-34, 34-44, 45-54, 55+ |
| Stored | `questionnaire_answers`, then `skin_profiles.age_range` |
| AI | Recommendation constraint. `under_18` blocks face upload |

### Question 2 — `39:1384`

| Item | Value |
|---|---|
| Step | 02 / 10 |
| Title | How would you describe your skin? |
| Helper | Think about how your skin feels on a typical day. |
| Mode | Single select, required |
| Options | Oily, Dry, Combination, Normal / Balanced, Not sure |
| Stored | `skin_profiles.self_reported_skin_type` |
| AI | Vision context, RAG, routine family. This is not an observed skin type |

### Question 3 — `39:1462`

| Item | Value |
|---|---|
| Step | 03 / 10 |
| Title | What are your main skin concerns? |
| Helper | Choose everything that feels relevant to you. |
| Mode | Multi-select, required, at least one |
| Options | Acne & breakouts, Dark spots / pigmentation, Dryness & dehydration, Fine lines & wrinkles, Redness & sensitivity, Uneven texture |
| Stored | One answer row per option, then `skin_profile_concerns` |
| AI | Vision context, RAG, product concern match |

### Question 4 — `40:1556`

| Item | Value |
|---|---|
| Step | 04 / 10 |
| Title | How sensitive is your skin? |
| Helper | A gentler approach starts with understanding your skin. |
| Mode | Single select, required |
| Options in the file | Very sensitive, Sometime sensitive, Rarelr sensitive, Not sure |
| Stored | `skin_profiles.sensitivity_level` |
| AI | Ranking caution and a gentler routine when very sensitive. This does not exclude ingredients |

### Question 5 — `40:1630`

| Item | Value |
|---|---|
| Step | 05 / 10 |
| Title | What is your main skincare goal? |
| Helper | One intention. A routine that feels like you. |
| Mode | Single select, required |
| Options | Reduce breakouts, Improve skin hydration, Improve appearance of dark spots, Reduce appearance of fine lines, Build a healthy daily routine, Maintain my current skin |
| Stored | `user_preferences.primary_goal` |
| AI | Ranking and Phase 2 explanation. A goal cannot override an ingredient exclusion |

### Question 6 — `41:1699`

| Item | Value |
|---|---|
| Step | 06 / 10 |
| Title | What is your current skincare routine? |
| Helper | Starting fresh or refining your ritual? Both are beautiful. |
| Mode | Single select, required |
| Options | I don't have a routine, Only cleanser or face wash, Cleanser + moisturizer, Cleanser + moisturizer + sunscreen, I use multiple skincare products |
| Stored | `skin_profiles.current_routine_level` |
| AI | Routine template length |

### Question 7 — `41:1769`

| Item | Value |
|---|---|
| Step | 07 / 10 |
| Title | Any skincare reactions? |
| Helper | Help us understand what your skin prefers to avoid. |
| Mode | Single select, required |
| Accepted options | Yes, I know which ingredients/products; Yes, but I'm not sure what caused it; No known reactions; Not sure |
| Omitted option | “Reduce appearance of fine lines” |
| Stored | `skin_profiles.reaction_history` |
| AI | Context only. Hard ingredient exclusions come from Skin preferences, not from this answer |

There is no second screen that collects the ingredient name after “Yes, I know which ingredients/products”.

### Question 8 — `41:1838`

| Item | Value |
|---|---|
| Step | 08 / 10 |
| Title | How much would you like to spend on skincare per month? |
| Helper | Thoughtful skincare, at a budget that feels right. |
| Mode | Single select, required |
| Options | Under $20, $20–$50, $50-$100, $100+, No fixed budget |
| Stored | `user_preferences.monthly_budget_band` |
| AI | Ranking. “No fixed budget” skips the price penalty. Currency on screen is `$` |

### Question 9 — `42:1905`

| Item | Value |
|---|---|
| Step | 09 / 10 |
| Title | Which product types are you interested in? |
| Helper | Purpose: Learn shopping interests. Select all that apply. |
| Mode | Multi-select, required, at least one |
| Options | Cleansers, Moisturizers, Serums, Sunscreens, Exfoliants, Not sure — recommend for me |
| Stored | `user_preference_categories` |
| AI | Category filter before ranking. “Not sure — recommend for me” means no category filter |

### Question 10 — `43:1974`

| Item | Value |
|---|---|
| Step | 10 / 10 |
| Title | Would you like an AI-assisted face scan? |
| Helper | Our AI will analyze your skin in seconds to give you personalized insights. |
| Trust points | Detects concerns, AI-powered analysis, Personalized recommendations, Track your progress |
| Actions | **Start face scan**, **Continue without scan** |
| Stored | Answer `face_scan_opt_in`. **Start face scan** also records consent purpose `facial_image_processing` once the wording is the acceptance action |
| Rule | **Continue without scan** completes onboarding with no image. **Start face scan** opens capture. Analysis does not run on this step |

### Face scan capture — `100:2328`

Label “Live Scan”. Headline “Hold steady. almost there.” Caption “Reading tone, texture and glow”. Button **Capture**. Back control.

The photo stays on the device until the review step uploads it to private R2. No bytes are stored in PostgreSQL.

### Photo review — `100:2371`

Label “Photo review”. Headline “How does this look?” Caption “This is the photo we will analyze”. **Retake photo**. **Analyze this photo**.

**Retake photo** discards the preview. **Analyze this photo** uploads and confirms the object only when the caller is signed in. If the caller is still anonymous, the app saves the draft and opens Sign up or Sign in, then submits. The API does not start the Reading-your-skin checklist.

### Sign in — `37:822`

“Welcome back.” Subtitle “Your skin journey continues here.”  
Fields: Email address (“Enter your email”), Password (“Enter your password”), hidden Error labels.  
**Forgot Password?** **Sign in**. Divider “Or”. Social: Facebook, plus an unlabeled button.  
Footer: “New to Clara? Sign up”.

Password and OAuth tokens stay in Supabase Auth. Nest stores the profile against the JWT subject.

### Sign up — `38:1031`

“Sign up”. Subtitle “Save your insights and revisit your routine.”  
Fields: Full Name (“Enter your full name”), Email address, Password, each with a hidden Error label.  
**Sign up**. “Or”. Facebook and the same unlabeled social button.  
Footer: “Already have an account? Sign in”.

No phone, date of birth, or marketing checkbox on this screen. Date of birth is collected later on Personal details.

## Skin dashboard

Navigation on Home, Progress, Recommendations, Skin report, Routine, and Profile: **Home, Scan, Progress, Routine, Profile**.  
Your scan adds **Cart**. Cart has no API in this contract.

Sample person on the frames: greeting “Hello, Amelia”, profile name “Amelia Jane”, email `ameliajane43@gmail.com`. Treat these as design samples.

### Home — `209:3219`

“Good Morning”, “Hello, Amelia”.  
“Your latest skin check 16 October - Today”. Status “Healthy glow”, “Combination - Looking balanced”.  
Scores “Hydration 85%”, “Texture 91%”. Link “View full skin report”.  
“Today’s skin focus” / “Keep hydration steady” / “Your hydration score is looking good.”  
Morning chips: Cleanse, Moisturize, SPF. “Morning routine” / “2 of 3 steps complete”.  
A note about daily SPF. Week strip Mon–Sun. “Skin score - last 4 scans” / “Steady progress”.

Scores and “Clara noticed” style lines are shown only when a validated assessment exists. Phase 1 returns `assessment: null` and does not fill 85 or 91 from fixtures.

### Your scan — `309:2105`

“Your scan - 16 October”. **View full AI detail**.  
“Here is what Clara noticed about your skin.”  
Summary: “Combination skin”, “Comfortable barrier - 16 October”.  
Cards: Hydration / Balanced, Redness / Mild, on cheeks, Texture / Slightly Uneven, Fine lines / Soft, around eyes.  
Search: “Search products...”.

The observation copy is the Phase 2 assessed payload. Phase 1 does not return it as a finding. Product search uses the catalog. The card title text in the file is the placeholder “For JudyS.” and is not a product name.

### Progress — `209:3407`

“Your progress”. “Two weeks, side by side.”  
“What changed”: “Redness on cheeks looks calmer”, “Texture along the jaw feels smoother”, “Hydration held steady through the day”.  
“Overall skin score” “78/100”, with sample points “02 OCT -72” and “16 OCT -78”.  
“Today’s scan / 16 October - Combination skin” and “Previous scan / 2 October - Combination skin”.  
“Keep your journey going”. “Your next skin scan is set for 28 October.”  
Same four observation labels as Your scan.

Comparison text and scores require two validated assessments. The next-scan date is the preference field also shown on Skin preferences.

### Recommendations — `209:3590`

“Your plan”. “Made for your skin.”  
Morning: “Calm and protect” / “Cleanse, hydrate, protect”.  
Evening: “Repair and smooth” / “Remove, treat, nourish.”  
“Scan snapshot”. “A closer look at visible features from your scan.” “4 areas to explore”. “Comfortable barrier - 16 October”.  
Notes: Dark spots, Dryness indicators, Uneven texture, Redness, each with a short line.  
Footer: “AI observations are informational, not a diagnosis For concerning symptoms, consult a dermatologist.”

Phase 1 can return the deterministic morning/evening product plan with `basis: self_reported` and `explanation_status: not_implemented`. The observation notes wait for a validated assessment.

### Skin report — `209:3739`

“Skin analysis & progress”. Name “Amelia Jane”. “Scan comparison 1 Oct → 16 Oct”.  
Hydration / Improving, Redness / Stable, Uneven tone / Improving.  
“Previous scan - 1 Oct”, “Latest scan - 16 Oct”.  
“Morning / 3 steps”, “Evening / 2 steps”.  
**Share with dermatologist**. **Talk to dermatologist**.

Trend words and the dermatologist actions are later. Step counts can be read from the current routine.

### Routine — `209:3910` and `209:4062`

“Your routine”. “Friday, 16 October”. “Your skin, cared for daily”. “A routine shaped around your latest skin scan.”  
“Today’s progress” “3/5 steps”.

Morning steps on the frame: Cleanse / Gentle Cream Cleanser / 1 min; Treat / Vitamin C Brightening Serum / 2 drops; Nourish / Daily SPF 50 / Two finger lengths.  
Evening steps: Cleanse / Gentle Cream Cleanser / 1 min; Moisturise / Barrier Repair Cream / 2 drops.

Step detail: instruction text, duration, and **Mark as complete**. Example instruction: “Wet your face with lukewarm water Massage one pump for 60 seconds Rinse and pat dry”. Tip: “Keep water comfortably warm to protect your skin barrier.”

Completion is a real Phase 1 write. Product names on the routine must be catalog products, not free text invented by a client.

### Profile — `310:2917`

“Amelia Jane”, `ameliajane43@gmail.com`.  
Summary: Skin type Combination, Concerns Dryness and Uneven tone, Last scan 16 Oct 2026.  
Rows: Personal details (“Name, email, birthday”), My Orders, Wishlist, Payment Method, Skin preferences (“Goals and sensitivities”), Consultation history, Notifications, Appointments, Privacy & permissions (“Your data and camera access”).

This contract implements Personal details, Skin preferences, and Privacy. Orders, wishlist, payment, consultation history, notifications, and appointments are later.

### Personal details — `209:4158`

| Field | Sample |
|---|---|
| Full name | Amelia Jane |
| Email address | ameliajane43@gmail.com |
| Date of birth | 14 May 1996 |
| State/Province | Missouri |
| Your Address | 91821 Mante Ranch |
| Actions | Change Photo, Save changes |

Email is displayed from Auth and is not an alternate identity. Avatar upload is a profile image, not a face-scan object, and does not enter the vision pipeline.

### Skin preferences — `209:4651`

Goals shown: Hydration, Calm redness, Even tone, Clearer skin.  
Avoid list shown: Fragrance, Retinol, Essential oils.  
Schedule: Morning routine 8:00 AM, Evening routine 9:00 PM, Next skin scan 28 October.  
**Save preferences**.

This is the source of hard ingredient exclusions for the eligibility engine. It is editable after sign-in and is separate from Question 7.

### Privacy & permissions — `443:766`

Title area: “Your skin journey, your privacy.” The body covers camera access, photo library access, AI skin analysis, and personal data. The AI paragraph says results are estimates, not medical diagnoses, and should not replace a dermatologist. The data paragraph says personal information is not sold.

These four topics map to consent purposes the signed-in user can grant or revoke. Camera and photo-library OS prompts stay on the device. The server records the AI-analysis consent that scan submit checks.

## What Phase 1 must not return

The dashboard copy that describes what Clara noticed, numeric skin scores, “what changed” sentences, and the Reading-your-skin checklist are design samples. They are returned only from a validated assessment in a later phase. Phase 1 returns saved answers, catalog products, deterministic recommendation ids, routine steps, preferences, and truthful scan status.
