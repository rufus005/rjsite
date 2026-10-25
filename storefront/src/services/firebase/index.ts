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
if (
  import.meta.env.VITE_ENABLE_APPCHECK === "true" &&
  !isEmulator &&
  typeof window !== "undefined"
) {
  const key = import.meta.env.VITE_APPCHECK_SITE_KEY?.trim();
  const debugToken = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN?.trim();
  const debugGlobal = self as typeof self & {
    FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean | string;
  };
  // Debug credentials require localhost, a development build, and an explicit
  // token. Never enable them on deployed hosts or production builds.
  if (
    import.meta.env.DEV &&
    window.location.hostname === "localhost" &&
    debugToken
  ) {
    debugGlobal.FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
  } else {
    delete debugGlobal.FIREBASE_APPCHECK_DEBUG_TOKEN;
  }
  if (key) {
    try {
      appCheck = initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider(key),
        isTokenAutoRefreshEnabled: true,
      });
    } catch {
      console.warn(
        "App Check could not initialize; continuing without App Check.",
      );
    }
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
// Warm up attestation in the background. Neither a failed exchange nor a slow
// provider should gate rendering, authentication, or starting a request. The
// Firebase SDK attaches tokens and the backend retains its own enforcement.
let appCheckWarmup: Promise<void> | undefined;
export async function ensureAppCheck() {
  if (!appCheck) return;
  appCheckWarmup ??= getToken(appCheck).then(
    () => {},
    () => {
      console.warn(
        "App Check verification failed; continuing with the request.",
      );
    },
  );
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
