# SocietyOne Backend

Express + PostgreSQL API for the SocietyOne housing society management app.

This service was split out from the original `societyone-smart-management`
monolith. It is a pure JSON API — it no longer serves the frontend build or
runs the Vite dev middleware. Pair it with `societyone-frontend`.

## Prerequisites

- Node.js 18+
- A PostgreSQL database (e.g. a Supabase project)

## Setup

1. Install dependencies:
   ```
   npm install
   ```
2. Copy `.env.example` to `.env` and fill in the values:
   ```
   cp .env.example .env
   ```
   - `DATABASE_URL` is required — the server will not connect to Postgres without it.
   - `RESEND_API_KEY` is required to send signup verification emails (safe to omit in dev; email dispatch is skipped with a warning if unset).
   - `CORS_ORIGIN` should match the URL the frontend runs on (defaults to `http://localhost:5173`).
3. Run the dev server:
   ```
   npm run dev
   ```

The API listens on `http://localhost:3001` by default (override with `PORT`).
On first boot it bootstraps all tables and seeds demo data if the tables are empty.

## Project structure

```
src/
  index.ts          # Express app setup, CORS, route mounting, server start
  db/
    pool.ts         # pg Pool instance
    schema.ts       # Table bootstrap (CREATE TABLE IF NOT EXISTS, migrations, seed data)
  services/
    email.ts        # Resend verification email sending
    storage.ts       # Supabase URL resolution helper
  utils/
    timeSlots.ts     # Time-range overlap helpers used by bookings/facility-blocks
  routes/
    *.ts             # One router file per domain (users, invoices, bookings, etc.)
```

## Build & run in production

```
npm run build
npm start
```

## Security notes carried over from the migration

- Previous hardcoded fallback secrets (a Postgres connection string with a
  plaintext password, and a Resend API key) were removed. This service now
  **requires** `DATABASE_URL` to be set via environment/`.env` — there is no
  fallback.
- `getSupabaseUrl()` now throws a clear error instead of silently falling
  back to a specific Supabase project if `SUPABASE_URL`/`DATABASE_URL` are
  unset.
