import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { ref, uploadBytes } from "firebase/storage";
import { CheckCircle2, Copy } from "lucide-react";
import { call, guest, storage } from "../services/firebase";
import { useMeta } from "../hooks/useMeta";
import { errorMessage, money, words } from "../utils/format";
import type { Order } from "../types";
export default function OrderPage() {
  const params = useParams(),
    loc = useLocation();
  const [id, setId] = useState(params.id || ""),
    [token, setToken] = useState(loc.hash.slice(1)),
    [order, setOrder] = useState<Order | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [copied, setCopied] = useState(false),
    [message, setMessage] = useState(loc.state?.uploadError || "");
  useMeta("Private order | Rufus", "", true);
  async function load(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError("");
    try {
      setOrder(await call<Order>("lookupOrder", { id, token }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (params.id && token) void load();
  }, []);
  return (
    <div className="section narrow order-page">
      {!order ? (
        <>
          <h1>Find your order.</h1>
          <p>
            Use the private order ID and access token from your confirmation
            link. Order numbers alone never expose your details.
          </p>
          <form onSubmit={load} className="form-panel">
            <label>
              Order ID
              <input
                required
                value={id}
                onChange={(e) => setId(e.target.value)}
              />
            </label>
            <label>
              Private access token
              <input
                required
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
            </label>
            <button className="button" disabled={busy}>
              {busy ? "Looking up…" : "Find order"}
            </button>
          </form>
        </>
      ) : (
        <>
          <CheckCircle2 className="confirmation-icon" size={46} />
          <span className="eyebrow">YOUR ORDER IS RECEIVED</span>
          <h1>Thank you, {order.buyer.name.split(" ")[0]}.</h1>
          <p>Order {order.reference}</p>
          <p className="notice">
            Save this private link. Anyone with it can view this order. We have
            not sent an email or SMS confirmation.
          </p>
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(
                  `${location.origin}/order/${id}#${token}`,
                );
                setCopied(true);
              } catch {
                setMessage(
                  "Please copy the private link from your browser address bar.",
                );
              }
            }}
          >
            <Copy size={16} />{" "}
            {copied ? "Link copied" : "Copy private order link"}
          </button>
          <div className="order-status">
            <div>
              <small>Payment status</small>
              <strong>{words(order.paymentStatus)}</strong>
            </div>
            <div>
              <small>Order status</small>
              <strong>{words(order.fulfillmentStatus)}</strong>
            </div>
          </div>
          {order.paymentStatus === "pending_verification" && (
            <p className="notice">
              Payment verification pending. The UTR and receipt are unverified
              until the actual bank/payment record is reviewed.
            </p>
          )}
          {order.expiresAt && (
            <p>
              Reservation ends:{" "}
              {new Date(order.expiresAt).toLocaleString("en-IN")}
            </p>
          )}
          <div className="form-panel">
            {order.lines.map((l) => (
              <div className="summary-item" key={l.productId + l.variantId}>
                <div>
                  <strong>{l.name}</strong>
                  <small>
                    {l.variant} × {l.quantity}
                  </small>
                </div>
                <span>{money(l.lineTotal)}</span>
              </div>
            ))}
            <p>
              Delivery: {money(order.shipping)} · COD fee: {money(order.codFee)}
            </p>
            <p className="total-line">
              Total <strong>{money(order.total)}</strong>
            </p>
            <h3>Delivery address</h3>
            <p>
              {order.buyer.name}
              <br />
              {order.buyer.address}
              <br />
              {order.buyer.pin}, {order.buyer.city}, {order.buyer.state}
            </p>
            {order.tracking.number && (
              <p>
                Shipment: {order.tracking.carrier} · {order.tracking.number}{" "}
                {order.tracking.url && (
                  <a href={order.tracking.url} target="_blank" rel="noreferrer">
                    Track shipment
                  </a>
                )}
              </p>
            )}
          </div>
          {order.paymentMethod === "upi" &&
            order.paymentStatus === "pending_verification" &&
            !order.receiptPath && (
              <label className="form-panel">
                Add a payment receipt (optional)
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      if (file.size >= 5 * 1024 * 1024)
                        throw Error("Choose an image under 5 MB.");
                      const u = await guest();
                      await uploadBytes(
                        ref(storage, `receipts/${u.uid}/${id}/receipt`),
                        file,
                        { contentType: file.type },
                      );
                      await call("attachReceipt", { id });
                      setMessage("Receipt attached for manual review.");
                      await load();
                    } catch (e) {
                      setError(errorMessage(e));
                    }
                  }}
                />
              </label>
            )}
          <div className="button-row">
            <button disabled={busy} onClick={() => load()}>
              Refresh order status
            </button>
            {!["shipped", "delivered", "cancelled", "expired"].includes(
              order.fulfillmentStatus,
            ) &&
              order.paymentStatus !== "paid" && (
                <button
                  disabled={busy}
                  onClick={async () => {
                    if (
                      !confirm(
                        "Cancel this order and release its reserved stock?",
                      )
                    )
                      return;
                    setBusy(true);
                    try {
                      await call("cancelOrder", { id, token });
                      await load();
                    } catch (e) {
                      setError(errorMessage(e));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Cancel order
                </button>
              )}
            <Link to="/shop">Back to the collection →</Link>
          </div>
        </>
      )}
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
    </div>
  );
}
