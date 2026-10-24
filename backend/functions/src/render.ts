import type { Product, Settings } from "./schema.js";
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
  const base = settings.siteUrl.replace(/\/$/, ""),
    url = base + path,
    title = p
      ? p.seo.title || p.name
      : path === "/"
        ? settings.storeName
        : !valid
          ? "Page not found"
          : `${path.slice(1) || "Home"} · ${settings.storeName}`;
  const description = p ? p.seo.description || p.description : settings.tagline;
  const photo = p?.images[0] || "/images/social.svg",
    photoUrl = photo.startsWith("/") ? base + photo : photo;
  const schema: Record<string, unknown>[] = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: settings.storeName,
      url: base,
    },
  ];
  let content = `<h1>${escape(title)}</h1><p>${escape(description)}</p>`;
  if (p) {
    const v = p.variants[0];
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
    content += `<img src="${escape(photo)}" width="600" height="600" alt="${escape(p.name)}"><p>INR ${(v.price / 100).toFixed(2)} · ${v.stock > 0 ? "Available" : "Out of stock"}</p><dl>${Object.entries(
      p.specifications,
    )
      .map(([k, v]) => `<dt>${escape(k)}</dt><dd>${escape(v)}</dd>`)
      .join("")}</dl>`;
  } else if (path === "/" || path === "/shop")
    content += products
      .map(
        (p) =>
          `<article><a href="/product/${escape(p.slug)}"><h2>${escape(p.name)}</h2><img src="${escape(p.images[0])}" width="400" height="400" alt="${escape(p.name)}"></a><p>${escape(p.description)}</p><p>From INR ${(Math.min(...p.variants.map((v) => v.price)) / 100).toFixed(2)}</p></article>`,
      )
      .join("");
  else if (path === "/contact")
    content += `<p>${escape(settings.email)} ${escape(settings.phone)} ${escape(settings.address)}</p>`;
  else if (path.slice(1) in settings.policies)
    content += `<p>${settings.policiesApproved ? "" : "Draft policy — pending store approval. "}${escape(settings.policies[path.slice(1) as keyof Settings["policies"]])}</p>`;
  const meta = `<title>${escape(title)}</title><meta name="description" content="${escape(description)}"><link rel="canonical" href="${escape(url)}"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:url" content="${escape(url)}"><meta property="og:type" content="${p ? "product" : "website"}"><meta property="og:image" content="${escape(photoUrl)}"><meta name="twitter:card" content="summary_large_image"><meta name="robots" content="${privatePage || !valid || products.some((p) => p.sample) ? "noindex,nofollow" : "index,follow"}"><script type="application/ld+json">${JSON.stringify(schema).replace(/</g, "\\u003c")}</script>`;
  return {
    status: valid ? 200 : 404,
    html: template
      .replace("<!--seo-->", meta)
      .replace(
        "<!--prerender-->",
        `<nav><a href="/">${escape(settings.storeName)}</a> · <a href="/shop">Shop</a></nav><main>${content}</main>`,
      ),
  };
}
export function sitemap(products: Product[], settings: Settings) {
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[...publicPaths, ...products.filter((p) => !p.sample).map((p) => "/product/" + p.slug)].map((p) => `<url><loc>${escape(settings.siteUrl.replace(/\/$/, "") + p)}</loc></url>`).join("")}</urlset>`;
}
