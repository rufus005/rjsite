> Normal development uses the local demo-rufus emulators. See [Rufus setup](../RUFUS-README.md) for explicit emulator commands, safe initialization, admin bootstrap, and deployment.

# Firebase backend setup and operations

## Services and environment

Use Node 22, Firebase Auth (Anonymous for seamless guests, Email/Password for admins), Firestore Native mode, Storage, Cloud Functions v2, Cloud Scheduler, and Firebase Hosting. The checked-in `.firebaserc` defaults to the live project; the emulator launcher always passes `--project demo-rufus`. Use an explicit `--project rufus-website-540cb` only when an authorized operator is ready to deploy; development commands must stay on the demo project.

A Blaze billing plan is required for Cloud Functions deployment and scheduled functions; configure billing budgets/alerts. Confirm Storage billing requirements in the Firebase console. No production services have been enabled or deployed by this implementation.

Functions use Application Default Credentials in production. No service account is sent to the browser. `.env.example` documents optional operator variables; no secrets are required for emulators. Public Firebase client keys are identifiers, not authorization controls.

## Security and abuse protection

All Firestore client writes are denied, including admin writes. Catalog/settings/category changes, inventory adjustments and order transitions go through claim-checked callable functions and strict Zod schemas. Public queries require `published == true`. Only `settings/public` is public; `settings/private`, orders and audit are admin-readable only. Guest lookup uses a random 256-bit token hashed on the order, transported in a URL fragment and passed to a callable. Order IDs/references alone grant no access. Treat lookup URLs as bearer credentials; do not share them. Referrer policy is `no-referrer`.

Guests authenticate anonymously without an account-registration screen. Storage receipts are tied to the anonymous UID and order. Owner/admin read uses authenticated `getBlob`, never `getDownloadURL`. The receipt cannot be replaced after creation. Public product/banner/QR images permit admin-only JPEG/PNG/WebP uploads below 5 MiB. Receipt upload has the same size/type restriction. A changed device can look up an order with its token but cannot upload a receipt without the original guest session.

App Check is enforced on every callable outside the Functions emulator. Register the web app with reCAPTCHA Enterprise, set `VITE_APPCHECK_SITE_KEY` to its site key, configure allowed domains, and enable enforcement for Firestore/Storage as appropriate in Firebase console after checking metrics. Never ship an App Check debug token. Emulator calls bypass App Check only through the emulator's environment flag. See https://firebase.google.com/docs/app-check/cloud-functions.

Order creation rate limits are transaction-backed: 12 attempts per authenticated UID per hour, 30 per IP per hour; quotes 120 per UID/hour; lookup 80/IP/hour. App Check adds attestation but does not replace monitoring. Tune limits for your traffic. Configure TTL for `rateLimits.expiresAt` through the included indexes configuration, and add retention policies for private customer/receipt data consistent with approved policies. Idempotency keys are permanently retained in this implementation to avoid duplicate orders after late retries; define any future retention cutoff alongside checkout retry guarantees.

## Schema

All monetary values are integer paise, not floating-point rupees. See `functions/src/schema.ts` for authoritative allowed fields and bounds.

- `products/{id}`: id, unique slug, name, description, type (`rack`, `storage`, `footwear`), category, brand, SKU, published/sample flags, ordered images, variants (id/name/color/optional size/SKU/price/originalPrice/available stock/images), specifications, warranty text + approval, source URLs and SEO. A `slugs/{slug}` server-only document atomically enforces uniqueness. Store-level product fields apply to all variants. Prices/inventory belong to variants. Never remove a historical variant; set stock to zero to retire it.
- `categories/{id}`: id/name/published. Category labels are assigned on products; rename product labels deliberately when renaming a category. Brand is a product field and public filter.
- `settings/public`: store identity/contact/site URL, banner/image, shipping fee, public COD/UPI instructions and parameters, policy drafts/approval. UPI recipient details are intentionally public, never bank credentials.
- `settings/private`: reserved for server/operator-only settings; do not put secrets into the public document. Prefer Secret Manager for future backend credentials.
- `orders/{id}`: reference, owner UID, token hash, buyer address/contact, authoritative snapshot lines/totals/payment settings, payment method/status, fulfillment status, UTR, duplicate-reference review flag, receipt path, creation/expiry timestamps, reservation flag and shipment tracking.
- `idempotency/{hash(uid+key)}`: payload fingerprint and previous result (including private token), server-only. Same key and payload returns the same order; reuse with altered details fails.
- `paymentReferences/{sha256(reference)}`: bounded recent order IDs for duplicate detection. A repeated reference is a review flag, never confirmation of payment.
- `audit/{id}`: actor/action/time/target and before/after changes. Private, append-only from backend. Includes catalog and settings changes and order transitions.
- `rateLimits/{hash}`: request counters and expiry, server-only.

## Stock and state lifecycle

`quoteOrder` fetches current settings and product variants. Checkout submits expected total and quote fingerprint. `createOrder` re-reads everything transactionally, checks stock, compares the quote, validates input, reserves all lines atomically and writes order + idempotency result. Client-provided payment/admin fields are rejected.

| Event                      | Payment               | Fulfillment / inventory                                        |
| -------------------------- | --------------------- | -------------------------------------------------------------- |
| UPI submitted              | pending_verification  | confirmed; stock held 30 minutes                               |
| COD requiring verification | unpaid                | pending_verification; stock held 24 hours                      |
| COD without verification   | unpaid                | confirmed; stock held until fulfillment/cancellation           |
| Admin approves bank record | paid                  | reservation no longer expires                                  |
| Admin confirms COD         | unpaid                | confirmed; reservation no longer expires                       |
| Processing                 | unchanged             | requires confirmed COD or verified UPI                         |
| Ship with tracking         | unchanged             | processing → shipped; reservation consumed                     |
| Deliver                    | unchanged             | shipped → delivered                                            |
| Record COD collection      | paid                  | permitted only for delivered, unpaid COD                       |
| Reject / cancel / expire   | unchanged or rejected | cancelled/expired; restore only if reservation flag still true |

The scheduled expiry function runs every five minutes in production. Expiry and manual cancellation use the same transaction and cannot double-restock. Late approval of an already elapsed reservation is rejected. Once shipped, stock is consumed; no automatic restock is allowed. Paid order cancellation is rejected pending a separately implemented refund-recording process. Confirmed orders without an expiry remain reserved until shipped or explicitly cancelled. Monitor these from the admin panel.

Scheduler execution is not automatic in local emulator sessions; integration tests call the same `expire()` service directly. For manual local expiry use the emulator-only helper documented below.

## SSR, SEO and Hosting

The frontend build copies its HTML shell to `functions/public/index.html`. Firebase Hosting serves Vite assets and forwards application routes to the `storefront` HTTP function. It renders real public catalog names/descriptions/prices/specifications and structured data into the HTML before the React client takes over. It returns HTTP 404 for unknown routes/products. It does not require a separate Express server.

`/sitemap.xml` reads currently published products on request, excluding sample products. `/robots.txt` excludes private areas. Rendering uses `Cache-Control: no-store`, so catalog and settings changes appear without a redeploy or a stale sitemap build. Private routes have `noindex`; private order data never appears in the initial HTML. For a large catalog, add server query pagination and carefully invalidated caching; this baseline loads the published collection once per public render and once per browser session, suitable for a small catalog.

Vite dev pages are client-rendered. Test crawlability through the Hosting emulator or deployed Hosting rewrite, not port 5173. The generated `dist` directory alone is not a complete production hosting configuration.

## Production preparation (commands documented, not executed)

1. Create/configure the real Firebase services and authorized domains; enable Anonymous and Email/Password auth.
2. Set up billing and App Check; use `VITE_USE_EMULATORS=false`, correct client config and canonical `settings.siteUrl`.
3. Create the first Auth admin user in Firebase console, then grant the claim using the operator script with ADC. Initialize settings through the guarded `init-settings.mjs` operator script using a reviewed JSON file. Do not use the sample seed.
4. Build both packages. Confirm the frontend is built with production environment values before hosting it.
5. Deploy rules, indexes, functions and hosting only after explicit user authorization:

```bash
npx firebase deploy --project rufus-website-540cb --only firestore:rules,firestore:indexes,storage,functions,hosting
```

6. If authenticated receipt reads require CORS, apply `storage.cors.example.json` after replacing its origins with your exact domains. Do not use wildcard origins for production. Cross-service Storage rules require the Firebase Storage service agent to read Firestore; enable the permission when prompted by Firebase.
7. Enter authorized product facts/assets, verified warranty terms, store contacts, real UPI QR/payee, shipping charges and approved policies. Test live provider configuration separately under controlled authorization before taking real orders.

No bank verification, OTP/SMS, shipping automation, email delivery or refunds are falsely advertised. Those external systems are not configured.

Manual local expiry: `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/expire-local.mjs`.

## Admin CRUD / App Check recovery

Admin Auth and App Check are independent. `saveProduct` enforces App Check before
executing the admin-claim check; an invalid attestation can therefore return 401
while the UI correctly shows a signed-in administrator. Storage also requires the
admin claim and, when enforced in the console, valid App Check. Do not relax rules.

1. Open https://console.firebase.google.com/project/rufus-website-540cb/appcheck
   and select the web app matching `VITE_FIREBASE_APP_ID` under Apps. This client
   uses **reCAPTCHA Enterprise**.
2. In Google Cloud Console, select or create the corresponding reCAPTCHA Enterprise
   site key and register it for this web app in Firebase App Check. Allow
   `rufus-website-540cb.web.app`,
   `rufus-website-540cb.firebaseapp.com`, and your actual custom production domains.
3. Set `VITE_APPCHECK_SITE_KEY=<public site key>` in
   `frontend/storefront/.env` (or the build environment). Check `.env.local`,
   `.env.production`, `.env.production.local` and CI overrides for stale values.
   A Realtime Database URL, Firebase API key, app ID, or reCAPTCHA secret is not
   a site key. Restart Vite after changing env; production values are baked in
   by `npm --prefix frontend/storefront run build`.
4. Keep enforcement enabled. Test production attestation on an allowed domain;
   localhost browser/emulator tests do not prove real reCAPTCHA attestation.
   For localhost against production, follow Firebase's registered debug-provider
   workflow; never publish a debug token or put one in a production build.
5. Verify create, edit, PNG/JPEG/WebP upload, and published product visibility in
   a signed-out browser. Drafts must stay hidden. Verify non-admin uploads and
   direct Firestore writes are denied. The local integration regression covers
   these operations using `demo-rufus`; it does not validate deployed rules.
6. Only after a valid key, a production build, and live verification pass, use
   `backend/node_modules/.bin/firebase deploy --config backend/firebase.json --project rufus-website-540cb --only hosting`
   from the workspace root. Do not seed, replace admin accounts, or deploy rules
   or Functions as part of this Hosting-only repair.

**Hosting constraint:** application HTML currently comes from the deployed
`storefront` Function, including its build-specific asset filenames. Hosting-only
publishing cannot update that Function's HTML template. Before deployment, verify
that the served template references the intended new assets; if it references old
hashes, stop. Updating that template requires a separately authorized Functions
release or an explicitly reviewed change to client-rendered Hosting routing.
The workspace `backend` path is a symlink to `frontend/backend` on the host.
The existing relative paths intentionally resolve within `frontend`; preserve them.

### Local debug provider (live Firebase, development only)

Set `VITE_APPCHECK_DEBUG_TOKEN=<registered debug token>` in
`frontend/storefront/.env.development.local`, along with the registered
`VITE_APPCHECK_SITE_KEY`, then run `npm --prefix frontend/storefront run dev`.
Open `http://localhost:5173`. Debug mode requires that exact hostname, a Vite
development build, and an explicitly configured token. It is disabled on
production builds, Vercel domains, and other hosts (including `127.0.0.1`).
Never commit a debug token or configure one in Vercel/production environments.

Missing site keys skip App Check initialization. Initialization and token
exchange failures do not gate rendering or admin sign-in. Firebase server-side
App Check enforcement, security rules, and administrator claims still apply;
protected operations require valid attestation if enforcement is enabled.

Product removal uses **Archive**, a reversible soft deletion (`published:false`)
through the admin callable. It removes the product from public subscriptions
while preserving its record, order references, stock history, and images. No
permanent product data is stored in localStorage; only the shopping cart is local.
