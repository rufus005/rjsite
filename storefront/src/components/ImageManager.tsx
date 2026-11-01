import { useState } from "react";
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
} from "firebase/storage";
import { prepareAdminRequest } from "../services/firebase/auth";
import { storage } from "../services/firebase/storage";
import { errorMessage } from "../utils/format";
import type { ResponsiveImage } from "../types";

async function makeWebpSizes(file: Blob) {
  const bitmap = await createImageBitmap(file);
  try {
    if (
      bitmap.width > 8000 ||
      bitmap.height > 8000 ||
      bitmap.width * bitmap.height > 40000000
    )
      throw Error(
        "The image dimensions are too large to optimize in the browser.",
      );
    const widths = [
      ...new Set([480, 960, 1600].filter((width) => width < bitmap.width)),
      bitmap.width,
    ].sort((a, b) => a - b);
    return await Promise.all(
      widths.map(async (width) => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = Math.max(
          1,
          Math.round((bitmap.height * width) / bitmap.width),
        );
        const context = canvas.getContext("2d");
        if (!context) throw Error("This browser cannot process the image.");
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const image = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (blob) =>
              blob ? resolve(blob) : reject(Error("WebP encoding failed.")),
            "image/webp",
            0.8,
          ),
        );
        if (image.type !== "image/webp")
          throw Error("This browser does not support WebP encoding.");
        if (image.size >= 5 * 1024 * 1024)
          throw Error("An optimized image is still over 5 MB.");
        return { width, image };
      }),
    );
  } finally {
    bitmap.close();
  }
}

async function uploadWebpSizes(file: Blob, kind: string, src?: string) {
  const sizes = await makeWebpSizes(file);
  const id = crypto.randomUUID();
  const fallback = src
    ? undefined
    : ref(storage, `public/${kind}/${id}-original`);
  if (fallback)
    await uploadBytes(fallback, file, {
      contentType: file.type,
      cacheControl: "public, max-age=31536000, immutable",
    });
  const variants = await Promise.all(
    sizes.map(async ({ width, image }) => {
      const object = ref(storage, `public/${kind}/${id}-${width}.webp`);
      await uploadBytes(object, image, {
        contentType: "image/webp",
        cacheControl: "public, max-age=31536000, immutable",
      });
      return { src: await getDownloadURL(object), width };
    }),
  );
  return {
    src:
      src || (fallback ? await getDownloadURL(fallback) : variants.at(-1)!.src),
    variants,
  };
}

async function fetchImage(src: string) {
  const response = await fetch(src);
  if (!response.ok)
    throw Error(`Could not download the existing image (${response.status}).`);
  const contentLength = Number(response.headers.get("content-length"));
  if (contentLength > 25 * 1024 * 1024)
    throw Error("The existing image is too large to optimize in the browser.");
  const image = await response.blob();
  if (!image.type.startsWith("image/"))
    throw Error("The existing file is not an image.");
  if (image.size > 25 * 1024 * 1024)
    throw Error("The existing image is too large to optimize in the browser.");
  return image;
}

export default function ImageManager({
  images,
  responsiveImages,
  onChange,
  onResponsiveImagesChange,
  kind = "products",
  single = false,
  onBusyChange,
}: {
  images: string[];
  responsiveImages?: ResponsiveImage[];
  onChange: (images: string[]) => void;
  onResponsiveImagesChange?: (images: ResponsiveImage[]) => void;
  kind?: "products" | "qr" | "banners";
  single?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const updateImages = (next: string[]) => {
    onChange(next);
    onResponsiveImagesChange?.(
      (responsiveImages || []).filter((image) => next.includes(image.src)),
    );
  };
  const updateResponsiveImage = async (src: string) => {
    setError("");
    setBusy(true);
    onBusyChange?.(true);
    try {
      await prepareAdminRequest();
      const file = await fetchImage(src);
      const optimized = await uploadWebpSizes(file, kind, src);
      onResponsiveImagesChange?.([
        ...(responsiveImages || []).filter((image) => image.src !== src),
        optimized,
      ]);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  };
  return (
    <div className="image-manager">
      <div className="image-list">
        {images.map((src, i) => (
          <div key={src}>
            <img
              src={src}
              width="100"
              height="100"
              alt={`${kind} preview ${i + 1}`}
              loading="lazy"
              decoding="async"
            />
            <div>
              {responsiveImages?.some((image) => image.src === src) ? (
                <small>Responsive WebP sizes ready</small>
              ) : (
                kind !== "qr" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void updateResponsiveImage(src)}
                  >
                    {busy ? "Optimizing…" : "Optimize for screen sizes"}
                  </button>
                )
              )}
              {!single && (
                <>
                  <button
                    type="button"
                    disabled={i === 0}
                    aria-label={`Move image ${i + 1} earlier`}
                    onClick={() => {
                      const n = [...images];
                      [n[i - 1], n[i]] = [n[i], n[i - 1]];
                      updateImages(n);
                    }}
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    disabled={i === images.length - 1}
                    aria-label={`Move image ${i + 1} later`}
                    onClick={() => {
                      const n = [...images];
                      [n[i + 1], n[i]] = [n[i], n[i + 1]];
                      updateImages(n);
                    }}
                  >
                    →
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => updateImages(images.filter((_, j) => j !== i))}
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
      <label>
        {busy
          ? "Uploading…"
          : single
            ? "Upload / replace image"
            : "Upload image"}
        <input
          type="file"
          disabled={busy}
          accept="image/png,image/jpeg,image/webp"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setError("");
            setBusy(true);
            onBusyChange?.(true);
            try {
              if (
                f.size >= 5 * 1024 * 1024 ||
                !["image/png", "image/jpeg", "image/webp"].includes(f.type)
              )
                throw Error("Use JPEG, PNG or WebP under 5 MB.");
              await prepareAdminRequest();
              if (kind === "qr") {
                const object = ref(
                  storage,
                  `public/${kind}/${crypto.randomUUID()}`,
                );
                await uploadBytes(object, f, {
                  contentType: f.type,
                  cacheControl: "public, max-age=31536000, immutable",
                });
                const url = await getDownloadURL(object);
                updateImages(single ? [url] : [...images, url]);
              } else {
                const optimized = await uploadWebpSizes(f, kind);
                const next = single
                  ? [optimized.src]
                  : [...images, optimized.src];
                onChange(next);
                onResponsiveImagesChange?.(
                  single
                    ? [optimized]
                    : [
                        ...(responsiveImages || []).filter((image) =>
                          images.includes(image.src),
                        ),
                        optimized,
                      ],
                );
              }
            } catch (e) {
              setError(errorMessage(e));
            } finally {
              setBusy(false);
              onBusyChange?.(false);
            }
          }}
        />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <small>
        New product and banner uploads are converted to cached WebP screen
        sizes. Use “Optimize for screen sizes” on existing images; QR images are
        kept unchanged. Save to publish. Existing objects remain to preserve any
        other references.
      </small>
    </div>
  );
}
// Explicit cleanup utility for an administrator after checking that no catalog/settings reference remains.
export async function removeUnusedImage(url: string) {
  await prepareAdminRequest();
  await deleteObject(ref(storage, url));
}
