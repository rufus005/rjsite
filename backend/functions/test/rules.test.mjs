import { test, before, after } from "node:test";
import { readFile } from "node:fs/promises";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { ref, uploadBytes, getBytes } from "firebase/storage";
let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-rufus",
    firestore: {
      rules: await readFile(
        new URL("../../firestore.rules", import.meta.url),
        "utf8",
      ),
      host: "127.0.0.1",
      port: 8080,
    },
    storage: {
      rules: await readFile(
        new URL("../../storage.rules", import.meta.url),
        "utf8",
      ),
      host: "127.0.0.1",
      port: 9199,
    },
  });
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, "products/public"), {
      published: true,
      variants: [{ stock: 3 }],
    });
    await setDoc(doc(db, "products/draft"), { published: false });
    await setDoc(doc(db, "settings/public"), { storeName: "Test" });
    await setDoc(doc(db, "settings/private"), { secret: "private test value" });
    await setDoc(doc(db, "orders/order1"), {
      ownerUid: "guest",
      paymentMethod: "upi",
      paymentStatus: "pending_verification",
      reserved: true,
    });
    await setDoc(doc(db, "audit/log"), { actor: "admin" });
  });
});
after(async () => env.cleanup());
test("public reads published products and public settings, never drafts/private settings/orders/audit", async () => {
  const db = env.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(db, "products/public")));
  await assertSucceeds(
    getDocs(query(collection(db, "products"), where("published", "==", true))),
  );
  for (const path of [
    "products/draft",
    "settings/private",
    "orders/order1",
    "audit/log",
  ])
    await assertFails(getDoc(doc(db, path)));
  await assertFails(getDocs(collection(db, "orders")));
  await assertFails(getDocs(collection(db, "products")));
});
test("even owner cannot directly read orders or forge roles, totals, settings and stock", async () => {
  const db = env.authenticatedContext("guest").firestore();
  for (const path of [
    "orders/order1",
    "products/public",
    "settings/public",
    "users/guest",
    "idempotency/key",
  ])
    await assertFails(
      setDoc(doc(db, path), { admin: true, total: 1, stock: 100 }),
    );
  await assertFails(getDoc(doc(db, "orders/order1")));
});
test("admin can read restricted data but trusted mutations require backend", async () => {
  const db = env.authenticatedContext("admin", { admin: true }).firestore();
  for (const path of [
    "products/draft",
    "settings/private",
    "orders/order1",
    "audit/log",
  ])
    await assertSucceeds(getDoc(doc(db, path)));
  await assertFails(
    updateDoc(doc(db, "orders/order1"), { paymentStatus: "paid" }),
  );
  await assertFails(updateDoc(doc(db, "products/public"), { stock: 100 }));
});
test("Storage image rules reject non-admin uploads, invalid MIME and oversized images", async () => {
  const publicStorage = env.unauthenticatedContext().storage(),
    admin = env.authenticatedContext("admin", { admin: true }).storage();
  await assertFails(
    uploadBytes(ref(publicStorage, "public/products/no"), new Uint8Array([1]), {
      contentType: "image/png",
    }),
  );
  await assertFails(
    uploadBytes(ref(admin, "public/qr/html"), new Uint8Array([1]), {
      contentType: "text/html",
    }),
  );
  await assertFails(
    uploadBytes(
      ref(admin, "public/banners/large"),
      new Uint8Array(5 * 1024 * 1024),
      { contentType: "image/png" },
    ),
  );
  await assertSucceeds(
    uploadBytes(ref(admin, "public/qr/valid"), new Uint8Array([1, 2, 3]), {
      contentType: "image/png",
    }),
  );
  await assertSucceeds(getBytes(ref(publicStorage, "public/qr/valid")));
});
test("receipt is owner-upload only and private, immutable, admin readable", async () => {
  const owner = env.authenticatedContext("guest").storage(),
    other = env.authenticatedContext("stranger").storage(),
    anon = env.unauthenticatedContext().storage(),
    admin = env.authenticatedContext("admin", { admin: true }).storage();
  const path = "receipts/guest/order1/receipt";
  await assertFails(
    uploadBytes(ref(other, path), new Uint8Array([1]), {
      contentType: "image/png",
    }),
  );
  await assertSucceeds(
    uploadBytes(ref(owner, path), new Uint8Array([1, 2]), {
      contentType: "image/png",
    }),
  );
  await assertFails(
    uploadBytes(ref(owner, path), new Uint8Array([3]), {
      contentType: "image/png",
    }),
  );
  await assertFails(getBytes(ref(anon, path)));
  await assertFails(getBytes(ref(other, path)));
  await assertSucceeds(getBytes(ref(owner, path)));
  await assertSucceeds(getBytes(ref(admin, path)));
});
