# Supabase Backend Blueprint

This app now targets Supabase directly instead of the in-memory demo server.

## What changed

- Email/password auth uses Supabase Auth.
- Google sign-in uses Supabase OAuth and the Android deep link `com.miitjee.digital://auth/callback`.
- User roles and approvals live in `public.profiles`.
- Tests, questions, attempts, leaderboard data, and analytics come from Postgres tables, views, and RPCs.
- Admin mutations are guarded by RPCs plus row-level security.
- PDF-to-questions extraction is handled by the `pdf-to-questions` Edge Function.
- Mixed question types are supported: `mcq` and `integer`.
- Students can review every submitted answer with explanations and images.

## Core schema

- `profiles`: app identity, role, approval status, batch assignment, rank, and learning metadata.
- `batches`: batch ownership and academic labeling.
- `courses`: featured course catalog shown in the app.
- `tests`: weekly and scholarship tests.
- `test_questions`: MCQ question bank.
- `test_attempts`: scored submissions.
- `test_attempt_answers`: answer audit trail for analytics and review.
- `rate_limit_events`: a simple foundation for per-action throttling.

## Auth, roles, and permissions

- Signup writes role intent into `raw_user_meta_data`.
- `handle_new_user()` provisions `profiles` automatically.
- Admin signups begin with `approval_status = 'pending'`.
- `is_admin()` is the gate used by privileged RPCs.
- RLS restricts student reads to their own profile/attempts and their allowed tests.

## API design

The mobile app calls:

- direct REST selects for read-heavy screens:
  - `courses`
  - `test_catalog`
  - `test_questions`
  - `leaderboard_live`
  - `test_attempt_summaries`
  - `admin_user_directory`
  - `admin_analytics`
- RPCs for write and privilege-sensitive flows:
  - `create_test_with_questions`
  - `assign_batch_and_role`
  - `approve_admin_user`
  - `submit_test_attempt`

This keeps app code simple while moving business rules into Postgres where RLS can enforce them.

## Caching strategy

- Client-side:
  - the app store caches question payloads by `testId`
  - bootstrap fetches are grouped to reduce round trips
- Database-side:
  - `admin_analytics` is a materialized view for expensive aggregate reads
  - `leaderboard_live` and `test_catalog` are view-based read models
- Edge caching:
  - for high-traffic public scholarship listings, place Supabase behind a CDN or edge gateway and cache anonymous-safe GETs briefly

Recommended TTLs:

- `courses`: 10 minutes
- `test_catalog`: 30 to 60 seconds
- `leaderboard_live`: 15 to 30 seconds
- `admin_analytics`: refresh on write or every 1 to 5 minutes from a scheduled job

## Rate limiting

Supabase Postgres is not a full API gateway, so use layered limits:

1. Gateway/WAF limits:
   - limit auth bursts per IP
   - protect `/auth/v1/token` and `/auth/v1/authorize`
2. Edge Function limits:
   - use for sensitive admin flows if you later move them out of SQL RPCs
3. Database event logging:
   - `rate_limit_events` can support SQL-enforced caps for actions like `submit_test_attempt`

Suggested starting limits:

- sign-in: `5/minute` per IP + email tuple
- sign-up: `3/10 minutes` per IP
- test submission: `10/minute` per user
- admin mutations: `30/minute` per approved admin

## Load balancing

Supabase manages database connection routing, but app-level load still benefits from shaping:

- keep reads on views and narrow selects
- use RPCs for multi-step writes
- refresh `admin_analytics` asynchronously if write volume grows
- move very high-volume analytics or exports into Edge Functions plus background jobs
- use a separate analytics pipeline if raw event volume becomes much higher than transactional data

## Environment and secrets

Mobile app:

- only expose `SUPABASE_URL`
- only expose `SUPABASE_ANON_KEY`
- never ship the service role key in the app

Supabase project:

- keep service role keys only in Edge Functions, CI, or secure server runtimes
- store Google OAuth client secrets only in Supabase/Auth provider config
- rotate anon and service keys on a schedule
- use separate projects for dev/staging/prod

## Setup order

1. Run `supabase/migrations/20260405_backend_rebuild.sql`.
2. Run `supabase/migrations/20260405_access_and_registration_flow.sql`.
3. Run `supabase/migrations/20260405_ai_exam_platform.sql`.
4. Run `supabase/migrations/20260406_storage_assets.sql`.
5. Create your Google provider in Supabase Auth.
6. Add redirect URL `com.miitjee.digital://auth/callback`.
7. Deploy Edge Function `pdf-to-questions`.
8. Add these Supabase function secrets:
   - `OCR_SPACE_API_KEY`
   - `OPENAI_API_KEY` or `GEMINI_API_KEY`
   - optional: `OPENAI_MODEL`, `GEMINI_MODEL`
9. Seed `courses`.
10. Put real values into `.env`.
11. Build and test email auth, Google auth, student visibility, admin approval, PDF import, integer answers, and review flow.

## Storage setup

- `exam-assets` is the shared bucket for uploaded PDFs and question images.
- The bucket is public so OCR.Space and the app can read uploaded files directly by URL.
- Authenticated users can upload files, but admin-only publishing still stays protected by the app role checks and SQL RPCs.
- Supported uploads:
  - PDF papers up to 50 MB
  - question images in `jpg`, `png`, `webp`, and `heic`

Function deployment details:

- see [functions/README.md](./functions/README.md)
- use `GEMINI_API_KEY` with the full key value
