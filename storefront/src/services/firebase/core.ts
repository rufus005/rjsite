import { initializeApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
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
export const emulatorHost = env.VITE_EMULATOR_HOST || "127.0.0.1";
export const app = initializeApp({
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

let appCheck: AppCheck | undefined;
if (
  import.meta.env.VITE_ENABLE_APPCHECK === "true" &&
  !isEmulator &&
  typeof window !== "undefined"
) {
  const key = env.VITE_APPCHECK_SITE_KEY?.trim();
  const debugToken = env.VITE_APPCHECK_DEBUG_TOKEN?.trim();
  const debugGlobal = self as typeof self & {
    FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean | string;
  };
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

export const db = getFirestore(app);
if (isEmulator) connectFirestoreEmulator(db, emulatorHost, 8080);

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

export async function enableAnalytics() {
  if (isEmulator) return;
  const { isSupported, getAnalytics } = await import("firebase/analytics");
  if (await isSupported()) getAnalytics(app);
}
