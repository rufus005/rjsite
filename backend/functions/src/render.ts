import type { Product, Settings } from "./schema.js";
const BRAND_NAME = "ZAK ENTERPRISES";
export const SITE_URL = "https://www.shoerack.space";
const pageMetadata: Record<
  string,
  { title: string; description: string; heading: string }
> = {
  "/": {
    title: `Buy a Shoe Rack Online | ${BRAND_NAME}`,
    description:
      "Shop metal shoe racks, shoe organizers and practical shoe storage for your home.",
    heading: "A place for every pair.",
  },
  "/shop": {
    title: `Shoe Racks, Organizers & Storage | ${BRAND_NAME}`,
    description:
      "Browse shoe racks, shoe organizers and metal shoe stands for practical shoe storage.",
    heading: "Shoe racks, organizers & storage.",
  },
  "/about": {
    title: `About ${BRAND_NAME} | India’s Slimmest Shoe Rack`,
    description: `${BRAND_NAME}: India’s Slimmest Shoe Rack.`,
    heading: "A little order. A better everyday.",
  },
  "/contact": {
    title: `Contact ${BRAND_NAME} | Shoe Rack Support`,
    description:
      "Contact ZAK ENTERPRISES for help choosing a shoe rack or with an existing order.",
    heading: "Let’s find your good fit.",
  },
  "/shipping": {
    title: `Shipping & Delivery | ${BRAND_NAME}`,
    description:
      "Review delivery information and shipping charges before ordering.",
    heading: "Shipping & delivery",
  },
  "/returns": {
    title: `Returns & Exchanges | ${BRAND_NAME}`,
    description: "Read the returns and exchanges information for your order.",
    heading: "Returns & exchanges",
  },
  "/privacy": {
    title: `Privacy Policy | ${BRAND_NAME}`,
    description: `Learn how ${BRAND_NAME} handles customer information.`,
    heading: "Your privacy matters.",
  },
  "/terms": {
    title: `Terms & Conditions | ${BRAND_NAME}`,
    description: `Review the terms and conditions for shopping with ${BRAND_NAME}.`,
    heading: "Terms & conditions",
  },
};

function updateBrand(value: string) {
  return value
    .replace(/\bRufus\s+Shoe Store\b/gi, BRAND_NAME)
    .replace(/\bRufus\b/gi, BRAND_NAME);
}

function brandedTitle(value: string) {
  const title = updateBrand(value)
    .replace(/\s*(?:\||·|—|-)\s*ZAK ENTERPRISES\s*$/i, "")
    .trim();
  return `${title} | ${BRAND_NAME}`;
}

function responsiveSrcSet(src: string, images?: Product["responsiveImages"]) {
  return images
    ?.find((image) => image.src === src)
    ?.variants.map((variant) => `${variant.src} ${variant.width}w`)
    .join(", ");
}

export const escape = (v: unknown) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export const publicPaths = [
  "/",
  "/shop",
  "/about",
  "/contact",
  "/shipping",
  "/returns",
  "/privacy",
  "/terms",
];
export function renderPage(
  template: string,
  path: string,
  products: Product[],
  settings: Settings,
) {
  const p = products.find((p) => path === `/product/${p.slug}`),
    isProduct = path.startsWith("/product/");
  const privatePage = /^\/(admin|cart|checkout|order)(\/|$)/.test(path),
    valid = publicPaths.includes(path) || !!p || privatePage;
  const base = SITE_URL,
    url = base + path,
    title = p
      ? brandedTitle(p.seo.title || p.name)
      : pageMetadata[path]?.title ||
        (!valid ? "Page not found" : `${BRAND_NAME}`);
  const description = p
    ? updateBrand(p.seo.description || p.description)
    : pageMetadata[path]?.description ||
      "Store information from ZAK ENTERPRISES.";
  const photo = p?.images[0] || "/images/social-zak.svg",
    photoUrl = photo.startsWith("/") ? base + photo : photo;
  const schema: Record<string, unknown>[] = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: BRAND_NAME,
      url: base,
      description: "India’s Slimmest Shoe Rack",
    },
  ];
  let content = `<h1>${escape(p?.name || pageMetadata[path]?.heading || title)}</h1><p>${escape(description)}</p>`;
  if (p) {
    const v = p.variants[0];
    const srcSet = responsiveSrcSet(photo, p.responsiveImages);
    schema.push({
      "@context": "https://schema.org",
      "@type": "Product",
      name: p.name,
      description: p.description,
      image: p.images.map((i) => (i.startsWith("/") ? base + i : i)),
      sku: p.sku,
      brand: { "@type": "Brand", name: p.brand },
      offers: {
        "@type": "AggregateOffer",
        priceCurrency: "INR",
        lowPrice: Math.min(...p.variants.map((v) => v.price)) / 100,
        highPrice: Math.max(...p.variants.map((v) => v.price)) / 100,
        offerCount: p.variants.length,
        availability: `https://schema.org/${p.variants.some((v) => v.stock > 0) ? "InStock" : "OutOfStock"}`,
        url,
      },
    });
    schema.push({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Shop",
          item: base + "/shop",
        },
        { "@type": "ListItem", position: 2, name: p.name, item: url },
      ],
    });
    content += `${srcSet ? `<picture><source type="image/webp" srcset="${escape(srcSet)}" sizes="(max-width: 760px) 100vw, 50vw">` : ""}<img src="${escape(photo)}" width="600" height="600" fetchpriority="high" decoding="async" alt="${escape(p.name)}">${srcSet ? "</picture>" : ""}<p>INR ${(v.price / 100).toFixed(2)} · ${v.stock > 0 ? "Available" : "Out of stock"}</p><dl>${Object.entries(
      p.specifications,
    )
      .map(([k, v]) => `<dt>${escape(k)}</dt><dd>${escape(v)}</dd>`)
      .join("")}</dl>`;
  } else if (path === "/" || path === "/shop")
    content += products
      .map((p) => {
        const src = p.images[0] || "/images/social-zak.svg";
        const srcSet = responsiveSrcSet(src, p.responsiveImages);
        return `<article><a href="/product/${escape(p.slug)}"><h2>${escape(p.name)}</h2>${srcSet ? `<picture><source type="image/webp" srcset="${escape(srcSet)}" sizes="(max-width: 760px) 85vw, 22vw">` : ""}<img src="${escape(src)}" width="400" height="400" loading="lazy" decoding="async" alt="${escape(p.name)}">${srcSet ? "</picture>" : ""}</a><p>${escape(p.description)}</p><p>From INR ${(Math.min(...p.variants.map((v) => v.price)) / 100).toFixed(2)}</p></article>`;
      })
      .join("");
  else if (path === "/contact")
    content += `<p>${escape(settings.email)} ${escape(settings.phone)} ${escape(settings.address)}</p>`;
  else if (path.slice(1) in settings.policies)
    content += `<p>${settings.policiesApproved ? "" : "Draft policy — pending store approval. "}${escape(settings.policies[path.slice(1) as keyof Settings["policies"]])}</p>`;
  const meta = `<title>${escape(title)}</title><meta name="description" content="${escape(description)}"><link rel="canonical" href="${escape(url)}"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:site_name" content="${BRAND_NAME}"><meta property="og:url" content="${escape(url)}"><meta property="og:type" content="${p ? "product" : "website"}"><meta property="og:image" content="${escape(photoUrl)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escape(title)}"><meta name="twitter:description" content="${escape(description)}"><meta name="robots" content="${privatePage || !valid || products.some((p) => p.sample) ? "noindex,nofollow" : "index,follow"}"><script type="application/ld+json">${JSON.stringify(schema).replace(/</g, "\\u003c")}</script>`;
  return {
    status: valid ? 200 : 404,
    html: template
      .replace("<!--seo-->", meta)
      .replace(
        "<!--prerender-->",
        `<nav><a href="/">${BRAND_NAME}</a> · <a href="/shop">Shop shoe racks and organizers</a></nav><main>${content}</main>`,
      ),
  };
}
export function sitemap(products: Product[], _settings: Settings) {
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[...publicPaths, ...products.filter((p) => !p.sample).map((p) => "/product/" + p.slug)].map((p) => `<url><loc>${escape(SITE_URL + p)}</loc></url>`).join("")}</urlset>`;
}
