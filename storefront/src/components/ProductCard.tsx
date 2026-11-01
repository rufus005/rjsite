import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import type { Product } from "../types";
import { money } from "../utils/format";
import { ResponsiveImg } from "../utils/images";
export default function ProductCard({ product: p }: { product: Product }) {
  const v = p.variants.reduce((a, b) => (a.price < b.price ? a : b));
  return (
    <article className="product-card">
      <Link to={"/product/" + p.slug} className="product-picture">
        <ResponsiveImg
          src={p.images[0] || "/images/social-zak.svg"}
          responsiveImages={p.responsiveImages}
          sizes="(max-width: 760px) 85vw, (max-width: 1100px) 42vw, 22vw"
          alt={p.name}
          width="600"
          height="560"
          loading="lazy"
          decoding="async"
        />
        <span className="card-arrow">
          <ArrowUpRight size={20} />
        </span>
      </Link>
      <div className="product-info">
        <div className="product-topline">
          <span className="product-category">{p.category}</span>
          <span>{p.variants.length} options</span>
        </div>
        <Link to={"/product/" + p.slug}>
          <h3>{p.name}</h3>
        </Link>
        {!p.variants.some((v) => v.stock > 0) && (
          <small>Currently unavailable</small>
        )}
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
      </div>
    </article>
  );
}
