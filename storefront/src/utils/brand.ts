export const BRAND_NAME = "ZAK SHOE RACK";
export const BRAND_NAME_TITLE_CASE = "ZAK Shoe Rack";
export const BRAND_TAGLINE = "India’s Slimmest Shoe Rack";
export const BRAND_SITE_URL = "https://www.shoerack.space";

export function updateBrandText(value: string) {
  return value
    .replace(/\bRufus\s+Shoe Store\b/gi, BRAND_NAME)
    .replace(/\bRufus\b/gi, BRAND_NAME);
}

export function brandedTitle(value: string) {
  const title = updateBrandText(value)
    .replace(/\s*(?:\||·|—|-)\s*ZAK SHOE RACK\s*$/i, "")
    .trim();
  return `${title} | ${BRAND_NAME}`;
}
