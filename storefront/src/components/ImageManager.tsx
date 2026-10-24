import { useState } from "react";
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
} from "firebase/storage";
import { storage, prepareAdminRequest } from "../services/firebase";
import { errorMessage } from "../utils/format";
export default function ImageManager({
  images,
  onChange,
  kind = "products",
  single = false,
  onBusyChange,
}: {
  images: string[];
  onChange: (images: string[]) => void;
  kind?: "products" | "qr" | "banners";
  single?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
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
            />
            <div>
              {!single && (
                <>
                  <button
                    type="button"
                    disabled={i === 0}
                    aria-label={`Move image ${i + 1} earlier`}
                    onClick={() => {
                      const n = [...images];
                      [n[i - 1], n[i]] = [n[i], n[i - 1]];
                      onChange(n);
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
                      onChange(n);
                    }}
                  >
                    →
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => onChange(images.filter((_, j) => j !== i))}
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
              const object = ref(
                storage,
                `public/${kind}/${crypto.randomUUID()}`,
              );
              await uploadBytes(object, f, { contentType: f.type });
              const url = await getDownloadURL(object);
              onChange(single ? [url] : [...images, url]);
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
        Removal updates the form. Save to publish. Existing objects remain to
        preserve any other references.
      </small>
    </div>
  );
}
// Explicit cleanup utility for an administrator after checking that no catalog/settings reference remains.
export async function removeUnusedImage(url: string) {
  await prepareAdminRequest();
  await deleteObject(ref(storage, url));
}
