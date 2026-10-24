import { z } from "zod";
const text = z.string().trim();
export const id = text.regex(/^[a-zA-Z0-9_-]{1,80}$/);
const money = z.number().int().min(0).max(100000000);
const image = text
  .max(1500)
  .refine(
    (v) =>
      v.startsWith("/images/") ||
      v.startsWith("https://") ||
      (process.env.GCLOUD_PROJECT === "demo-rufus" &&
        process.env.FUNCTIONS_EMULATOR === "true" &&
        v.startsWith("http://127.0.0.1:9199/v0/b/demo-rufus.appspot.com/o/")),
    "Use an HTTPS image URL or local /images/ path",
  );
export const productSchema = z
  .object({
    id,
    name: text.min(2).max(160),
    slug: text.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(160),
    description: text.min(10).max(10000),
    type: z.enum(["rack", "storage", "footwear"]),
    category: text.min(1).max(80),
    brand: text.max(80),
    sku: text.min(1).max(80),
    published: z.boolean(),
    sample: z.boolean().default(false),
    images: z.array(image).max(12),
    specifications: z.record(text.max(80), text.max(300)),
    warranty: text.max(500).default("1-Year Warranty"),
    warrantyApproved: z.boolean().default(false),
    sourceUrls: z.array(text.url()).max(10),
    seo: z.object({ title: text.max(160), description: text.max(320) }),
    variants: z
      .array(
        z.object({
          id,
          name: text.min(1).max(100),
          color: text.max(60),
          size: text.max(30),
          sku: text.min(1).max(80),
          price: money,
          originalPrice: money,
          stock: z.number().int().min(0).max(100000),
          images: z.array(image).max(12),
        }),
      )
      .min(1)
      .max(50),
  })
  .strict()
  .superRefine((p, c) => {
    if (new Set(p.variants.map((v) => v.id)).size !== p.variants.length)
      c.addIssue({ code: "custom", message: "Variant IDs must be unique" });
    for (const v of p.variants)
      if (v.originalPrice < v.price)
        c.addIssue({
          code: "custom",
          message: "Original price cannot be below selling price",
        });
  });
export const settingsSchema = z
  .object({
    storeName: text.min(1).max(120),
    tagline: text.max(200),
    email: z.union([z.literal(""), text.email()]),
    phone: text.regex(/^[+\d\s-]{0,25}$/),
    whatsapp: text.regex(/^\d{0,15}$/),
    address: text.max(500),
    banner: text.max(250),
    bannerImage: z.union([z.literal(""), image]),
    siteUrl: text.url(),
    shippingFee: money,
    cod: z.object({
      enabled: z.boolean(),
      fee: money,
      verificationRequired: z.boolean(),
      instructions: text.max(2000),
    }),
    upi: z.object({
      enabled: z.boolean(),
      id: text.max(100),
      payee: text.max(120),
      qrImage: z.union([z.literal(""), image]),
      instructions: text.max(2000),
    }),
    policies: z.object({
      shipping: text.max(10000),
      returns: text.max(10000),
      privacy: text.max(10000),
      terms: text.max(10000),
      about: text.max(10000),
    }),
    policiesApproved: z.boolean(),
  })
  .strict()
  .superRefine((s, c) => {
    if (s.upi.enabled && (!/^[\w.-]+@[\w.-]+$/.test(s.upi.id) || !s.upi.payee))
      c.addIssue({
        code: "custom",
        message: "Enabled UPI requires a valid UPI ID and payee name",
      });
  });
export const itemsSchema = z
  .array(
    z
      .object({
        productId: id,
        variantId: id,
        quantity: z.number().int().min(1).max(10),
      })
      .strict(),
  )
  .min(1)
  .max(30);
export const buyerSchema = z
  .object({
    name: text.min(2).max(100),
    phone: text.regex(/^[6-9]\d{9}$/),
    email: z.union([z.literal(""), text.email().max(150)]),
    address: text.min(8).max(400),
    pin: text.regex(/^[1-9]\d{5}$/),
    city: text.min(2).max(100),
    state: text.min(2).max(100),
  })
  .strict();
export const quoteSchema = z
  .object({ items: itemsSchema, paymentMethod: z.enum(["cod", "upi"]) })
  .strict();
export const orderSchema = quoteSchema
  .extend({
    buyer: buyerSchema,
    idempotencyKey: text.uuid(),
    expectedTotal: money,
    expectedQuote: text.length(64),
    utr: text.regex(/^[a-zA-Z0-9-]{6,40}$/).optional(),
  })
  .strict();
export type Product = z.infer<typeof productSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type Checkout = z.infer<typeof orderSchema>;
