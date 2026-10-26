import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import {
  onCall,
  onRequest,
  HttpsError,
  type CallableRequest,
} from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { readFile } from "node:fs/promises";
import { z, ZodError } from "zod";
import { StoreService } from "./service.js";
import { id, type Product, type Settings } from "./schema.js";
import { renderPage, sitemap } from "./render.js";
initializeApp();
const db = getFirestore();
const service = new StoreService(db);
const options = {
  region: "us-central1",
  // Authorization is enforced by the auth/admin helpers below.
  enforceAppCheck: false,
  consumeAppCheckToken: false,
  maxInstances: 10,
};
const adminEmail = "rufus090420@gmail.com";
function admin(req: CallableRequest) {
  if (
    req.auth?.token.admin !== true &&
    req.auth?.token.email !== adminEmail
  )
    throw new HttpsError(
      "permission-denied",
      "Administrator access is required.",
    );
  return req.auth.uid;
}
function user(req: CallableRequest) {
  if (!req.auth)
    throw new HttpsError("unauthenticated", "Start a guest session first.");
  return req.auth.uid;
}
function callable(fn: (r: CallableRequest) => Promise<unknown>) {
  return onCall(options, async (r) => {
    try {
      return await fn(r);
    } catch (e) {
      if (e instanceof ZodError)
        throw new HttpsError(
          "invalid-argument",
          e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
        );
      if (e instanceof HttpsError) throw e;
      console.error(
        "Store operation failed",
        e instanceof Error ? e.message : "Unknown error",
      );
      throw new HttpsError(
        "internal",
        "Unable to complete this request. Please try again.",
      );
    }
  });
}
export const quoteOrder = callable(async (r) => {
  await service.rate("quote:" + (r.auth?.uid ?? r.rawRequest.ip), 120);
  return service.quote(r.data);
});
export const createOrder = callable(async (r) => {
  const uid = r.auth?.uid ?? null;
  const rateLimitId = uid ?? r.rawRequest.ip;
  await service.rate("orders:uid:" + rateLimitId, 12);
  await service.rate("orders:ip:" + r.rawRequest.ip, 30);
  return service.create(r.data, uid, rateLimitId);
});
export const lookupOrder = callable(async (r) => {
  await service.rate("lookup:" + r.rawRequest.ip, 80);
  const d = z
    .object({ id, token: z.string().regex(/^[a-f0-9]{64}$/) })
    .strict()
    .parse(r.data);
  return service.lookup(d.id, d.token);
});
export const attachReceipt = callable(async (r) =>
  service.attachReceipt(id.parse(r.data.id), user(r)),
);
export const updateOrder = callable(async (r) => {
  const uid = admin(r);
  const d = z
    .object({
      id,
      action: z.enum([
        "approve_payment",
        "reject",
        "verify_cod",
        "processing",
        "ship",
        "deliver",
        "cod_collected",
        "cancel",
        "expire",
      ]),
      bankRecordChecked: z.boolean().optional(),
      tracking: z
        .object({
          carrier: z.string().trim().max(100),
          number: z.string().trim().max(100),
          url: z.union([
            z.literal(""),
            z.string().url().startsWith("https://"),
          ]),
        })
        .optional(),
    })
    .strict()
    .parse(r.data);
  if (d.action === "approve_payment" && !d.bankRecordChecked)
    throw new HttpsError(
      "failed-precondition",
      "Confirm that you checked the actual bank/payment record.",
    );
  return service.transition(d.id, d.action, uid, d.tracking);
});
export const cancelOrder = callable(async (r) => {
  const d = z
    .object({ id, token: z.string().regex(/^[a-f0-9]{64}$/) })
    .strict()
    .parse(r.data);
  await service.rate("cancel:" + r.rawRequest.ip, 30);
  await service.lookup(d.id, d.token);
  return service.transition(d.id, "cancel", "guest");
});
export const saveProduct = callable(async (r) =>
  service.saveProduct(r.data, admin(r)),
);
export const saveSettings = callable(async (r) =>
  service.saveSettings(r.data, admin(r)),
);
export const saveCategory = callable(async (r) => {
  const uid = admin(r);
  const d = z
    .object({
      id,
      name: z.string().trim().min(1).max(80),
      published: z.boolean(),
    })
    .strict()
    .parse(r.data);
  const batch = db.batch();
  batch.set(db.doc(`categories/${d.id}`), d);
  batch.create(db.collection("audit").doc(), {
    actor: uid,
    action: "save_category",
    after: d,
    at: Timestamp.now(),
  });
  await batch.commit();
  return { ok: true };
});
export const expireReservations = onSchedule(
  { schedule: "every 5 minutes", region: "us-central1" },
  async () => {
    await service.expire();
  },
);
export const storefront = onRequest(
  { region: "us-central1", maxInstances: 10 },
  async (req, res) => {
    try {
      const [ps, s, template] = await Promise.all([
        db.collection("products").where("published", "==", true).get(),
        db.doc("settings/public").get(),
        readFile(new URL("../public/index.html", import.meta.url), "utf8"),
      ]);
      if (!s.exists) {
        res.status(503).send("Store setup is incomplete.");
        return;
      }
      const products = ps.docs.map((d) => d.data() as Product),
        settings = s.data() as Settings;
      res.set("Cache-Control", "no-store");
      res.set("Referrer-Policy", "no-referrer");
      if (req.path === "/sitemap.xml") {
        res.type("xml").send(sitemap(products, settings));
        return;
      }
      if (req.path === "/robots.txt") {
        res
          .type("text")
          .send(
            `User-agent: *\nDisallow: /admin\nDisallow: /checkout\nDisallow: /cart\nDisallow: /order\nSitemap: ${settings.siteUrl}/sitemap.xml\n`,
          );
        return;
      }
      const rendered = renderPage(
        template,
        req.path.replace(/\/$/, "") || "/",
        products,
        settings,
      );
      res.status(rendered.status).type("html").send(rendered.html);
    } catch {
      res
        .status(503)
        .send("The store is temporarily unavailable. Please try again.");
    }
  },
);
