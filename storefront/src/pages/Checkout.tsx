import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Copy, LockKeyhole, Trash2 } from "lucide-react";
import { ref, uploadBytes } from "firebase/storage";
import { useStore } from "../context/Store";
import { money, errorMessage } from "../utils/format";
import { useMeta } from "../hooks/useMeta";
import { call, guest, isEmulator, storage } from "../services/firebase";
import type { Quote } from "../types";
export function Cart() {
  const { cart, setCart, products, loading } = useStore();
  useMeta("Your cart | Rufus", "", true);
  const lines = cart.map((l) => ({
    ...l,
    p: products.find((p) => p.id === l.productId),
    v: products
      .find((p) => p.id === l.productId)
      ?.variants.find((v) => v.id === l.variantId),
  }));
  const invalid = lines.some((l) => !l.p || !l.v || l.v.stock < l.quantity);
  const total = lines.reduce((n, l) => n + (l.v?.price || 0) * l.quantity, 0);
  return (
    <div className="section narrow">
      <div className="breadcrumbs">
        <Link to="/shop">The collection</Link> / Your cart
      </div>
      <h1>A few good choices.</h1>
      {loading ? (
        <p>Loading your cart…</p>
      ) : !cart.length ? (
        <div className="empty">
          <h2>Your cart has room for something good.</h2>
          <Link className="button" to="/shop">
            Explore the collection <ArrowRight size={18} />
          </Link>
        </div>
      ) : (
        <>
          <div className="cart-lines">
            {lines.map((l) => (
              <div className="cart-line" key={l.productId + l.variantId}>
                <img
                  src={l.v?.images[0] || l.p?.images[0] || "/images/social.svg"}
                  width="110"
                  height="100"
                  alt={l.p?.name || "Unavailable item"}
                />
                <div>
                  <Link to={l.p ? "/product/" + l.p.slug : "/shop"}>
                    <h3>{l.p?.name || "Product no longer available"}</h3>
                  </Link>
                  <p>{l.v?.name || "Variant unavailable"}</p>
                  <strong>{money(l.v?.price || 0)}</strong>
                  {(!l.v || l.v.stock < l.quantity) && (
                    <p className="error">
                      Please reduce the quantity or remove this item.
                    </p>
                  )}
                </div>
                <label>
                  Quantity
                  <input
                    type="number"
                    aria-label={`Quantity for ${l.p?.name || "unavailable item"}`}
                    min="1"
                    max={Math.min(10, l.v?.stock || 1)}
                    value={l.quantity}
                    onChange={(e) =>
                      setCart(
                        cart.map((x) =>
                          x.productId === l.productId &&
                          x.variantId === l.variantId
                            ? {
                                ...x,
                                quantity: Math.max(
                                  1,
                                  Math.min(
                                    10,
                                    l.v?.stock || 1,
                                    Number(e.target.value),
                                  ),
                                ),
                              }
                            : x,
                        ),
                      )
                    }
                  />
                </label>
                <button
                  className="icon-button"
                  aria-label={`Remove ${l.p?.name || "item"}`}
                  onClick={() =>
                    setCart(
                      cart.filter(
                        (x) =>
                          !(
                            x.productId === l.productId &&
                            x.variantId === l.variantId
                          ),
                      ),
                    )
                  }
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
          </div>
          <div className="cart-bottom">
            <p>
              Shipping and any COD fee are shown at checkout.
              <br />
              Prices and stock are checked again before you order.
            </p>
            <div>
              <p className="total-line">
                Subtotal <strong>{money(total)}</strong>
              </p>
              {invalid ? (
                <p className="error">Update unavailable items to continue.</p>
              ) : (
                <Link className="button" to="/checkout">
                  Continue to checkout <ArrowRight size={18} />
                </Link>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
export default function Checkout() {
  const { cart, setCart, settings } = useStore();
  const nav = useNavigate();
  const [method, setMethod] = useState<"cod" | "upi">("cod"),
    [quote, setQuote] = useState<Quote | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0),
    [utr, setUtr] = useState(""),
    [receipt, setReceipt] = useState<File | null>(null),
    [copied, setCopied] = useState(false);
  const [buyer, setBuyer] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    pin: "",
    city: "",
    state: "",
  });
  useMeta("Checkout | Rufus", "", true);
  useEffect(() => {
    if (settings && !settings[method].enabled) {
      if (settings.cod.enabled) setMethod("cod");
      else if (settings.upi.enabled) setMethod("upi");
    }
  }, [settings, method]);
  useEffect(() => {
    let active = true;
    setQuote(null);
    setError("");
    if (!cart.length) return;
    guest()
      .then(() =>
        call<Quote>("quoteOrder", { items: cart, paymentMethod: method }),
      )
      .then((q) => {
        if (active) setQuote(q);
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [cart, method, settings, refresh]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!quote || busy) return;
    setBusy(true);
    setError("");
    try {
      if (
        receipt &&
        (receipt.size > 5 * 1024 * 1024 ||
          !["image/jpeg", "image/png", "image/webp"].includes(receipt.type))
      )
        throw Error("Receipt must be a JPEG, PNG or WebP image under 5 MB.");
      const user = await guest();
      const payload = {
        items: cart,
        paymentMethod: method,
        buyer,
        expectedTotal: quote.total,
        expectedQuote: quote.quoteHash,
        ...(method === "upi" ? { utr } : {}),
      };
      const serialized = JSON.stringify(payload);
      let pending;
      try {
        pending = JSON.parse(
          sessionStorage.getItem("rufus-checkout-attempt") || "null",
        );
      } catch {
        pending = null;
      }
      const idempotencyKey =
        pending?.serialized === serialized ? pending.key : crypto.randomUUID();
      sessionStorage.setItem(
        "rufus-checkout-attempt",
        JSON.stringify({ serialized, key: idempotencyKey }),
      );
      const result = await call<{
        id: string;
        token: string;
        reference: string;
      }>("createOrder", { ...payload, idempotencyKey });
      sessionStorage.setItem("rufus-last-order", JSON.stringify(result));
      let uploadError = "";
      if (receipt && method === "upi") {
        try {
          await uploadBytes(
            ref(storage, `receipts/${user.uid}/${result.id}/receipt`),
            receipt,
            { contentType: receipt.type },
          );
          await call("attachReceipt", { id: result.id });
        } catch {
          uploadError =
            "Your order was created, but the receipt upload failed. You can retry below.";
        }
      }
      setCart([]);
      sessionStorage.removeItem("rufus-checkout-attempt");
      nav(`/order/${result.id}#${result.token}`, { state: { uploadError } });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  if (!cart.length)
    return (
      <div className="empty">
        <h1>Your cart is empty.</h1>
        <Link to="/shop">Explore the collection</Link>
      </div>
    );
  if (!settings) return <div className="section">Loading store settings…</div>;
  const upiLink = quote
    ? `upi://pay?pa=${encodeURIComponent(settings.upi.id)}&pn=${encodeURIComponent(settings.upi.payee)}&am=${(quote.total / 100).toFixed(2)}&cu=INR`
    : "";
  return (
    <div className="section checkout">
      <div className="breadcrumbs">
        <Link to="/cart">Your cart</Link> / Checkout
      </div>
      <h1>Make it yours.</h1>
      <p className="checkout-subtitle">
        <LockKeyhole size={16} /> Guest checkout. No account registration
        needed.
      </p>
      <form onSubmit={submit} className="checkout-grid">
        <div>
          <section className="form-panel">
            <h2>
              <span>01</span> Your details
            </h2>
            <div className="form-grid">
              {[
                ["name", "Full name", "text"],
                ["phone", "Mobile number", "tel"],
                ["email", "Email (optional)", "email"],
              ].map(([key, label, type]) => (
                <label key={key}>
                  {label}
                  <input
                    autoComplete={
                      key === "name"
                        ? "name"
                        : key === "phone"
                          ? "tel"
                          : "email"
                    }
                    required={key !== "email"}
                    type={type}
                    pattern={key === "phone" ? "[6-9][0-9]{9}" : undefined}
                    minLength={key === "name" ? 2 : undefined}
                    maxLength={key === "phone" ? 10 : 150}
                    value={buyer[key as keyof typeof buyer]}
                    onChange={(e) =>
                      setBuyer({ ...buyer, [key]: e.target.value })
                    }
                  />
                  {key === "phone" && (
                    <small>10-digit Indian mobile number</small>
                  )}
                </label>
              ))}
            </div>
          </section>
          <section className="form-panel">
            <h2>
              <span>02</span> Where should we send it?
            </h2>
            <label>
              House / flat, street & locality
              <textarea
                autoComplete="street-address"
                required
                minLength={8}
                maxLength={400}
                value={buyer.address}
                onChange={(e) =>
                  setBuyer({ ...buyer, address: e.target.value })
                }
              />
            </label>
            <div className="form-grid">
              {[
                ["pin", "PIN code"],
                ["city", "City / district"],
                ["state", "State"],
              ].map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    autoComplete={
                      key === "pin"
                        ? "postal-code"
                        : key === "city"
                          ? "address-level2"
                          : "address-level1"
                    }
                    required
                    pattern={key === "pin" ? "[1-9][0-9]{5}" : undefined}
                    maxLength={key === "pin" ? 6 : 100}
                    minLength={key === "pin" ? 6 : 2}
                    value={buyer[key as keyof typeof buyer]}
                    onChange={(e) =>
                      setBuyer({ ...buyer, [key]: e.target.value })
                    }
                  />
                </label>
              ))}
            </div>
          </section>
          <section className="form-panel">
            <h2>
              <span>03</span> How would you like to pay?
            </h2>
            <div className="payment-methods">
              {settings.cod.enabled && (
                <label className={method === "cod" ? "selected" : ""}>
                  <input
                    type="radio"
                    name="method"
                    checked={method === "cod"}
                    onChange={() => setMethod("cod")}
                  />
                  <span>
                    Cash on delivery
                    <small>
                      {settings.cod.fee
                        ? `${money(settings.cod.fee)} COD fee`
                        : "No COD fee"}
                    </small>
                  </span>
                </label>
              )}
              {settings.upi.enabled && (
                <label className={method === "upi" ? "selected" : ""}>
                  <input
                    type="radio"
                    name="method"
                    checked={method === "upi"}
                    onChange={() => setMethod("upi")}
                  />
                  <span>
                    UPI payment<small>Manual payment verification</small>
                  </span>
                </label>
              )}
            </div>
            {!settings.cod.enabled && !settings.upi.enabled && (
              <p className="error">
                Checkout is temporarily unavailable. Contact the store.
              </p>
            )}
            {method === "cod" ? (
              <div className="notice">
                <p>{settings.cod.instructions}</p>
                {settings.cod.verificationRequired && (
                  <p>
                    Your order will be pending verification until our team
                    confirms it. No automatic OTP verification is used.
                  </p>
                )}
              </div>
            ) : (
              <div className="upi-panel">
                {isEmulator && (
                  <p className="notice error">
                    Test mode — do not make a real payment.
                  </p>
                )}
                <h3>{settings.upi.payee}</h3>
                <div className="upi-id">
                  <code>{settings.upi.id}</code>
                  <button
                    type="button"
                    aria-label="Copy UPI ID"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(settings.upi.id);
                        setCopied(true);
                      } catch {
                        setError(
                          "Copy unavailable. Please copy the UPI ID manually.",
                        );
                      }
                    }}
                  >
                    <Copy size={16} />
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
                {settings.upi.qrImage ? (
                  <img
                    className="qr-image"
                    src={settings.upi.qrImage}
                    alt="Store payment QR code"
                    width="220"
                    height="220"
                  />
                ) : (
                  <p>No QR image configured. Use the UPI ID or app link.</p>
                )}
                <p>{settings.upi.instructions}</p>
                <p>
                  Pay exactly{" "}
                  <strong>
                    {quote ? money(quote.total) : "the confirmed total"}
                  </strong>
                  . If the QR does not include an amount, enter this amount
                  yourself.
                </p>
                {quote && (
                  <a className="button secondary" href={upiLink}>
                    Open a UPI payment app
                  </a>
                )}
                <label>
                  UTR / transaction reference
                  <input
                    required={method === "upi"}
                    pattern="[a-zA-Z0-9-]{6,40}"
                    value={utr}
                    onChange={(e) => setUtr(e.target.value)}
                    maxLength={40}
                  />
                </label>
                <label>
                  Payment receipt (optional, JPG / PNG / WebP, under 5 MB)
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => setReceipt(e.target.files?.[0] || null)}
                  />
                </label>
                <p className="muted">
                  Submitting a reference or screenshot does not confirm payment.
                  Your payment remains “Verification pending” until the bank
                  record is checked.
                </p>
              </div>
            )}
          </section>
        </div>
        <aside className="order-summary">
          <span className="eyebrow">YOUR GOOD FINDS</span>
          <h2>Order summary</h2>
          {quote ? (
            <>
              {quote.lines.map((l) => (
                <div className="summary-item" key={l.productId + l.variantId}>
                  <img
                    src={l.image || "/images/social.svg"}
                    width="64"
                    height="64"
                    alt=""
                  />
                  <div>
                    <strong>{l.name}</strong>
                    <small>
                      {l.variant} · Qty {l.quantity}
                    </small>
                  </div>
                  <span>{money(l.lineTotal)}</span>
                </div>
              ))}
              <dl className="totals">
                <div>
                  <dt>Subtotal</dt>
                  <dd>{money(quote.subtotal)}</dd>
                </div>
                <div>
                  <dt>Delivery</dt>
                  <dd>{money(quote.shipping)}</dd>
                </div>
                {method === "cod" && (
                  <div>
                    <dt>COD fee</dt>
                    <dd>{money(quote.codFee)}</dd>
                  </div>
                )}
                <div className="grand-total">
                  <dt>Total</dt>
                  <dd>{money(quote.total)}</dd>
                </div>
              </dl>
            </>
          ) : (
            <p role="status">Checking prices and availability…</p>
          )}
          {error && (
            <div className="notice error" role="alert">
              {error}
              <button type="button" onClick={() => setRefresh((x) => x + 1)}>
                Refresh total
              </button>
            </div>
          )}
          <label className="check terms-check">
            <input required type="checkbox" />{" "}
            <span>
              I have reviewed the <Link to="/terms">terms</Link>,{" "}
              <Link to="/privacy">privacy</Link> and{" "}
              <Link to="/returns">return policy</Link>.
            </span>
          </label>
          <button
            className="button full"
            disabled={!quote || busy || !settings[method].enabled}
          >
            {busy
              ? "Creating your order…"
              : `Place ${isEmulator ? "test " : ""}order`}{" "}
            <ArrowRight size={18} />
          </button>
          <p className="muted">
            {method === "upi"
              ? "Stock is held for 30 minutes while payment is reviewed."
              : "Unverified COD orders are held for 24 hours."}{" "}
            Save your private order link after checkout.
          </p>
        </aside>
      </form>
    </div>
  );
}
