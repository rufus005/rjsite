import type { ImgHTMLAttributes } from "react";
import type { ResponsiveImage } from "../types";

export function responsiveSrcSet(
  src: string,
  images: ResponsiveImage[] | undefined,
) {
  const image = images?.find((candidate) => candidate.src === src);
  return image?.variants
    .map((variant) => `${variant.src} ${variant.width}w`)
    .join(", ");
}

export function ResponsiveImg({
  src,
  responsiveImages,
  sizes,
  ...props
}: Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "srcSet"> & {
  src: string;
  responsiveImages?: ResponsiveImage[];
  sizes?: string;
}) {
  const srcSet = responsiveSrcSet(src, responsiveImages);
  return srcSet ? (
    <picture>
      <source type="image/webp" srcSet={srcSet} sizes={sizes} />
      <img src={src} sizes={sizes} {...props} />
    </picture>
  ) : (
    <img src={src} sizes={sizes} {...props} />
  );
}
