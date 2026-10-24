# Rufus Shoe Store

Firebase-backed storefront with an independently configured React frontend and trusted Cloud Functions backend. Development connects to the `demo-rufus` emulators. Normal production builds connect to `rufus-website-540cb`; missing live data never falls back to samples.

## Layout

- Repository root: requested clone of `morluto/rea`, preserved. REA is a TypeScript CLI/MCP tool; its `website/public` is a static marketing site with plain CSS, not a shop or React starter. Its application-specific components were not suitable for commerce. The new app keeps the plain CSS approach and is independent of REA's root package/toolchain.
- `storefront/`: Vite + React + TypeScript application, modular Firebase SDK, route-split admin/checkout/product pages.
- `backend/functions/`: callable functions, transactional order service, Zod schemas, server HTML renderer and emulator integration tests.
- `backend/`: rules, indexes, emulator/hosting configuration, sample-only catalog and setup scripts.

Existing `web-front` and `web-back` directories were not changed. `/frontend` and `/backend` in the brief are workspace-relative, not operating-system root directories.

## Requirements

Node.js 22.19 or newer in the Node 22 line, npm, Java 21+ for emulators, and Chrome for browser tests. A Java runtime is available in ignored `.local-tools/java21` for this workspace; it is not a system installation. The emulator launcher automatically uses it when present. Other checkouts need Java 21 installed on PATH.

## Install and start locally

Run from the Git repository root (`frontend` in the original workspace):

```bash
npm --prefix storefront ci
npm --prefix backend ci
npm --prefix backend/functions ci
cp storefront/.env.example storefront/.env
npm --prefix backend run build
npm --prefix storefront run build
```

Normal development:

```bash
npm --prefix storefront run dev
```

This uses local emulators, which must be running (see below). Normal `npm run build` uses the real Firebase project. Restart Vite after changing environment values. `.env` is ignored; `.env.example` contains public web configuration only. `VITE_ADMIN_EMAIL` prefills the login form and grants no permissions. Authentication must have Email/Password and Anonymous sign-in enabled. Anonymous sign-in supports guest checkout.

For isolated emulator development, first build with `npm --prefix storefront run build:emulators`, then use the following two terminals.

Terminal 1:

```bash
cd backend
npm run emulators
```

On startup, this builds Functions and fills each missing sample document in products, slugs, categories, and settings. Existing documents are preserved, even when only part of the catalog is missing. It also restores the existing local admin account’s Auth claim. For a new admin account, supply `ADMIN_INITIAL_PASSWORD` (12+ characters) in the terminal environment; no password is stored in source. Clean shutdown exports data to ignored `.local-data/firebase`, which is imported on the next start. Keep this terminal open.

This runs `demo-rufus` only, with Auth 9099, Firestore 8080, Storage 9199, Functions 5001, Hosting 5000 and emulator UI 4000. The launcher uses the workspace-local Java runtime when present.

Terminal 2, from the repository root:

```bash
npm --prefix storefront run dev:emulators -- --port 5174
```

Open http://127.0.0.1:5174. For server-rendered product HTML, sitemap and HTTP 404 testing use http://127.0.0.1:5000 after building both packages. Vite's development fallback is not the production SEO server.

To fill any missing seed documents without overwriting existing data, run `npm --prefix backend run seed -- --if-empty`. This command defaults to local Firestore 8080 and Auth 9099 and refuses other host values. Raw `npx firebase emulators:start --project demo-rufus` does not auto-seed; our `npm run emulators` wrapper does.

For an intentional reset of sample products/settings, run `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm --prefix backend run seed`. The sample seeder only targets `demo-rufus` on the fixed loopback emulator ports. Both Auth and Firestore must be running. Standard seed overwrites the known sample documents; it does not delete other documents or reset existing Auth passwords. All sample prices, dimensions, stock, descriptions, illustrations and payment details are explicitly test data. Do not send money to the dummy UPI address. No reference-site images, branding or product copy are reused. Default warranty text is unapproved, so sample pages do not show a warranty badge.

## Admin bootstrap

Open `/admin`. Use Firebase email/password auth with an `admin: true` custom claim set by an operator. A matching email in the UI grants no privileges.

For a local emulator account, choose a password (12+ characters) without committing it:

```bash
read -rs ADMIN_INITIAL_PASSWORD
export ADMIN_INITIAL_PASSWORD
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 npm --prefix backend run admin -- rufus090420@gmail.com
unset ADMIN_INITIAL_PASSWORD
```

For an existing production Firebase Auth user, run `backend/scripts/admin.mjs` using Application Default Credentials or an authorized Firebase CLI login and `GOOGLE_CLOUD_PROJECT=rufus-website-540cb`. The script preserves existing users and never resets passwords. If the account is absent, create it securely in Firebase Authentication first. Keep service-account JSON out of the repo and frontend. Sign in again after changing claims. There is no public role-assignment endpoint.

## Configuration

`storefront/.env.example` contains the supplied public Firebase web configuration with whitespace removed. Local `.env` is ignored. `Vite development or `VITE_USE_EMULATORS=true`overrides the project ID and Storage bucket to`demo-rufus`, preventing emulator development from touching live services. Missing required client config produces a readable setup page. `VITE_SITE_URL`is a local fallback; the editable public`settings.siteUrl` controls canonical URLs and sitemap URLs.

Analytics is opt-in through the exported `enableAnalytics()` helper, which checks browser support and refuses emulator initialization. It is not automatically enabled or used to collect checkout data. Integrate consent before calling it in a real store.

See [backend/README.md](backend/README.md) for schemas, reservation rules, deployment preparation, billing, App Check and operations. See [CATALOG-SOURCES.md](CATALOG-SOURCES.md) for research provenance and limitations.

## Verification commands

```bash
npm --prefix storefront run lint
npm --prefix storefront run typecheck
npm --prefix storefront run build
npm --prefix backend run build
npm --prefix backend run lint
# Stop other emulators first; starts isolated emulators and runs backend tests:
npm --prefix backend test
# Start emulators + Vite first, then run real Chrome tests:
npm --prefix storefront test
```

Set `CHROME_PATH` if Chrome is not at `/usr/bin/google-chrome`. Browser tests create temporary admin/non-admin emulator accounts and reset the sample catalog. Do not point them at a live project. Playwright screenshots/traces are local ignored artifacts.

## Deliberate boundaries

Payment confirmation is manual: no bank API, payment gateway, SMS/OTP, shipping provider, tax engine, refund execution or transactional email service is configured. UTRs and receipts are never proof of payment. Paid-order refunds need an operator-controlled bank/refund workflow; the backend rejects cancellation of paid orders rather than silently dropping a payment. Deleted products are safely archived; existing variant IDs must be retained to preserve inventory history. Policies and commercial details are drafts until the owner supplies and approves them.

This is source code plus local verification, not a production-readiness certification. Production App Check, actual Firebase project permissions, bank reconciliation, billing, domains, public policies and real shipping operations require external configuration.

## First live setup and deployment

From `backend`, run `npx firebase login` with a Google account that can administer `rufus-website-540cb`. The store login password is separate from operator authorization. Enable Firestore, Email/Password and Anonymous Authentication, and initialize the configured Storage bucket in Firebase Console. Configure App Check/reCAPTCHA for the web app and set `VITE_APPCHECK_SITE_KEY` before building; trusted callables enforce App Check outside emulators. Register localhost as an authorized Auth domain for local development. Functions and Cloud Storage require an appropriate billing-enabled project (Blaze).

```bash
# From repository root; only creates settings if missing, never overwrites.
GOOGLE_CLOUD_PROJECT=rufus-website-540cb node backend/scripts/init-settings.mjs backend/initial-settings.json
GOOGLE_CLOUD_PROJECT=rufus-website-540cb npm --prefix backend run admin -- rufus090420@gmail.com
npm --prefix backend run build
npm --prefix storefront run build
cd backend
npx firebase deploy --project rufus-website-540cb --only firestore,storage,functions,hosting
```

`initial-settings.json` contains draft policies and disabled payments, with no invented product catalog, payment identity, shipping promise, or warranty. Review settings in `/admin` before enabling checkout. Existing settings and Auth users are preserved. Never run the sample seeder against the live project.

Browser tests use the explicitly emulator-enabled Vite server on port 5174; start the complete emulator suite and build with `build:emulators` first. Run `npm --prefix storefront run test:e2e` and `npm --prefix backend test` separately because both use emulator ports. Rebuild with normal `build` before deployment.

## Local data and settings troubleshooting

Use http://localhost:4000/firestore to inspect local collections. Firebase Console shows the separate live project, so local seed data will not appear there. Admin users live in the Auth emulator with an `admin: true` custom claim, not a Firestore users collection. Orders and audit documents are created by actual operations; empty collections need no placeholders.

If settings save shows connection refused on port 5001, Functions is not running. Stop old emulator sessions (Ctrl+C, allowing export to finish), then run `npm --prefix backend run emulators` and keep that terminal open. The launcher refuses occupied ports rather than seeding an incomplete/older suite. A complete suite exposes Auth 9099, Firestore 8080, Functions 5001, Storage 9199, Hosting 5000, and UI 4000. Also keep Vite running; use the URL printed by Vite.

To create the local admin on a fresh database and repair missing seed documents:

```bash
read -rsp 'Local admin password: ' ADMIN_INITIAL_PASSWORD; echo
export ADMIN_INITIAL_PASSWORD
npm --prefix backend run seed -- --if-empty
unset ADMIN_INITIAL_PASSWORD
```

The default local admin is `rufus090420@gmail.com`; override with `ADMIN_EMAIL` if needed. Sign out and back in after claim changes. Never add client Firestore write permissions to work around a stopped Functions emulator.
