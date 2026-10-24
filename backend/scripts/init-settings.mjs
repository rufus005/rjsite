import { initializeOperator } from "./operator-auth.mjs";
import { getFirestore } from "firebase-admin/firestore";
import { readFile } from "node:fs/promises";
import { settingsSchema } from "../functions/lib/schema.js";
const path = process.argv[2];
if (!path)
  throw Error(
    "Provide a reviewed settings JSON path. No defaults are published automatically.",
  );
const local = !!process.env.FIRESTORE_EMULATOR_HOST;
const projectId = local ? "demo-rufus" : process.env.GOOGLE_CLOUD_PROJECT;
if (!projectId)
  throw Error("Set GOOGLE_CLOUD_PROJECT and Application Default Credentials.");
const settings = settingsSchema.parse(JSON.parse(await readFile(path, "utf8")));
if (
  !local &&
  ((!settings.policiesApproved &&
    (settings.cod.enabled || settings.upi.enabled)) ||
    settings.upi.id === "demo@invalid")
)
  throw Error(
    "Live payments require approved policies and genuine payment details.",
  );
await initializeOperator(projectId, local);
try {
  await getFirestore().doc("settings/public").create(settings);
} catch (error) {
  if (error.code === 6 || error.code === "already-exists") {
    console.log("Store settings already exist; preserved without changes.");
    process.exit(0);
  }
  throw error;
}
console.log(
  `Created initial public settings in ${projectId}; existing settings are never overwritten.`,
);
