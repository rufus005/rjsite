import { useEffect, useRef, type RefObject } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, X } from "lucide-react";
import { useStore } from "../context/Store";
import { money } from "../utils/format";

type Props = {
  open: boolean;
  onClose: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
};

export default function CartDrawer({ open, onClose, triggerRef }: Props) {
  const { cart, products } = useStore();
  const closeRef = useRef<HTMLButtonElement>(null);
  const lines = cart.flatMap((line) => {
    const product = products.find((item) => item.id === line.productId);
    const variant = product?.variants.find(
      (item) => item.id === line.variantId,
    );
    return product && variant ? [{ ...line, product, variant }] : [];
  });
  const subtotal = lines.reduce(
    (total, line) => total + line.variant.price * line.quantity,
    0,
  );

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab") {
        const drawer = closeRef.current?.closest(".cart-drawer");
        const focusable = drawer?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      if (triggerRef.current?.isConnected) triggerRef.current.focus();
    };
  }, [open, onClose, triggerRef]);

  if (!open) return null;

  return (
    <div className="cart-drawer-layer">
      <button
        className="cart-drawer-backdrop"
        type="button"
        aria-label="Close cart"
        tabIndex={-1}
        onClick={onClose}
      />
      <aside
        className="cart-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-drawer-title"
      >
        <div className="cart-drawer-heading">
          <div>
            <span className="eyebrow">JUST ADDED</span>
            <h2 id="cart-drawer-title">Your cart</h2>
          </div>
          <button
            ref={closeRef}
            className="icon-button"
            type="button"
            aria-label="Close cart"
            onClick={onClose}
          >
            <X size={21} />
          </button>
        </div>
        <div className="cart-drawer-items">
          {lines.map(({ product, variant, quantity }) => (
            <div className="cart-drawer-item" key={product.id + variant.id}>
              <img
                src={
                  variant.images[0] ||
                  product.images[0] ||
                  "/images/social.svg"
                }
                width="80"
                height="90"
                alt=""
              />
              <div>
                <h3>{product.name}</h3>
                <p>{variant.name}</p>
                <p>Qty {quantity}</p>
              </div>
              <strong>{money(variant.price * quantity)}</strong>
            </div>
          ))}
        </div>
        <div className="cart-drawer-footer">
          <p className="cart-drawer-subtotal">
            <span>Subtotal</span>
            <strong>{money(subtotal)}</strong>
          </p>
          <p className="cart-drawer-note">
            Shipping and any applicable fees are calculated at checkout.
          </p>
          <Link className="button full cart-drawer-checkout" to="/checkout">
            Checkout <ArrowRight size={17} />
          </Link>
          <button
            className="button secondary full cart-drawer-continue"
            type="button"
            onClick={onClose}
          >
            Continue Shopping
          </button>
        </div>
      </aside>
    </div>
  );
}
