type PixelArgs = [
  "init" | "track" | "trackCustom",
  string,
  Record<string, string | number | string[]>?,
];
type MetaPixel = {
  (...args: PixelArgs): void;
  callMethod?: (...args: PixelArgs) => void;
  queue: PixelArgs[];
  loaded: boolean;
  version: string;
};

declare global {
  interface Window {
    fbq?: MetaPixel;
  }
}

const pixelId =
  import.meta.env.VITE_META_PIXEL_ID?.trim() || "2277084086405412";
let initializedId = "";

function initializePixel() {
  if (!pixelId) return;
  if (initializedId === pixelId) return window.fbq;
  let pixel = window.fbq;
  if (!pixel) {
    const queue: PixelArgs[] = [];
    pixel = Object.assign(
      (...args: PixelArgs) => {
        if (pixel?.callMethod) pixel.callMethod(...args);
        else queue.push(args);
      },
      { queue, loaded: true, version: "2.0" },
    );
    window.fbq = pixel;
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.appendChild(script);
  }
  pixel("init", pixelId);
  initializedId = pixelId;
  return pixel;
}

export function trackPageView(path: string) {
  if (/^\/(admin|order)(\/|$)/.test(path)) return;
  initializePixel()?.("track", "PageView");
}

export function trackProductView(
  product: { id: string; name: string },
  price: number,
) {
  initializePixel()?.("track", "ViewContent", {
    content_ids: [product.id],
    content_name: product.name,
    content_type: "product",
    currency: "INR",
    value: price / 100,
  });
}

export function trackContactClick(target: EventTarget | null) {
  if (!(target instanceof Element)) return;
  const link = target.closest("a");
  const href = link?.getAttribute("href") || "";
  const method = href.startsWith("tel:")
    ? "phone"
    : /^https?:\/\/wa\.me\//i.test(href)
      ? "whatsapp"
      : "";
  if (method)
    initializePixel()?.("track", "Contact", { contact_method: method });
}
