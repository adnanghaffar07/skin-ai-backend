# Clara Skin API

NestJS REST API for the Clara Skin AI mobile app. Base path `/api/v1`, Swagger UI at `/api/docs`.

- Phase status and what is built: [docs/API_PHASE_STATUS.md](docs/API_PHASE_STATUS.md)
- Full Phase 1 contract: [docs/PHASE1_API_SPECIFICATION.md](docs/PHASE1_API_SPECIFICATION.md)

Sign-up and sign-in stay on Supabase Auth. The app sends `Authorization: Bearer <Supabase access token>`. This API never sees a password.

## Run it

```bash
npm install
cp .env.example .env      # then fill in DATABASE_URL
npm run start:dev
```

Node 22 or newer. Without `DATABASE_URL` the server starts, `/health` answers, and database routes return 503.

## Environment

| Variable | Required | Meaning |
|---|---|---|
| `SUPABASE_URL` | yes (has a default) | Used to verify access tokens |
| `DATABASE_URL` | for any data route | Postgres connection string. Never commit it |
| `DATABASE_SSL_CA` | no | PEM text of the database CA. When set, the TLS certificate is verified |
| `RATE_LIMIT_PER_MINUTE` | no, default 120 | Per client IP. `/health` is not limited |
| `CORS_ORIGINS` | no | Comma-separated browser origins. Empty in production means CORS is off. The mobile app does not need it |
| `PORT` | no, default 3000 | |

## Database

Migrations are plain SQL in `supabase/migrations/`, applied in file order. Nothing applies them automatically, so run each new file on the database before deploying code that needs it.

`supabase/seeds/dev_test_products.sql` fills a dev database with 20 test products (brand "Glow Skin (test)", slugs starting `test-`) so the catalogue, recommendations and routine can be tried. Run it only on a dev database. The last lines of the file show how to remove them.

## Checks

```bash
npm run build
npm run lint
npm test            # unit tests
npm run test:e2e    # app boots and answers /health
```

Unit tests use fakes. They do not touch a database or storage, so test the SQL and the photo upload against a dev database before release.

## Code layout

Each feature is a folder with `controller`, `service`, `repository` (raw SQL through `DatabaseService`) and `dto/`. Owner mismatches answer 404. A body field named `user_id` is rejected.

`src/storage/` holds the photo storage interface. Until a provider is bound in `StorageModule`, photo routes answer 503.

## Security and privacy notes

- Every route needs a valid token except `/health` and the active questionnaire.
- Security headers, `Cache-Control: no-store`, a per-IP rate limit and `x-powered-by` removal are applied in `src/app.setup.ts`.
- `audit_events` records who called which endpoint and the status code. It stores no request or response bodies.
- Server errors are logged with method, path (no query string), request id and message only.
- Not covered by code: HTTPS (the API needs a domain and TLS in front of it), vendor agreements for health data, and any SOC 2 or HIPAA certification.
