import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import type { Product } from "../types";
import { money } from "../utils/format";
export default function ProductCard({ product: p }: { product: Product }) {
  const v = p.variants.reduce((a, b) => (a.price < b.price ? a : b));
  return (
    <article className="product-card">
      <Link to={"/product/" + p.slug} className="product-picture">
        <img
          src={p.images[0] || "/images/social.svg"}
          alt={p.name}
          width="600"
          height="560"
          loading="lazy"
        />
        <span className="tag">
          {p.sample ? "SAMPLE COLLECTION" : p.category}
        </span>
        <span className="card-arrow">
          <ArrowUpRight size={20} />
        </span>
      </Link>
      <div className="product-topline">
        <span>{p.category}</span>
        <span>{p.variants.length} options</span>
      </div>
      <Link to={"/product/" + p.slug}>
        <h3>{p.name}</h3>
      </Link>
      <div className="product-price">
        <span>From {money(v.price)}</span>
        {v.originalPrice > v.price && <del>{money(v.originalPrice)}</del>}
        <span
          className="swatches"
          aria-label={p.variants.map((v) => v.color).join(", ")}
        >
          {p.variants.slice(0, 4).map((v, i) => (
            <i
              key={v.id}
              style={{
                background: ["#889783", "#3c4b43", "#d7c6ad", "#a26e53"][i],
              }}
            />
          ))}
        </span>
      </div>
      {!p.variants.some((v) => v.stock > 0) && (
        <small>Currently unavailable</small>
      )}
    </article>
  );
}
