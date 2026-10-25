import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator, signInAnonymously } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage, connectStorageEmulator } from "firebase/storage";
import {
  getFunctions,
  connectFunctionsEmulator,
  httpsCallable,
} from "firebase/functions";
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  CustomProvider,
  getToken,
  type AppCheck,
} from "firebase/app-check";
const env = import.meta.env;
function required(key: string) {
  const value = env[key]?.trim();
  if (!value)
    throw Error(
      `Missing ${key}. Copy .env.example to .env and supply your Firebase web configuration.`,
    );
  return value;
}
// Use live Firebase by default; set VITE_USE_EMULATORS=true for local emulators.
export const isEmulator = env.VITE_USE_EMULATORS === "true";
const app = initializeApp({
  apiKey: required("VITE_FIREBASE_API_KEY"),
  authDomain: required("VITE_FIREBASE_AUTH_DOMAIN"),
  projectId: isEmulator ? "demo-rufus" : required("VITE_FIREBASE_PROJECT_ID"),
  storageBucket: isEmulator
    ? "demo-rufus.appspot.com"
    : required("VITE_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: required("VITE_FIREBASE_MESSAGING_SENDER_ID"),
  appId: required("VITE_FIREBASE_APP_ID"),
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID?.trim(),
});
// Register App Check before creating clients that consume its tokens.
let appCheck: AppCheck | undefined;
let appCheckError = "";
if (!isEmulator) {
  const key = import.meta.env.VITE_APPCHECK_SITE_KEY?.trim();
  // The SDK exchanges a browser-generated debug token with Firebase. It does
  // not bypass server enforcement, Auth, or rules. Never accept token strings
  // from VITE_* variables (they would be embedded in browser bundles).
  const debug =
    import.meta.env.DEV &&
    env.VITE_APPCHECK_DEBUG === "true" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
  if (debug) {
    (
      self as typeof self & { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean }
    ).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    appCheck = initializeAppCheck(app, {
      // In SDK debug mode token exchange happens before provider.getToken.
      // A fail-closed provider avoids inventing a reCAPTCHA site key.
      provider: new CustomProvider({
        getToken: async () => {
          throw Error("Local App Check debug mode is not active.");
        },
      }),
      isTokenAutoRefreshEnabled: true,
    });
  } else if (!key || !/^[A-Za-z0-9_-]{20,}$/.test(key)) {
    appCheckError =
      "Configure VITE_APPCHECK_SITE_KEY with the reCAPTCHA Enterprise site key registered in Firebase App Check, then rebuild. A database URL is not a site key.";
  } else {
    appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(key),
      isTokenAutoRefreshEnabled: true,
    });
  }
}
export const auth = getAuth(app),
  db = getFirestore(app),
  storage = getStorage(app),
  functions = getFunctions(app, "us-central1");
if (isEmulator) {
  const host = env.VITE_EMULATOR_HOST || "127.0.0.1";
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, host, 8080);
  connectStorageEmulator(storage, host, 9199);
  connectFunctionsEmulator(functions, host, 5001);
}
export async function ensureAppCheck() {
  if (isEmulator) return;
  if (appCheckError) throw Error(appCheckError);
  try {
    await getToken(appCheck!);
  } catch (cause) {
    throw Error(
      import.meta.env.DEV && env.VITE_APPCHECK_DEBUG === "true"
        ? "App Check debug verification failed. Register this browser's debug token from the developer console in Firebase App Check > Manage debug tokens for rufus-website-540cb, then retry. Your sign-in has not been changed."
        : "App Check verification failed. Check the registered reCAPTCHA Enterprise site key and allowed domain in Firebase App Check. Your sign-in has not been changed.",
      { cause },
    );
  }
}
export async function prepareAdminRequest() {
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) throw Error("Sign in with your administrator account first.");
  // Refresh claims before privileged operations, including Storage uploads.
  const token = await user.getIdTokenResult(true);
  if (auth.currentUser !== user || token.claims.admin !== true)
    throw Error(
      "Administrator access is required. Sign in again with an administrator account.",
    );
  await ensureAppCheck();
}
export async function enableAnalytics() {
  if (isEmulator) return;
  const { isSupported, getAnalytics } = await import("firebase/analytics");
  if (await isSupported()) getAnalytics(app);
}
let guestPromise: Promise<unknown> | null = null;
export async function guest() {
  await auth.authStateReady();
  if (!auth.currentUser) {
    guestPromise ??= signInAnonymously(auth).finally(() => {
      guestPromise = null;
    });
    await guestPromise;
  }
  return auth.currentUser!;
}
export async function call<T>(name: string, data: unknown): Promise<T> {
  await auth.authStateReady();
  await auth.currentUser?.getIdToken();
  await ensureAppCheck();
  return (await httpsCallable<unknown, T>(functions, name)(data)).data;
}
