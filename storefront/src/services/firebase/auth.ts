import {
  getAuth,
  connectAuthEmulator,
  signInAnonymously,
  type User,
} from "firebase/auth";
import { app, emulatorHost, ensureAppCheck, isEmulator } from "./core";

export const auth = getAuth(app);
if (isEmulator)
  connectAuthEmulator(auth, `http://${emulatorHost}:9099`, {
    disableWarnings: true,
  });

export async function isAdminUser(user: User, forceRefresh = false) {
  const token = await user.getIdTokenResult(forceRefresh);
  return (
    token.claims.admin === true ||
    user.email?.toLowerCase() === "rufus090420@gmail.com"
  );
}

export async function prepareAdminRequest() {
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) throw Error("Sign in with your administrator account first.");
  if (auth.currentUser !== user || !(await isAdminUser(user, true)))
    throw Error(
      "Administrator access is required. Sign in again with an administrator account.",
    );
  await ensureAppCheck();
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
