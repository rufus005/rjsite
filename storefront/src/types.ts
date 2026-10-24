export type Variant = {
  id: string;
  name: string;
  color: string;
  size: string;
  sku: string;
  price: number;
  originalPrice: number;
  stock: number;
  images: string[];
};
export type Product = {
  id: string;
  name: string;
  slug: string;
  description: string;
  type: "rack" | "storage" | "footwear";
  category: string;
  brand: string;
  sku: string;
  published: boolean;
  sample: boolean;
  images: string[];
  specifications: Record<string, string>;
  warranty: string;
  warrantyApproved: boolean;
  sourceUrls: string[];
  seo: { title: string; description: string };
  variants: Variant[];
};
export type Settings = {
  storeName: string;
  tagline: string;
  email: string;
  phone: string;
  whatsapp: string;
  address: string;
  banner: string;
  bannerImage: string;
  siteUrl: string;
  shippingFee: number;
  cod: {
    enabled: boolean;
    fee: number;
    verificationRequired: boolean;
    instructions: string;
  };
  upi: {
    enabled: boolean;
    id: string;
    payee: string;
    qrImage: string;
    instructions: string;
  };
  policies: Record<
    "shipping" | "returns" | "privacy" | "terms" | "about",
    string
  >;
  policiesApproved: boolean;
};
export type CartLine = {
  productId: string;
  variantId: string;
  quantity: number;
};
export type Quote = {
  lines: (CartLine & {
    name: string;
    slug: string;
    variant: string;
    sku: string;
    unitPrice: number;
    lineTotal: number;
    image: string;
  })[];
  subtotal: number;
  shipping: number;
  codFee: number;
  total: number;
  quoteHash: string;
};
export type Order = Quote & {
  id: string;
  reference: string;
  buyer: {
    name: string;
    phone: string;
    email: string;
    address: string;
    pin: string;
    city: string;
    state: string;
  };
  paymentMethod: "cod" | "upi";
  paymentStatus: string;
  fulfillmentStatus: string;
  utr: string;
  receiptPath: string;
  duplicateReference: boolean;
  createdAt: number | { seconds: number };
  expiresAt: number | null;
  tracking: { carrier: string; number: string; url: string };
};
