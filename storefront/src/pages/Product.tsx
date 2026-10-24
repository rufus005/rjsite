import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Check,
  Phone,
  MessageCircle,
  ArrowLeft,
  ArrowRight,
  ShoppingBag,
} from "lucide-react";
import { useStore } from "../context/Store";
import { money } from "../utils/format";
import { useMeta } from "../hooks/useMeta";
import ProductCard from "../components/ProductCard";
export default function ProductPage() {
  const { slug } = useParams();
  const { products, loading, settings, add, cart } = useStore();
  const p = products.find((p) => p.slug === slug);
  const [variantId, setVariantId] = useState(""),
    [image, setImage] = useState(0),
    [quantity, setQuantity] = useState(1),
    [added, setAdded] = useState(false);
  const touch = useRef(0);
  const v = p?.variants.find((v) => v.id === variantId) || p?.variants[0];
  useEffect(() => {
    setVariantId("");
    setImage(0);
    setQuantity(1);
    setAdded(false);
  }, [slug]);
  useMeta(
    p
      ? (p.seo.title || p.name) + " | Rufus"
      : loading
        ? "Loading product…"
        : "Product not found",
    p?.seo.description || p?.description || "",
    !p || p.sample,
  );
  useEffect(() => {
    if (!p || !settings) return;
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.dataset.clientSchema = "true";
    script.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Product",
      name: p.name,
      description: p.description,
      image: p.images,
      sku: p.sku,
      offers: {
        "@type": "AggregateOffer",
        priceCurrency: "INR",
        lowPrice: Math.min(...p.variants.map((v) => v.price)) / 100,
        highPrice: Math.max(...p.variants.map((v) => v.price)) / 100,
        offerCount: p.variants.length,
        availability:
          "https://schema.org/" +
          (p.variants.some((v) => v.stock > 0) ? "InStock" : "OutOfStock"),
        url: settings.siteUrl + "/product/" + p.slug,
      },
    });
    document.head.appendChild(script);
    const photo = p.images[0] || "/images/social.svg";
    document
      .querySelector('meta[property="og:image"]')
      ?.setAttribute(
        "content",
        photo.startsWith("/") ? settings.siteUrl + photo : photo,
      );
    const crumb = document.createElement("script");
    crumb.type = "application/ld+json";
    crumb.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Shop",
          item: settings.siteUrl + "/shop",
        },
        {
          "@type": "ListItem",
          position: 2,
          name: p.name,
          item: settings.siteUrl + "/product/" + p.slug,
        },
      ],
    });
    document.head.appendChild(crumb);
    return () => {
      script.remove();
      crumb.remove();
    };
  }, [p, settings]);
  if (loading)
    return (
      <div className="section" role="status">
        Loading your selection…
      </div>
    );
  if (!p || !v)
    return (
      <div className="empty">
        <h1>Product not found</h1>
        <Link to="/shop">Back to the collection</Link>
      </div>
    );
  const images = v.images.length ? v.images : p.images;
  const inCart =
    cart.find((l) => l.productId === p.id && l.variantId === v.id)?.quantity ||
    0;
  const max = Math.max(0, Math.min(10, v.stock) - inCart);
  const move = (n: number) =>
    setImage((i) => (i + n + images.length) % Math.max(1, images.length));
  return (
    <div className="section">
      <div className="breadcrumbs">
        <Link to="/">Home</Link> / <Link to="/shop">Shop</Link> / {p.name}
      </div>
      <div className="product-detail">
        <div>
          <div
            className="gallery"
            onTouchStart={(e) => {
              touch.current = e.touches[0].clientX;
            }}
            onTouchEnd={(e) => {
              const diff = e.changedTouches[0].clientX - touch.current;
              if (Math.abs(diff) > 50) move(diff < 0 ? 1 : -1);
            }}
          >
            <img
              src={images[image] || p.images[0] || "/images/social.svg"}
              width="600"
              height="560"
              alt={`${p.name} — ${v.name}, view ${image + 1}`}
            />
            {images.length > 1 && (
              <div className="gallery-controls">
                <button aria-label="Previous image" onClick={() => move(-1)}>
                  <ArrowLeft size={18} />
                </button>
                <span>
                  {image + 1} / {images.length}
                </span>
                <button aria-label="Next image" onClick={() => move(1)}>
                  <ArrowRight size={18} />
                </button>
              </div>
            )}
          </div>
          <div className="thumbnails">
            {images.map((src, i) => (
              <button
                key={src}
                aria-label={`Show image ${i + 1}`}
                aria-pressed={i === image}
                onClick={() => setImage(i)}
              >
                <img src={src} width="80" height="80" alt="" />
              </button>
            ))}
          </div>
        </div>
        <div className="product-info">
          <span className="eyebrow">
            {p.category} · {p.brand}
          </span>
          <h1>{p.name}</h1>
          <p>{p.description}</p>
          {p.sample && (
            <p className="notice">
              Sample item — test prices, stock and specifications. Not an offer
              for sale.
            </p>
          )}
          <div className="detail-price">
            <strong>{money(v.price)}</strong>
            {v.originalPrice > v.price && <del>{money(v.originalPrice)}</del>}
          </div>
          <p className={v.stock ? "stock" : "error"}>
            {v.stock
              ? "Available · " + v.stock + " in stock"
              : "Currently unavailable"}{" "}
            <small>SKU {v.sku}</small>
          </p>
          <fieldset>
            <legend>
              Choose{" "}
              {p.type === "footwear" ? "color / size" : "color / configuration"}
            </legend>
            <div className="variant-options">
              {p.variants.map((variant) => (
                <button
                  key={variant.id}
                  aria-pressed={v.id === variant.id}
                  onClick={() => {
                    setVariantId(variant.id);
                    setImage(0);
                    setQuantity(1);
                    setAdded(false);
                  }}
                >
                  {variant.name}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="add-row">
            <label>
              Quantity
              <input
                aria-label="Quantity"
                type="number"
                min="1"
                max={max || 1}
                value={quantity}
                onChange={(e) =>
                  setQuantity(
                    Math.max(1, Math.min(max || 1, Number(e.target.value))),
                  )
                }
              />
            </label>
            <button
              className="button"
              disabled={!max}
              onClick={() => {
                add(p, v.id, quantity);
                setAdded(true);
              }}
            >
              {added ? <Check size={18} /> : <ShoppingBag size={18} />}{" "}
              {max ? "Add to cart" : "Cart limit reached / unavailable"}
            </button>
          </div>
          {added && (
            <p role="status">
              Added to your cart. <Link to="/cart">View cart →</Link>
            </p>
          )}
          {p.warrantyApproved && p.warranty && (
            <p className="warranty">
              <Check size={16} /> {p.warranty}
            </p>
          )}
          <div className="contact-buttons">
            {settings?.whatsapp && (
              <a
                href={`https://wa.me/${settings.whatsapp}?text=${encodeURIComponent("I have a question about " + p.name)}`}
              >
                <MessageCircle size={17} /> WhatsApp us
              </a>
            )}
            {settings?.phone && (
              <a href={"tel:" + settings.phone}>
                <Phone size={17} /> Call us
              </a>
            )}
          </div>
          <details open>
            <summary>Details & specifications</summary>
            <dl className="specs">
              {Object.entries(p.specifications).map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </details>
          <details>
            <summary>Warranty & care</summary>
            <p>
              {p.warrantyApproved
                ? p.warranty
                : "No verified warranty has been published for this product. Contact the store for details."}
            </p>
          </details>
          <details>
            <summary>Delivery & returns</summary>
            <p>
              Shipping is calculated at checkout.{" "}
              <Link to="/shipping">Delivery policy</Link> ·{" "}
              <Link to="/returns">Returns policy</Link>
            </p>
          </details>
        </div>
      </div>
      <div className="section-heading related-heading">
        <h2>A few more good fits.</h2>
        <Link to="/shop">Explore all →</Link>
      </div>
      <div className="product-grid">
        {products
          .filter((x) => x.id !== p.id && x.type === p.type)
          .slice(0, 4)
          .map((x) => (
            <ProductCard key={x.id} product={x} />
          ))}
      </div>
    </div>
  );
}
