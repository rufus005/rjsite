import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  enableNetwork,
} from "firebase/firestore";
import { db, isEmulator, ensureAppCheck } from "../services/firebase";
import type { Product, Settings, CartLine } from "../types";
const Context = createContext<{
  products: Product[];
  settings: Settings | null;
  loading: boolean;
  error: string;
  retry: () => void;
  cart: CartLine[];
  setCart: (lines: CartLine[]) => void;
  add: (p: Product, v: string, n: number) => void;
}>({} as never);
export const useStore = () => useContext(Context);
export function StoreProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]),
    [settings, setSettings] = useState<Settings | null>(null),
    [loading, setLoading] = useState(true),
    [catalogError, setCatalogError] = useState(""),
    [settingsError, setSettingsError] = useState(""),
    [attempt, setAttempt] = useState(0);
  const error = settingsError || catalogError;
  const retry = () => {
    void enableNetwork(db).catch(() => {});
    setAttempt((n) => n + 1);
  };
  const [cart, setCartState] = useState<CartLine[]>(() => {
    try {
      const c = JSON.parse(localStorage.getItem("rufus-cart") || "[]");
      return Array.isArray(c)
        ? c
            .filter(
              (x) =>
                typeof x.productId === "string" &&
                typeof x.variantId === "string" &&
                Number.isInteger(x.quantity) &&
                x.quantity > 0 &&
                x.quantity <= 10,
            )
            .slice(0, 30)
        : [];
    } catch {
      return [];
    }
  });
  const setCart = (lines: CartLine[]) => {
    setCartState(lines);
    localStorage.setItem("rufus-cart", JSON.stringify(lines));
  };
  useEffect(() => {
    setLoading(true);
    setCatalogError("");
    setSettingsError("");
    let reachedServer = false;
    const timeout = window.setTimeout(() => {
      if (!reachedServer) {
        setLoading(false);
        setSettingsError(
          isEmulator
            ? "Cannot reach the local store backend. Run npm run emulators in backend, keep it running, then try again."
            : "The store is temporarily offline. Please check your connection and try again.",
        );
      }
    }, 8000);
    let cancelled = false;
    let a = () => {};
    let b = () => {};
    void ensureAppCheck()
      .then(() => {
        if (cancelled) return;
        a = onSnapshot(
          query(collection(db, "products"), where("published", "==", true)),
          { includeMetadataChanges: true },
          (snapshot) => {
            setProducts(snapshot.docs.map((d) => d.data() as Product));
            if (!snapshot.metadata.fromCache) {
              setLoading(false);
              setCatalogError("");
            }
          },
          (e) => {
            setCatalogError(e.message);
            setLoading(false);
          },
        );
        b = onSnapshot(
          doc(db, "settings/public"),
          { includeMetadataChanges: true },
          (snapshot) => {
            if (snapshot.exists()) {
              setSettings(snapshot.data() as Settings);
              setSettingsError("");
            }
            if (!snapshot.metadata.fromCache) {
              reachedServer = true;
              window.clearTimeout(timeout);
              if (!snapshot.exists()) {
                setSettings(null);
                setSettingsError(
                  isEmulator
                    ? "The local backend is connected but has no store settings. Restart npm run emulators to initialize the demo catalog."
                    : "Store setup is incomplete. Please contact the store owner.",
                );
              }
            }
          },
          (e) => {
            window.clearTimeout(timeout);
            setSettingsError(e.message);
          },
        );
      })
      .catch((e: Error) => {
        if (cancelled) return;
        window.clearTimeout(timeout);
        setCatalogError(e.message);
        setLoading(false);
      });
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      a();
      b();
    };
  }, [attempt]);
  const add = (p: Product, v: string, n: number) => {
    const variant = p.variants.find((x) => x.id === v);
    if (!variant) return;
    const existing = cart.find(
      (x) => x.productId === p.id && x.variantId === v,
    );
    const quantity = Math.min(10, variant.stock, (existing?.quantity || 0) + n);
    if (quantity < 1) return;
    setCart(
      existing
        ? cart.map((x) => (x === existing ? { ...x, quantity } : x))
        : [...cart, { productId: p.id, variantId: v, quantity }],
    );
  };
  return (
    <Context.Provider
      value={{ products, settings, loading, error, retry, cart, setCart, add }}
    >
      {children}
    </Context.Provider>
  );
}
