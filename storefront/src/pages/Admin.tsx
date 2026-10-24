import { useEffect, useState, type FormEvent } from "react";
import {
  onIdTokenChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { getBlob, ref } from "firebase/storage";
import { Link } from "react-router-dom";
import {
  auth,
  call,
  db,
  storage,
  prepareAdminRequest,
  ensureAppCheck,
} from "../services/firebase";
import { useStore } from "../context/Store";
import { useMeta } from "../hooks/useMeta";
import { errorMessage, money, words } from "../utils/format";
import type { Order, Product, Settings, Variant } from "../types";
import ImageManager from "../components/ImageManager";
const emptyVariant = (): Variant => ({
  id: crypto.randomUUID(),
  name: "Default",
  color: "",
  size: "",
  sku: "",
  price: 0,
  originalPrice: 0,
  stock: 0,
  images: [],
});
const emptyProduct = (): Product => ({
  id: crypto.randomUUID(),
  name: "",
  slug: "",
  description: "",
  type: "rack",
  category: "",
  brand: "",
  sku: "",
  published: false,
  sample: false,
  images: [],
  specifications: { Capacity: "", Dimensions: "", Material: "" },
  warranty: "1-Year Warranty",
  warrantyApproved: false,
  sourceUrls: [],
  seo: { title: "", description: "" },
  variants: [emptyVariant()],
});
const timestamp = (v: Order["createdAt"]) =>
  typeof v === "number" ? v : v.seconds * 1000;
export default function Admin() {
  useMeta("Administration | Rufus", "", true);
  const [isAdmin, setIsAdmin] = useState(false),
    [authReady, setAuthReady] = useState(false),
    [email, setEmail] = useState(import.meta.env.VITE_ADMIN_EMAIL || ""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState("Dashboard");
  const [products, setProducts] = useState<Product[]>([]),
    [orders, setOrders] = useState<Order[]>([]),
    [audit, setAudit] = useState<Record<string, unknown>[]>([]);
  useEffect(
    () =>
      onIdTokenChanged(auth, async (u) => {
        try {
          const allowed =
            !!u && (await u.getIdTokenResult()).claims.admin === true;
          if (auth.currentUser !== u) return;
          setIsAdmin(allowed);
        } catch (e) {
          if (auth.currentUser !== u) return;
          setIsAdmin(false);
          setError(errorMessage(e));
        }
        setAuthReady(true);
      }),
    [],
  );
  useEffect(() => {
    if (!isAdmin) return;
    const err = (e: Error) => setError(e.message);
    let cancelled = false;
    let a = () => {},
      b = () => {},
      c = () => {};
    void ensureAppCheck()
      .then(() => {
        if (cancelled) return;
        a = onSnapshot(
          collection(db, "products"),
          (s) => setProducts(s.docs.map((d) => d.data() as Product)),
          err,
        );
        b = onSnapshot(
          query(collection(db, "orders"), orderBy("createdAt", "desc")),
          (s) => setOrders(s.docs.map((d) => d.data() as Order)),
          err,
        );
        c = onSnapshot(
          query(collection(db, "audit"), orderBy("at", "desc")),
          (s) =>
            setAudit(
              s.docs.slice(0, 100).map((d) => ({ id: d.id, ...d.data() })),
            ),
          err,
        );
      })
      .catch((e: Error) => {
        if (!cancelled) err(e);
      });
    return () => {
      cancelled = true;
      a();
      b();
      c();
    };
  }, [isAdmin]);
  async function run(name: string, data: unknown) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await prepareAdminRequest();
      await call(name, data);
      setNotice("Saved successfully.");
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  if (!authReady) return <div className="section">Checking access…</div>;
  if (!isAdmin)
    return (
      <div className="admin-login">
        <Link className="wordmark" to="/">
          rufus<span>STORE ADMINISTRATION</span>
        </Link>
        <h1>Welcome back.</h1>
        <p>Sign in with your administrator account.</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            setBusy(true);
            try {
              const u = await signInWithEmailAndPassword(auth, email, password);
              const token = await u.user.getIdTokenResult(true);
              if (token.claims.admin !== true) {
                await signOut(auth);
                throw Error(
                  "This account does not have an administrator claim. Contact the store owner.",
                );
              }
            } catch (e) {
              setError(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Email
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button className="button full" disabled={busy}>
            Sign in
          </button>
        </form>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        <p>
          <Link to="/">← Return to the store</Link>
        </p>
      </div>
    );
  const verified = orders.filter(
    (o) =>
      o.paymentStatus === "paid" &&
      !["cancelled", "expired"].includes(o.fulfillmentStatus),
  );
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link className="wordmark" to="/">
          rufus<span>STORE ADMINISTRATION</span>
        </Link>
        <nav>
          {[
            "Dashboard",
            "Products",
            "Orders",
            "Settings",
            "Categories",
            "Audit",
          ].map((t) => (
            <button
              key={t}
              className={tab === t ? "active" : ""}
              onClick={() => {
                setTab(t);
                setError("");
                setNotice("");
              }}
            >
              {t}
            </button>
          ))}
        </nav>
        <button onClick={() => signOut(auth)}>Sign out</button>
        <Link to="/">View storefront ↗</Link>
      </aside>
      <main className="admin-main">
        <div className="section-heading">
          <div>
            <span className="eyebrow">YOUR STORE, AT A GLANCE</span>
            <h1>{tab}</h1>
          </div>
          <span className="admin-badge">Verified administrator</span>
        </div>
        {error && (
          <p role="alert" className="notice error">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="notice">
            {notice}
          </p>
        )}
        {tab === "Dashboard" && (
          <>
            <div className="stats">
              {[
                ["All orders", orders.length],
                [
                  "Payment reviews",
                  orders.filter(
                    (o) =>
                      o.paymentStatus === "pending_verification" &&
                      !["cancelled", "expired"].includes(o.fulfillmentStatus),
                  ).length,
                ],
                [
                  "Verified sales",
                  money(verified.reduce((n, o) => n + o.total, 0)),
                ],
                [
                  "Low stock variants",
                  products.flatMap((p) => p.variants).filter((v) => v.stock < 5)
                    .length,
                ],
              ].map(([label, n]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{n}</strong>
                </div>
              ))}
            </div>
            <h2>Recent orders</h2>
            <OrderTable
              orders={orders.slice(0, 8)}
              onSelect={() => setTab("Orders")}
            />
            <h2>Inventory attention</h2>
            {products
              .filter((p) => p.variants.some((v) => v.stock < 5))
              .map((p) => (
                <p key={p.id}>
                  {p.name}:{" "}
                  {p.variants
                    .filter((v) => v.stock < 5)
                    .map((v) => `${v.name} (${v.stock})`)
                    .join(", ")}
                </p>
              ))}
          </>
        )}
        {tab === "Products" && (
          <Products products={products} run={run} busy={busy} />
        )}{" "}
        {tab === "Orders" && <Orders orders={orders} run={run} busy={busy} />}{" "}
        {tab === "Settings" && <SettingsEditor run={run} busy={busy} />}{" "}
        {tab === "Categories" && <Categories run={run} busy={busy} />}{" "}
        {tab === "Audit" && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Actor</th>
                  <th>Target</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((a) => (
                  <tr key={String(a.id)}>
                    <td>{String(a.action)}</td>
                    <td>{String(a.actor)}</td>
                    <td>
                      {String(a.orderId || a.productId || "Store settings")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>
              Showing the latest 100 recorded changes. Full audit documents
              retain before/after values.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
type Runner = (name: string, data: unknown) => Promise<boolean>;
function Products({
  products,
  run,
  busy,
}: {
  products: Product[];
  run: Runner;
  busy: boolean;
}) {
  const [edit, setEdit] = useState<Product | null>(null),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState("all");
  const [specs, setSpecs] = useState(""),
    [validation, setValidation] = useState(""),
    [pendingUploads, setPendingUploads] = useState(0);
  const updatePendingUploads = (uploading: boolean) =>
    setPendingUploads((count) => count + (uploading ? 1 : -1));
  const start = (p: Product) => {
    setEdit(structuredClone(p));
    setSpecs(JSON.stringify(p.specifications, null, 2));
    setValidation("");
  };
  if (!edit)
    return (
      <>
        <div className="admin-toolbar">
          <input
            aria-label="Search products"
            placeholder="Search name, brand, category or SKU"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            aria-label="Product status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">All products</option>
            <option value="published">Published</option>
            <option value="draft">Draft / archived</option>
          </select>
          <button className="button" onClick={() => start(emptyProduct())}>
            Add product
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Category / Brand</th>
                <th>Stock</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {products
                .filter(
                  (p) =>
                    `${p.name} ${p.sku} ${p.brand} ${p.category}`
                      .toLowerCase()
                      .includes(search.toLowerCase()) &&
                    (status === "all" ||
                      p.published === (status === "published")),
                )
                .map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.name}</strong>
                      <small>{p.sku}</small>
                    </td>
                    <td>
                      {p.category}
                      <small>{p.brand}</small>
                    </td>
                    <td>{p.variants.reduce((n, v) => n + v.stock, 0)}</td>
                    <td>{p.published ? "Published" : "Draft / archived"}</td>
                    <td>
                      <button onClick={() => start(p)}>Edit</button>
                      <button
                        disabled={busy}
                        onClick={() => {
                          if (
                            confirm(
                              "Archive this product? Existing orders and stock history will be retained.",
                            )
                          )
                            void run("saveProduct", { ...p, published: false });
                        }}
                      >
                        Archive
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </>
    );
  const field = (key: keyof Product, value: unknown) =>
    setEdit({ ...edit, [key]: value });
  const variant = (index: number, key: keyof Variant, value: unknown) =>
    field(
      "variants",
      edit.variants.map((v, i) => (i === index ? { ...v, [key]: value } : v)),
    );
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setValidation("");
        try {
          const parsed = JSON.parse(specs);
          if (
            !parsed ||
            Array.isArray(parsed) ||
            typeof parsed !== "object" ||
            Object.values(parsed).some((v) => typeof v !== "string")
          )
            throw Error(
              "Specifications must be an object of text keys and text values.",
            );
          if (await run("saveProduct", { ...edit, specifications: parsed }))
            setEdit(null);
        } catch (e) {
          setValidation(errorMessage(e));
        }
      }}
      className="admin-editor"
    >
      <div className="button-row">
        <button type="button" onClick={() => setEdit(null)}>
          ← Products
        </button>
        <button className="button" disabled={busy || pendingUploads > 0}>
          Save product
        </button>
      </div>
      {validation && (
        <p className="error" role="alert">
          {validation}
        </p>
      )}
      <div className="form-grid">
        {[
          ["name", "Product name"],
          ["slug", "Unique URL slug"],
          ["sku", "SKU"],
          ["category", "Category"],
          ["brand", "Brand"],
        ].map(([key, label]) => (
          <label key={key}>
            {label}
            <input
              required={key !== "brand"}
              value={String(edit[key as keyof Product])}
              onChange={(e) => field(key as keyof Product, e.target.value)}
            />
          </label>
        ))}
        <label>
          Product type
          <select
            value={edit.type}
            onChange={(e) => field("type", e.target.value)}
          >
            <option value="rack">Shoe rack</option>
            <option value="storage">Storage</option>
            <option value="footwear">Footwear</option>
          </select>
        </label>
      </div>
      <label>
        Description
        <textarea
          required
          minLength={10}
          value={edit.description}
          onChange={(e) => field("description", e.target.value)}
        />
      </label>
      <div className="button-row">
        <label className="check">
          <input
            type="checkbox"
            checked={edit.published}
            onChange={(e) => field("published", e.target.checked)}
          />
          Published
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={edit.sample}
            onChange={(e) => field("sample", e.target.checked)}
          />
          Sample (emulator only)
        </label>
      </div>
      <h2>Product images</h2>
      <ImageManager
        images={edit.images}
        onChange={(v) => field("images", v)}
        onBusyChange={updatePendingUploads}
      />
      <h2>Variants & inventory</h2>
      <p>
        Prices use integer paise: ₹1 = 100 paise. Existing variant IDs cannot be
        removed, preserving order history. Set stock to zero to retire a
        variant.
      </p>
      {edit.variants.map((v, i) => (
        <fieldset className="variant-editor" key={v.id}>
          <legend>Variant {i + 1}</legend>
          <div className="form-grid">
            {[
              ["name", "Name"],
              ["color", "Color"],
              ["sku", "Variant SKU"],
              ...(edit.type === "footwear" ? [["size", "Size"]] : []),
            ].map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  required={key === "name" || key === "sku"}
                  value={String(v[key as keyof Variant])}
                  onChange={(e) =>
                    variant(i, key as keyof Variant, e.target.value)
                  }
                />
              </label>
            ))}
            {[
              ["price", "Selling price (paise)"],
              ["originalPrice", "Original price (paise)"],
              ["stock", "Available stock"],
            ].map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  type="number"
                  required
                  min="0"
                  step="1"
                  value={Number(v[key as keyof Variant])}
                  onChange={(e) =>
                    variant(i, key as keyof Variant, Number(e.target.value))
                  }
                />
              </label>
            ))}
          </div>
          <ImageManager
            images={v.images}
            onChange={(images) => variant(i, "images", images)}
            onBusyChange={updatePendingUploads}
          />
        </fieldset>
      ))}
      <button
        type="button"
        onClick={() => field("variants", [...edit.variants, emptyVariant()])}
      >
        Add variant
      </button>
      <h2>Specifications & warranty</h2>
      <label>
        Specifications (JSON key/value pairs: Capacity, Dimensions, Material for
        racks)
        <textarea
          rows={7}
          value={specs}
          onChange={(e) => setSpecs(e.target.value)}
        />
      </label>
      <label>
        Warranty text
        <input
          value={edit.warranty}
          onChange={(e) => field("warranty", e.target.value)}
        />
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={edit.warrantyApproved}
          onChange={(e) => field("warrantyApproved", e.target.checked)}
        />
        I have verified and approved this product’s warranty claim
      </label>
      <label>
        Product fact source URLs (one per line)
        <textarea
          value={edit.sourceUrls.join("\n")}
          onChange={(e) =>
            field("sourceUrls", e.target.value.split("\n").filter(Boolean))
          }
        />
      </label>
      <h2>Search preview</h2>
      <label>
        SEO title
        <input
          value={edit.seo.title}
          onChange={(e) => field("seo", { ...edit.seo, title: e.target.value })}
        />
      </label>
      <label>
        SEO description
        <textarea
          value={edit.seo.description}
          onChange={(e) =>
            field("seo", { ...edit.seo, description: e.target.value })
          }
        />
      </label>
      <button className="button" disabled={busy || pendingUploads > 0}>
        Save product
      </button>
    </form>
  );
}
function OrderTable({
  orders,
  onSelect,
}: {
  orders: Order[];
  onSelect: (o: Order) => void;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Order</th>
            <th>Buyer</th>
            <th>Payment</th>
            <th>Fulfillment</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td>
                <button className="text-button" onClick={() => onSelect(o)}>
                  {o.reference}
                </button>
                <small>
                  {new Date(timestamp(o.createdAt)).toLocaleDateString()}
                </small>
              </td>
              <td>{o.buyer.name}</td>
              <td>
                {o.paymentMethod.toUpperCase()}
                <small>{words(o.paymentStatus)}</small>
                {o.duplicateReference && (
                  <strong className="error">Repeated reference</strong>
                )}
              </td>
              <td>{words(o.fulfillmentStatus)}</td>
              <td>{money(o.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!orders.length && <p>No matching orders.</p>}
    </div>
  );
}
function Orders({
  orders,
  run,
  busy,
}: {
  orders: Order[];
  run: Runner;
  busy: boolean;
}) {
  const [selected, setSelected] = useState(""),
    [search, setSearch] = useState(""),
    [method, setMethod] = useState(""),
    [payment, setPayment] = useState(""),
    [fulfillment, setFulfillment] = useState(""),
    [date, setDate] = useState(""),
    [endDate, setEndDate] = useState(""),
    [bank, setBank] = useState(false),
    [tracking, setTracking] = useState({ carrier: "", number: "", url: "" }),
    [receipt, setReceipt] = useState(""),
    [receiptError, setReceiptError] = useState("");
  const o = orders.find((o) => o.id === selected);
  useEffect(() => {
    setBank(false);
    setTracking(o?.tracking || { carrier: "", number: "", url: "" });
    setReceipt("");
  }, [selected]);
  useEffect(
    () => () => {
      if (receipt) URL.revokeObjectURL(receipt);
    },
    [receipt],
  );
  const action = async (a: string) => {
    if (o)
      await run("updateOrder", {
        id: o.id,
        action: a,
        ...(a === "approve_payment" ? { bankRecordChecked: bank } : {}),
        ...(a === "ship" ? { tracking } : {}),
      });
  };
  if (o)
    return (
      <div>
        <button onClick={() => setSelected("")}>← All orders</button>
        <h2>{o.reference}</h2>
        <div className="order-status">
          <div>
            Payment<strong>{words(o.paymentStatus)}</strong>
          </div>
          <div>
            Fulfillment<strong>{words(o.fulfillmentStatus)}</strong>
          </div>
        </div>
        <div className="form-grid">
          <section className="form-panel">
            <h3>Buyer & delivery</h3>
            <p>
              {o.buyer.name}
              <br />
              {o.buyer.phone}
              <br />
              {o.buyer.email}
            </p>
            <p>
              {o.buyer.address}
              <br />
              {o.buyer.pin}, {o.buyer.city}, {o.buyer.state}
            </p>
          </section>
          <section className="form-panel">
            <h3>Payment review</h3>
            <p>
              {o.paymentMethod.toUpperCase()} · {money(o.total)}
            </p>
            <p>
              UTR: <code>{o.utr || "Not applicable"}</code>
            </p>
            {o.duplicateReference && (
              <p className="notice error">
                Repeated reference: inspect bank records and other orders before
                approving.
              </p>
            )}
            {o.receiptPath && (
              <button
                onClick={async () => {
                  try {
                    setReceiptError("");
                    const blob = await getBlob(ref(storage, o.receiptPath));
                    setReceipt(URL.createObjectURL(blob));
                  } catch (e) {
                    setReceiptError(errorMessage(e));
                  }
                }}
              >
                View private receipt
              </button>
            )}
            {receipt && (
              <img
                className="receipt-preview"
                src={receipt}
                alt="Customer-submitted unverified receipt"
              />
            )}
            {receiptError && <p className="error">{receiptError}</p>}
            {o.paymentStatus === "pending_verification" && (
              <>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={bank}
                    onChange={(e) => setBank(e.target.checked)}
                  />
                  I checked the actual bank/payment record, amount and
                  recipient.
                </label>
                <button
                  disabled={busy || !bank}
                  onClick={() => action("approve_payment")}
                >
                  Approve payment
                </button>
                <button
                  disabled={busy}
                  onClick={() => {
                    if (confirm("Reject this payment and release stock?"))
                      void action("reject");
                  }}
                >
                  Reject payment
                </button>
              </>
            )}
            {o.fulfillmentStatus === "pending_verification" &&
              o.paymentMethod === "cod" && (
                <button disabled={busy} onClick={() => action("verify_cod")}>
                  Confirm COD verification
                </button>
              )}
            {o.paymentMethod === "cod" &&
              o.fulfillmentStatus === "delivered" &&
              o.paymentStatus === "unpaid" && (
                <button disabled={busy} onClick={() => action("cod_collected")}>
                  Record COD collection
                </button>
              )}
          </section>
        </div>
        <section className="form-panel">
          <h3>Items & authoritative total</h3>
          {o.lines.map((l) => (
            <p key={l.productId + l.variantId}>
              {l.name} · {l.variant} × {l.quantity} — {money(l.lineTotal)}
            </p>
          ))}
          <p>
            Delivery {money(o.shipping)} · COD fee {money(o.codFee)} ·{" "}
            <strong>Total {money(o.total)}</strong>
          </p>
        </section>
        <section className="form-panel">
          <h3>Fulfillment</h3>
          <div className="button-row">
            {o.fulfillmentStatus === "confirmed" && (
              <button
                disabled={
                  busy ||
                  (o.paymentMethod === "upi" && o.paymentStatus !== "paid")
                }
                onClick={() => action("processing")}
              >
                Start processing
              </button>
            )}
            {o.fulfillmentStatus === "shipped" && (
              <button disabled={busy} onClick={() => action("deliver")}>
                Mark delivered
              </button>
            )}
            {!["shipped", "delivered", "cancelled", "expired"].includes(
              o.fulfillmentStatus,
            ) &&
              o.paymentStatus !== "paid" && (
                <button
                  disabled={busy}
                  onClick={() => {
                    if (confirm("Cancel and restore reserved inventory?"))
                      void action("cancel");
                  }}
                >
                  Cancel order
                </button>
              )}
          </div>
          {o.fulfillmentStatus === "processing" && (
            <>
              <div className="form-grid">
                {[
                  ["carrier", "Carrier"],
                  ["number", "Tracking number"],
                  ["url", "Tracking URL (HTTPS, optional)"],
                ].map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <input
                      value={tracking[key as keyof typeof tracking]}
                      onChange={(e) =>
                        setTracking({ ...tracking, [key]: e.target.value })
                      }
                    />
                  </label>
                ))}
              </div>
              <button
                disabled={busy || !tracking.carrier || !tracking.number}
                onClick={() => action("ship")}
              >
                Ship with tracking
              </button>
            </>
          )}
          {o.tracking.number && (
            <p>
              {o.tracking.carrier}: {o.tracking.number}
            </p>
          )}
        </section>
      </div>
    );
  return (
    <>
      <div className="admin-toolbar">
        <input
          aria-label="Search orders"
          placeholder="Order reference, buyer, phone or UTR"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          aria-label="Payment method filter"
          value={method}
          onChange={(e) => setMethod(e.target.value)}
        >
          <option value="">All payment methods</option>
          <option value="cod">COD</option>
          <option value="upi">UPI</option>
        </select>
        <select
          aria-label="Payment status filter"
          value={payment}
          onChange={(e) => setPayment(e.target.value)}
        >
          <option value="">All payment statuses</option>
          {["unpaid", "pending_verification", "paid", "rejected"].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <select
          aria-label="Fulfillment filter"
          value={fulfillment}
          onChange={(e) => setFulfillment(e.target.value)}
        >
          <option value="">All fulfillment</option>
          {[
            "pending_verification",
            "confirmed",
            "processing",
            "shipped",
            "delivered",
            "cancelled",
            "expired",
          ].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <label>
          From
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label>
          Through
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </label>
      </div>
      <OrderTable
        orders={orders.filter(
          (o) =>
            `${o.reference} ${o.buyer.name} ${o.buyer.phone} ${o.utr}`
              .toLowerCase()
              .includes(search.toLowerCase()) &&
            (!method || o.paymentMethod === method) &&
            (!payment || o.paymentStatus === payment) &&
            (!fulfillment || o.fulfillmentStatus === fulfillment) &&
            (!date || timestamp(o.createdAt) >= new Date(date).getTime()) &&
            (!endDate ||
              timestamp(o.createdAt) < new Date(endDate).getTime() + 86400000),
        )}
        onSelect={(o) => setSelected(o.id)}
      />
    </>
  );
}
function SettingsEditor({ run, busy }: { run: Runner; busy: boolean }) {
  const { settings } = useStore();
  const [s, setS] = useState<Settings | null>(
    settings ? structuredClone(settings) : null,
  );
  const [pendingUploads, setPendingUploads] = useState(0);
  const updatePendingUploads = (uploading: boolean) =>
    setPendingUploads((count) => count + (uploading ? 1 : -1));
  useEffect(() => {
    if (!s && settings) setS(structuredClone(settings));
  }, [settings, s]);
  if (!s)
    return (
      <p>
        No settings document. Seed emulators or create the initial settings with
        the documented bootstrap.
      </p>
    );
  return (
    <form
      className="admin-editor"
      onSubmit={async (e: FormEvent) => {
        e.preventDefault();
        await run("saveSettings", s);
      }}
    >
      <h2>Store identity & contact</h2>
      <div className="form-grid">
        {[
          ["storeName", "Store name"],
          ["tagline", "Tagline"],
          ["email", "Email"],
          ["phone", "Phone"],
          ["whatsapp", "WhatsApp (country code + digits)"],
          ["address", "Store address"],
          ["siteUrl", "Canonical site URL"],
          ["banner", "Announcement banner"],
        ].map(([key, label]) => (
          <label key={key}>
            {label}
            <input
              value={String(s[key as keyof Settings])}
              onChange={(e) => setS({ ...s, [key]: e.target.value })}
            />
          </label>
        ))}
      </div>
      <h3>Home banner image</h3>
      <ImageManager
        kind="banners"
        single
        images={s.bannerImage ? [s.bannerImage] : []}
        onChange={(images) => setS({ ...s, bannerImage: images[0] || "" })}
        onBusyChange={updatePendingUploads}
      />
      <label>
        Shipping fee (paise)
        <input
          type="number"
          min="0"
          step="1"
          value={s.shippingFee}
          onChange={(e) => setS({ ...s, shippingFee: Number(e.target.value) })}
        />
      </label>
      <h2>Cash on delivery</h2>
      <label className="check">
        <input
          type="checkbox"
          checked={s.cod.enabled}
          onChange={(e) =>
            setS({ ...s, cod: { ...s.cod, enabled: e.target.checked } })
          }
        />
        Enable COD
      </label>
      <label>
        COD fee (paise)
        <input
          type="number"
          min="0"
          step="1"
          value={s.cod.fee}
          onChange={(e) =>
            setS({ ...s, cod: { ...s.cod, fee: Number(e.target.value) } })
          }
        />
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={s.cod.verificationRequired}
          onChange={(e) =>
            setS({
              ...s,
              cod: { ...s.cod, verificationRequired: e.target.checked },
            })
          }
        />
        Manual verification required
      </label>
      <label>
        COD instructions
        <textarea
          value={s.cod.instructions}
          onChange={(e) =>
            setS({ ...s, cod: { ...s.cod, instructions: e.target.value } })
          }
        />
      </label>
      <h2>UPI QR payment</h2>
      <label className="check">
        <input
          type="checkbox"
          checked={s.upi.enabled}
          onChange={(e) =>
            setS({ ...s, upi: { ...s.upi, enabled: e.target.checked } })
          }
        />
        Enable UPI
      </label>
      <div className="form-grid">
        <label>
          UPI ID
          <input
            value={s.upi.id}
            onChange={(e) =>
              setS({ ...s, upi: { ...s.upi, id: e.target.value } })
            }
          />
        </label>
        <label>
          Payee name
          <input
            value={s.upi.payee}
            onChange={(e) =>
              setS({ ...s, upi: { ...s.upi, payee: e.target.value } })
            }
          />
        </label>
      </div>
      <ImageManager
        single
        kind="qr"
        images={s.upi.qrImage ? [s.upi.qrImage] : []}
        onChange={(images) =>
          setS({ ...s, upi: { ...s.upi, qrImage: images[0] || "" } })
        }
        onBusyChange={updatePendingUploads}
      />
      <label>
        UPI instructions
        <textarea
          value={s.upi.instructions}
          onChange={(e) =>
            setS({ ...s, upi: { ...s.upi, instructions: e.target.value } })
          }
        />
      </label>
      <h2>Policies & our story</h2>
      {Object.entries(s.policies).map(([key, value]) => (
        <label key={key}>
          {key}
          <textarea
            rows={5}
            value={value}
            onChange={(e) =>
              setS({ ...s, policies: { ...s.policies, [key]: e.target.value } })
            }
          />
        </label>
      ))}
      <label className="check">
        <input
          type="checkbox"
          checked={s.policiesApproved}
          onChange={(e) => setS({ ...s, policiesApproved: e.target.checked })}
        />
        I have reviewed and approved these policies for publication
      </label>
      <button className="button" disabled={busy || pendingUploads > 0}>
        Save settings
      </button>
    </form>
  );
}
function Categories({ run, busy }: { run: Runner; busy: boolean }) {
  const [categories, setCategories] = useState<
      { id: string; name: string; published: boolean }[]
    >([]),
    [edit, setEdit] = useState({
      id: crypto.randomUUID() as string,
      name: "",
      published: true,
    });
  useEffect(
    () =>
      onSnapshot(collection(db, "categories"), (s) =>
        setCategories(s.docs.map((d) => d.data() as typeof edit)),
      ),
    [],
  );
  return (
    <>
      <form
        className="form-panel"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run("saveCategory", edit))
            setEdit({ id: crypto.randomUUID(), name: "", published: true });
        }}
      >
        <label>
          Category name
          <input
            required
            value={edit.name}
            onChange={(e) => setEdit({ ...edit, name: e.target.value })}
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={edit.published}
            onChange={(e) => setEdit({ ...edit, published: e.target.checked })}
          />
          Published
        </label>
        <button className="button" disabled={busy}>
          Save category
        </button>
      </form>
      {categories.map((c) => (
        <p key={c.id}>
          {c.name} · {c.published ? "Published" : "Hidden"}{" "}
          <button onClick={() => setEdit(c)}>Edit</button>
        </p>
      ))}
      <p>
        Product category labels are managed in each product. Renaming a category
        does not silently rewrite existing products.
      </p>
    </>
  );
}
