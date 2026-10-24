import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { readFile } from "node:fs/promises";
// This command is deliberately local-only, even with production ADC installed.
for (const [key, expected] of Object.entries({
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
})) {
  if (process.env[key] && process.env[key] !== expected)
    throw Error(`Refusing to seed: ${key} must be ${expected}.`);
  process.env[key] = expected;
}
const app = initializeApp({ projectId: "demo-rufus" }),
  db = getFirestore(app);
try {
  const products = JSON.parse(
    await readFile(new URL("../sample-products.json", import.meta.url)),
  );
  const settings = JSON.parse(
    await readFile(new URL("../sample-settings.json", import.meta.url)),
  );
  const docs = [
    ...products.map((p) => ["products/" + p.id, p]),
    ...products.map((p) => ["slugs/" + p.slug, { productId: p.id }]),
    ...[...new Set(products.map((p) => p.category))].map((name, i) => [
      "categories/c" + i,
      { id: "c" + i, name, published: true },
    ]),
    ["settings/public", settings],
  ];
  const onlyEmpty = process.argv.includes("--if-empty");
  const changed = await db.runTransaction(async (tx) => {
    const snapshots = await tx.getAll(...docs.map(([id]) => db.doc(id)));
    let written = 0;
    docs.forEach(([id, data], i) => {
      if (!onlyEmpty || !snapshots[i].exists) {
        tx.set(db.doc(id), data);
        written++;
      }
    });
    return written;
  });
  console.log(
    changed
      ? `Seeded ${changed} demo-rufus documents (products, slugs, categories, settings). No real payments.`
      : "Existing demo store preserved; no seed changes needed.",
  );
  const auth = getAuth(app);
  const email = process.env.ADMIN_EMAIL || "rufus090420@gmail.com";
  let user;
  try {
    user = await auth.getUserByEmail(email);
  } catch (error) {
    if (error.code !== "auth/user-not-found") throw error;
    const password = process.env.ADMIN_INITIAL_PASSWORD;
    if (password) {
      if (password.length < 12)
        throw Error("ADMIN_INITIAL_PASSWORD needs at least 12 characters.");
      user = await auth.createUser({ email, password });
    } else {
      console.warn(
        `Catalog ready. To create ${email}, set ADMIN_INITIAL_PASSWORD and rerun seed -- --if-empty. No admin account was created.`,
      );
    }
  }
  if (user) {
    await auth.setCustomUserClaims(user.uid, {
      ...user.customClaims,
      admin: true,
    });
    console.log(
      `Verified Auth admin claim for ${email} in demo-rufus. Sign out and back in to refresh your token.`,
    );
  }
} finally {
  await db.terminate();
  await deleteApp(app);
}
