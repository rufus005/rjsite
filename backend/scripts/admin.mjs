import { initializeOperator } from "./operator-auth.mjs";
import { getAuth } from "firebase-admin/auth";
const [email] = process.argv.slice(2);
if (!email) throw Error("Usage: npm run admin -- admin@example.com");
const local = !!process.env.FIREBASE_AUTH_EMULATOR_HOST;
const projectId = local ? "demo-rufus" : process.env.GOOGLE_CLOUD_PROJECT;
if (!projectId)
  throw Error(
    "Set GOOGLE_CLOUD_PROJECT and Application Default Credentials for your production project.",
  );
await initializeOperator(projectId, local);
const auth = getAuth();
let u;
try {
  u = await auth.getUserByEmail(email);
} catch (e) {
  if (!local || e.code !== "auth/user-not-found") throw e;
  if (!process.env.ADMIN_INITIAL_PASSWORD)
    throw Error(
      "For a new emulator user set ADMIN_INITIAL_PASSWORD (at least 12 characters).",
    );
  if (process.env.ADMIN_INITIAL_PASSWORD.length < 12)
    throw Error("Use at least 12 characters.");
  u = await auth.createUser({
    email,
    password: process.env.ADMIN_INITIAL_PASSWORD,
  });
}
await auth.setCustomUserClaims(u.uid, { ...u.customClaims, admin: true });
console.log(
  `Admin claim granted to ${email} in ${projectId}. Sign in again to refresh the token.`,
);
