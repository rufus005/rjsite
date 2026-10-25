# rjsite deployment diagnosis

Deployment `dpl_CS2RExSfTgnWw18cncNe94M3Qne9`, commit `6b5b498`, failed with
`STATIC_BUILD_NO_OUT_DIR`. The complete build log shows successful dependency
installation and all three root REA build tasks completing before output
discovery failed. It never built `rufus-storefront`. The project preset was
VitePress, with Node 24.x.

The root `vercel.json` explicitly installs the storefront lockfile, builds the
storefront, and selects `storefront/dist`. Keep Vercel Root Directory at the Git
repository root (the local `frontend` directory is the repository root, not a
directory inside the GitHub checkout). Do not change the unrelated root scripts.
The configuration overrides the framework/build/install/output dashboard values.

## Required configuration before another build

Vercel returned an empty environment-variable list during diagnosis. Configure
these exact names under **rjsite → Settings → Environment Variables**:

| Variable | Value source | Scope |
| --- | --- | --- |
| `VITE_FIREBASE_API_KEY` | Existing Firebase web app configuration | Production; Preview when used |
| `VITE_FIREBASE_AUTH_DOMAIN` | Existing Firebase web app configuration | Production; Preview when used |
| `VITE_FIREBASE_PROJECT_ID` | Existing Firebase web app configuration | Production; Preview when used |
| `VITE_FIREBASE_STORAGE_BUCKET` | Existing Firebase web app configuration | Production; Preview when used |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Existing Firebase web app configuration | Production; Preview when used |
| `VITE_FIREBASE_APP_ID` | Existing Firebase web app configuration | Production; Preview when used |
| `VITE_APPCHECK_SITE_KEY` | Registered reCAPTCHA Enterprise site key | Production; Preview when used |
| `VITE_SITE_URL` | Actual public HTTPS site origin | Production; appropriate Preview origin if needed |

The first seven are required for a working production application. `VITE_SITE_URL`
is recommended for canonical URLs; `settings/public.siteUrl` takes precedence.
`VITE_FIREBASE_MEASUREMENT_ID` and `VITE_ADMIN_EMAIL` are optional. The latter only
prefills the sign-in form and grants no authorization.

Leave `VITE_USE_EMULATORS` unset or false in deployed environments. Do not deploy
`VITE_EMULATOR_HOST`, `VITE_APPCHECK_DEBUG`, debug tokens, service-account JSON, or
the reCAPTCHA secret. Local debug configuration remains in
`storefront/.env.development.local`; emulator mode remains explicitly opt-in.
Development scope is only needed if pulling Vercel variables for local use.

For local production validation, put the real public site key in the ignored
`storefront/.env.production.local`, preserving existing localhost settings, then:

```bash
npm --prefix storefront run build
```

The initial local run passed TypeScript but stopped in Vite configuration because
`VITE_APPCHECK_SITE_KEY` was missing. No substitute key or security bypass was added.
The storefront lockfile matches its package.json; no dependency changes are needed
for the recorded Vercel error. The storefront's `.nvmrc` requests Node 22; the
repository root and Vercel use Node 24. This mismatch did not cause the recorded
failure; validate with the deployment Node version before release.

## Production verification still required

1. Confirm the web app matching `VITE_FIREBASE_APP_ID` has reCAPTCHA Enterprise
   registered in Firebase App Check. Add the actual production hostname to the provider's
   allowed domains and Firebase Authentication's authorized domains. Verify
   existing Storage CORS permits that origin where authenticated reads need it.
   These Firebase console settings have not been inspected or changed.
2. Production requests use Firebase SDK endpoints selected by project ID, bucket,
   and Functions region `us-central1`. There is no separate API base URL variable.
   Confirm the existing callable functions are deployed in that project/region.
3. Check hosting routing before release. Firebase Hosting currently delegates HTML,
   dynamic SEO, `/sitemap.xml`, and `/robots.txt` to its `storefront` Function.
   Building static files on Vercel does not deploy that Function or reproduce
   those responses. No speculative proxy or blanket SPA rewrite was added: verify
   the intended existing Firebase origin/template/assets before choosing routing.
   Test direct navigation and refresh on `/shop`, a product, and `/admin`.
4. After configuration and a successful local production build, push the reviewed
   change. Vercel Git integration should build it; for subsequent environment-only
   changes, use Deployments → Redeploy. Verify the new commit and build log show
   `rufus-storefront` and output at `storefront/dist`.
5. On the actual production domain, verify catalog reads, sign-in, App Check token
   exchange, callable responses, image reads, and browser console/network errors.
   Use controlled test records for writes. Verify deployment access matches the
   intended public audience; current Vercel SSO protection covers non-custom domains.

The local production build now passes with the user-supplied public site key in
the ignored `storefront/.env.production.local`. Vercel environment configuration,
hosting routing, and live application verification are still outstanding.
Do not treat this build-target correction as a verified production release.

## Validation performed

- Retried the configured production build on Node 22.22.3: TypeScript passed;
  Vite initially rejected the existing App Check key before bundling. After the
  user supplied the public site key, the same production command passed all
  stages: TypeScript, Vite bundling (1,631 modules), and Firebase HTML template copy.
  This validates build-time syntax, not live App Check registration or attestation.
- `npm --prefix storefront run test:appcheck` on Node 22.22.3: both browser tests
  passed. They intercept external traffic and verify local debug exchange failure
  handling and rejection of debug mode on non-loopback hosts. They do not verify
  real Firebase credentials, domain registration, or live product operations.
- Parsed the Vercel JSON and checked command/output paths; `git diff --check`
  passed. A new ignored production-only environment override was created; existing
  development settings, source, lockfiles, rules, and data were not changed.
  No commit, push, deployment, or remote setting change was performed.

After resolving the configuration and routing checks above, from the repository:

```bash
git add vercel.json VERCEL-DEPLOYMENT.md
git commit -m "fix: target storefront in Vercel builds"
git push origin main
```

References: [Vercel configuration](https://vercel.com/docs/project-configuration/vercel-json),
[Firebase App Check v3](https://firebase.google.com/docs/app-check/web/recaptcha-provider).
