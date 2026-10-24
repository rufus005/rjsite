import { createHash, randomBytes } from "node:crypto";
import { Firestore, Timestamp } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import {
  orderSchema,
  quoteSchema,
  productSchema,
  settingsSchema,
  type Product,
  type Settings,
} from "./schema.js";
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
function fail(message: string): never {
  throw new HttpsError("failed-precondition", message);
}
export class StoreService {
  constructor(public db: Firestore) {}
  async rate(key: string, limit = 40) {
    const ref = this.db.doc(
      `rateLimits/${hash(key + ":" + Math.floor(Date.now() / 3600000))}`,
    );
    await this.db.runTransaction(async (tx) => {
      const s = await tx.get(ref);
      const count = s.data()?.count ?? 0;
      if (count >= limit)
        throw new HttpsError(
          "resource-exhausted",
          "Too many requests. Try again later.",
        );
      tx.set(ref, {
        count: count + 1,
        expiresAt: Timestamp.fromMillis(Date.now() + 7200000),
      });
    });
  }
  price(
    items: { productId: string; variantId: string; quantity: number }[],
    method: string,
    products: Map<string, Product>,
    settings: Settings,
  ) {
    if (!settings[method as "cod" | "upi"].enabled)
      fail("This payment method is unavailable.");
    const seen = new Set<string>();
    const lines = items.map((i) => {
      const key = i.productId + ":" + i.variantId;
      if (seen.has(key)) fail("Duplicate cart lines are not allowed.");
      seen.add(key);
      const p = products.get(i.productId);
      if (!p?.published)
        fail("A product is no longer available. Please update your cart.");
      const v = p.variants.find((v) => v.id === i.variantId);
      if (!v || v.stock < i.quantity)
        fail(`${p.name}: selected quantity or variant is unavailable.`);
      return {
        ...i,
        name: p.name,
        slug: p.slug,
        variant: v.name,
        sku: v.sku,
        unitPrice: v.price,
        lineTotal: v.price * i.quantity,
        image: v.images[0] || p.images[0] || "",
      };
    });
    const subtotal = lines.reduce((n, i) => n + i.lineTotal, 0),
      shipping = settings.shippingFee,
      codFee = method === "cod" ? settings.cod.fee : 0;
    const total = subtotal + shipping + codFee;
    const quoteHash = hash(
      JSON.stringify({
        lines,
        shipping,
        codFee,
        payment: settings[method as "cod" | "upi"],
      }),
    );
    return {
      lines,
      subtotal,
      shipping,
      codFee,
      total,
      quoteHash,
      payment: settings[method as "cod" | "upi"],
    };
  }
  async quote(raw: unknown) {
    const data = quoteSchema.parse(raw);
    const [s, ...ps] = await this.db.getAll(
      this.db.doc("settings/public"),
      ...Array.from(new Set(data.items.map((i) => i.productId))).map((i) =>
        this.db.doc(`products/${i}`),
      ),
    );
    if (!s.exists) fail("Store settings are not configured.");
    return this.price(
      data.items,
      data.paymentMethod,
      new Map(ps.map((p) => [p.id, p.data() as Product])),
      settingsSchema.parse(s.data()),
    );
  }
  async create(raw: unknown, uid: string) {
    const data = orderSchema.parse(raw),
      idem = this.db.doc(`idempotency/${hash(uid + data.idempotencyKey)}`),
      fingerprint = hash(JSON.stringify(data));
    const orderRef = this.db.collection("orders").doc(),
      token = randomBytes(32).toString("hex");
    return this.db.runTransaction(async (tx) => {
      const old = await tx.get(idem);
      if (old.exists) {
        if (old.data()!.fingerprint !== fingerprint)
          fail("Idempotency key was already used for different order details.");
        return old.data()!.result;
      }
      const productIds = Array.from(
        new Set(data.items.map((i) => i.productId)),
      );
      const [s, ...ps] = await tx.getAll(
        this.db.doc("settings/public"),
        ...productIds.map((id) => this.db.doc(`products/${id}`)),
      );
      const settings = settingsSchema.parse(s.data()),
        products = new Map(ps.map((p) => [p.id, p.data() as Product]));
      const priced = this.price(
        data.items,
        data.paymentMethod,
        products,
        settings,
      );
      if (
        priced.total !== data.expectedTotal ||
        priced.quoteHash !== data.expectedQuote
      )
        fail(
          "Prices or payment settings changed. Review your refreshed total before ordering.",
        );
      const utr = data.utr?.toUpperCase() || "";
      if (data.paymentMethod === "upi" && !utr)
        fail("Enter your payment reference for manual verification.");
      const refDoc = utr ? this.db.doc(`paymentReferences/${hash(utr)}`) : null;
      const reference = refDoc ? await tx.get(refDoc) : null;
      for (const p of ps) {
        const product = products.get(p.id)!;
        const variants = product.variants.map((v) => ({
          ...v,
          stock:
            v.stock -
            (data.items.find(
              (i) => i.productId === p.id && i.variantId === v.id,
            )?.quantity ?? 0),
        }));
        tx.update(p.ref, { variants });
      }
      const now = Date.now(),
        needsVerification =
          data.paymentMethod === "upi" || settings.cod.verificationRequired;
      const order = {
        id: orderRef.id,
        reference: `RUF-${orderRef.id.slice(0, 10).toUpperCase()}`,
        ownerUid: uid,
        tokenHash: hash(token),
        buyer: data.buyer,
        ...priced,
        paymentMethod: data.paymentMethod,
        paymentStatus:
          data.paymentMethod === "upi" ? "pending_verification" : "unpaid",
        fulfillmentStatus:
          data.paymentMethod === "cod" && settings.cod.verificationRequired
            ? "pending_verification"
            : "confirmed",
        utr,
        duplicateReference: !!reference?.exists,
        receiptPath: "",
        reserved: true,
        createdAt: Timestamp.fromMillis(now),
        expiresAt: needsVerification
          ? Timestamp.fromMillis(
              now + (data.paymentMethod === "upi" ? 30 * 60000 : 24 * 3600000),
            )
          : null,
        tracking: { carrier: "", number: "", url: "" },
      };
      tx.create(orderRef, order);
      if (refDoc)
        tx.set(refDoc, {
          orderIds: [...(reference?.data()?.orderIds ?? []), orderRef.id].slice(
            -100,
          ),
          updatedAt: Timestamp.now(),
        });
      const result = {
        id: orderRef.id,
        reference: order.reference,
        token,
        total: priced.total,
      };
      tx.create(idem, { fingerprint, result, createdAt: Timestamp.now() });
      return result;
    });
  }
  async lookup(id: string, token: string) {
    const snap = await this.db.doc(`orders/${id}`).get();
    if (!snap.exists || snap.data()!.tokenHash !== hash(token))
      throw new HttpsError(
        "not-found",
        "Order not found or access token is invalid.",
      );
    const {
      tokenHash: _hash,
      ownerUid: _uid,
      duplicateReference: _duplicate,
      ...order
    } = snap.data()!;
    return {
      ...order,
      createdAt: order.createdAt.toMillis(),
      expiresAt: order.expiresAt?.toMillis() ?? null,
    };
  }
  async attachReceipt(id: string, uid: string) {
    const ref = this.db.doc(`orders/${id}`);
    await this.db.runTransaction(async (tx) => {
      const s = await tx.get(ref);
      const o = s.data();
      if (!o || o.ownerUid !== uid)
        throw new HttpsError("permission-denied", "Not your order.");
      if (
        o.paymentMethod !== "upi" ||
        o.paymentStatus !== "pending_verification" ||
        !o.reserved
      )
        fail("This order no longer accepts a receipt.");
      tx.update(ref, { receiptPath: `receipts/${uid}/${id}/receipt` });
    });
    return { ok: true };
  }
  async transition(
    id: string,
    action: string,
    actor: string,
    tracking?: { carrier: string; number: string; url: string },
  ) {
    const ref = this.db.doc(`orders/${id}`);
    return this.db.runTransaction(async (tx) => {
      const s = await tx.get(ref);
      if (!s.exists) throw new HttpsError("not-found", "Order not found.");
      const o = s.data()!;
      if (["cancelled", "expired"].includes(o.fulfillmentStatus)) {
        if (["cancel", "expire", "reject"].includes(action))
          return { ok: true };
        fail("Order is closed.");
      }
      if (
        action === "expire" &&
        (!o.expiresAt || o.expiresAt.toMillis() > Date.now())
      )
        return { ok: false };
      const patch: Record<string, unknown> = { updatedAt: Timestamp.now() };
      let release = false;
      if (["cancel", "expire", "reject"].includes(action)) {
        if (["shipped", "delivered"].includes(o.fulfillmentStatus))
          fail("Shipped orders cannot be cancelled or restocked.");
        if (o.paymentStatus === "paid")
          fail(
            "Paid orders require a separately recorded bank refund before cancellation.",
          );
        if (action === "reject" && o.paymentMethod !== "upi")
          fail("Only UPI payment can be rejected.");
        patch.fulfillmentStatus = action === "expire" ? "expired" : "cancelled";
        if (action === "reject") patch.paymentStatus = "rejected";
        release = o.reserved;
      } else if (action === "approve_payment") {
        if (
          o.paymentMethod !== "upi" ||
          o.paymentStatus !== "pending_verification" ||
          !o.reserved
        )
          fail("Payment cannot be approved in this state.");
        if (o.expiresAt?.toMillis() <= Date.now())
          fail(
            "Reservation expired. Expire the order and ask the customer to contact support.",
          );
        patch.paymentStatus = "paid";
        patch.expiresAt = null;
      } else if (action === "verify_cod") {
        if (
          o.paymentMethod !== "cod" ||
          o.fulfillmentStatus !== "pending_verification"
        )
          fail("COD does not need verification.");
        if (o.expiresAt?.toMillis() <= Date.now())
          fail("COD reservation has expired.");
        patch.fulfillmentStatus = "confirmed";
        patch.expiresAt = null;
      } else if (action === "processing") {
        if (
          o.fulfillmentStatus !== "confirmed" ||
          (o.paymentMethod === "upi" && o.paymentStatus !== "paid")
        )
          fail("Verify this order before processing.");
        patch.fulfillmentStatus = "processing";
      } else if (action === "ship") {
        if (
          o.fulfillmentStatus !== "processing" ||
          !tracking?.number ||
          !tracking.carrier
        )
          fail("Process the order and supply tracking details first.");
        patch.fulfillmentStatus = "shipped";
        patch.tracking = tracking;
        patch.reserved = false;
        patch.expiresAt = null;
      } else if (action === "deliver") {
        if (o.fulfillmentStatus !== "shipped")
          fail("Only shipped orders can be delivered.");
        patch.fulfillmentStatus = "delivered";
      } else if (action === "cod_collected") {
        if (
          o.paymentMethod !== "cod" ||
          o.paymentStatus !== "unpaid" ||
          o.fulfillmentStatus !== "delivered"
        )
          fail("Record collection only for delivered unpaid COD orders.");
        patch.paymentStatus = "paid";
      } else fail("Invalid action.");
      if (release) {
        const ids = Array.from(
          new Set<string>(
            o.lines.map((l: { productId: string }) => l.productId),
          ),
        );
        const ps = await tx.getAll(
          ...ids.map((id) => this.db.doc(`products/${id}`)),
        );
        for (const p of ps) {
          if (!p.exists)
            fail("Missing inventory record. Contact administrator.");
          const product = p.data() as Product;
          for (const l of o.lines.filter(
            (l: { productId: string }) => l.productId === p.id,
          ))
            if (!product.variants.some((v) => v.id === l.variantId))
              fail("Missing reserved variant. Contact administrator.");
          tx.update(p.ref, {
            variants: product.variants.map((v) => ({
              ...v,
              stock:
                v.stock +
                o.lines
                  .filter(
                    (l: { productId: string; variantId: string }) =>
                      l.productId === p.id && l.variantId === v.id,
                  )
                  .reduce(
                    (n: number, l: { quantity: number }) => n + l.quantity,
                    0,
                  ),
            })),
          });
        }
        patch.reserved = false;
        patch.expiresAt = null;
      }
      tx.update(ref, patch);
      tx.create(this.db.collection("audit").doc(), {
        actor,
        action,
        orderId: id,
        at: Timestamp.now(),
        before: { payment: o.paymentStatus, fulfillment: o.fulfillmentStatus },
        after: patch,
      });
      return { ok: true };
    });
  }
  async saveProduct(raw: unknown, actor: string) {
    const p = productSchema.parse(raw);
    if (p.sample && process.env.GCLOUD_PROJECT !== "demo-rufus")
      fail("Sample products cannot be published to a live project.");
    const ref = this.db.doc(`products/${p.id}`),
      slugRef = this.db.doc(`slugs/${p.slug}`);
    await this.db.runTransaction(async (tx) => {
      const [old, slug] = await tx.getAll(ref, slugRef);
      if (slug.exists && slug.data()!.productId !== p.id)
        fail("This slug is already used.");
      if (old.exists) {
        const before = old.data() as Product;
        if (before.variants.some((v) => !p.variants.some((n) => n.id === v.id)))
          fail(
            "Keep existing variant IDs to preserve order inventory history. Set stock to zero to retire a variant.",
          );
        if (before.slug !== p.slug)
          tx.delete(this.db.doc(`slugs/${before.slug}`));
      }
      tx.set(slugRef, { productId: p.id });
      tx.set(ref, p);
      tx.create(this.db.collection("audit").doc(), {
        actor,
        action: "save_product",
        productId: p.id,
        before: old.data() ?? null,
        after: p,
        at: Timestamp.now(),
      });
    });
    return { ok: true };
  }
  async saveSettings(raw: unknown, actor: string) {
    const s = settingsSchema.parse(raw);
    await this.db.runTransaction(async (tx) => {
      const ref = this.db.doc("settings/public"),
        old = await tx.get(ref);
      tx.set(ref, s);
      tx.create(this.db.collection("audit").doc(), {
        actor,
        action: "save_settings",
        before: old.data() ?? null,
        after: s,
        at: Timestamp.now(),
      });
    });
    return { ok: true };
  }
  async expire() {
    const orders = await this.db
      .collection("orders")
      .where("reserved", "==", true)
      .where("expiresAt", "<=", Timestamp.now())
      .limit(200)
      .get();
    for (const o of orders.docs)
      await this.transition(o.id, "expire", "scheduler");
    return orders.size;
  }
}
