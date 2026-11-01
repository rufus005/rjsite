import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import {
  BRAND_NAME,
  BRAND_SITE_URL,
  BRAND_TAGLINE,
  updateBrandText,
} from "../utils/brand";
export function useMeta(title: string, description = "", noindex = false) {
  const { pathname } = useLocation();
  const base = BRAND_SITE_URL;
  const pageTitle = updateBrandText(title);
  const pageDescription = updateBrandText(description || BRAND_TAGLINE);
  useEffect(() => {
    document.title = pageTitle;
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
      content: pageDescription,
    });
    meta('meta[name="robots"]', {
      name: "robots",
      content: noindex ? "noindex,nofollow" : "index,follow",
    });
    meta('link[rel="canonical"]', { rel: "canonical", href: base + pathname });
    meta('meta[property="og:title"]', {
      property: "og:title",
      content: pageTitle,
    });
    meta('meta[property="og:description"]', {
      property: "og:description",
      content: pageDescription,
    });
    meta('meta[property="og:site_name"]', {
      property: "og:site_name",
      content: BRAND_NAME,
    });
    meta('meta[property="og:url"]', {
      property: "og:url",
      content: base + pathname,
    });
    meta('meta[property="og:type"]', {
      property: "og:type",
      content: pathname.startsWith("/product/") ? "product" : "website",
    });
    meta('meta[name="twitter:title"]', {
      name: "twitter:title",
      content: pageTitle,
    });
    meta('meta[name="twitter:description"]', {
      name: "twitter:description",
      content: pageDescription,
    });
    meta('meta[property="og:image"]', {
      property: "og:image",
      content: base + "/images/social-zak.svg",
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
      name: BRAND_NAME,
      url: base,
      description: BRAND_TAGLINE,
    });
    document.head.appendChild(script);
    return () => script.remove();
  }, [pageTitle, pageDescription, noindex, pathname, base]);
}
