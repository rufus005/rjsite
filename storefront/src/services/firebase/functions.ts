import {
  getFunctions,
  connectFunctionsEmulator,
  httpsCallable,
} from "firebase/functions";
import { auth } from "./auth";
import { app, emulatorHost, ensureAppCheck, isEmulator } from "./core";

const functions = getFunctions(app, "us-central1");
if (isEmulator) connectFunctionsEmulator(functions, emulatorHost, 5001);

export async function call<T>(name: string, data: unknown): Promise<T> {
  await auth.authStateReady();
  await auth.currentUser?.getIdToken();
  await ensureAppCheck();
  return (await httpsCallable<unknown, T>(functions, name)(data)).data;
}
