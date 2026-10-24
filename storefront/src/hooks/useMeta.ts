import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useStore } from "../context/Store";
export function useMeta(title: string, description = "", noindex = false) {
  const { pathname } = useLocation();
  const { settings } = useStore();
  const base = (
    settings?.siteUrl ||
    import.meta.env.VITE_SITE_URL ||
    location.origin
  ).replace(/\/$/, "");
  useEffect(() => {
    document.title = title;
    function meta(selector: string, attrs: Record<string, string>) {
      let e = document.head.querySelector(selector);
      if (!e) {
        e = document.createElement(
          selector.startsWith("link") ? "link" : "meta",
        );
        document.head.appendChild(e);
      }
      Object.entries(attrs).forEach(([k, v]) => e!.setAttribute(k, v));
    }
    meta('meta[name="description"]', {
      name: "description",
      content: description,
    });
    meta('meta[name="robots"]', {
      name: "robots",
      content: noindex ? "noindex,nofollow" : "index,follow",
    });
    meta('link[rel="canonical"]', { rel: "canonical", href: base + pathname });
    meta('meta[property="og:title"]', { property: "og:title", content: title });
    meta('meta[property="og:description"]', {
      property: "og:description",
      content: description,
    });
    meta('meta[property="og:url"]', {
      property: "og:url",
      content: base + pathname,
    });
    meta('meta[property="og:type"]', {
      property: "og:type",
      content: pathname.startsWith("/product/") ? "product" : "website",
    });
    meta('meta[property="og:image"]', {
      property: "og:image",
      content: base + "/images/social.svg",
    });
    meta('meta[name="twitter:card"]', {
      name: "twitter:card",
      content: "summary_large_image",
    });
    document
      .querySelectorAll('script[type="application/ld+json"]')
      .forEach((e) => e.remove());
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: settings?.storeName || "Rufus Shoe Store",
      url: base,
    });
    document.head.appendChild(script);
    return () => script.remove();
  }, [title, description, noindex, pathname, base, settings?.storeName]);
}
