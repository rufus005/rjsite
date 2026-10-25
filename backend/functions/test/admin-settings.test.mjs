import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!process.env.FIRESTORE_EMULATOR_HOST)
  throw Error("Run through Firebase emulators; refusing live test access.");
process.env.GCLOUD_PROJECT = "demo-rufus";
const { saveSettings } = await import("../lib/index.js");
const db = getFirestore();
const settings = JSON.parse(
  await readFile(
    new URL("../../sample-settings.json", import.meta.url),
    "utf8",
  ),
);

after(async () => {
  await db.terminate();
  await deleteApp(getApp());
});

test("admin saves settings without App Check context and writes an audit entry", async () => {
  const data = { ...settings, storeName: "Admin settings regression" };
  const result = await saveSettings.run({
    data,
    auth: {
      uid: "settings-admin",
      token: { admin: true, email: "rufus090420@gmail.com" },
    },
  });
  assert.deepEqual(result, { ok: true });
  assert.equal(
    (await db.doc("settings/public").get()).data().storeName,
    data.storeName,
  );
  const audit = await db
    .collection("audit")
    .where("actor", "==", "settings-admin")
    .get();
  assert(audit.docs.some((doc) => doc.data().action === "save_settings"));
});

test("missing authentication or missing admin claim cannot save settings", async () => {
  for (const auth of [undefined, { uid: "customer", token: {} }]) {
    await assert.rejects(saveSettings.run({ data: settings, auth }), {
      code: "permission-denied",
    });
  }
});
