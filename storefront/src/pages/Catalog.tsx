import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useStore } from "../context/Store";
import { useMeta } from "../hooks/useMeta";
import ProductCard from "../components/ProductCard";
const normalizeCategory = (category: string) =>
  category.toLowerCase().replace(/[\s-]/g, "");

export function Home() {
  const { products, loading, settings } = useStore();
  useMeta(
    "Rufus Shoe Store — A place for every pair.",
    "Thoughtful shoe storage and everyday essentials.",
    products.some((p) => p.sample),
  );
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">
            <span /> LESS CLUTTER. MORE LIVING.
          </div>
          <h1>
            A place for
            <br />
            every <em>pair.</em>
          </h1>
          <p>
            Thoughtfully chosen shoe racks, home storage and everyday
            essentials. Find a little more room for what matters.
          </p>
          <Link to="/shop" className="button">
            Explore the collection <ArrowUpRight size={19} />
          </Link>
          <div className="hero-footnote">
            <span>01 — THE EVERYDAY COLLECTION</span>
            <span>Designed around your space</span>
          </div>
        </div>
        <div className="hero-art">
          <span className="hero-caption">
            GOOD DESIGN.
            <br />A WARMER WELCOME.
          </span>
          <img
            src={settings?.bannerImage || "/images/sample-1-0.svg"}
            alt="Original illustration of a slim sage shoe cabinet"
            width="600"
            height="560"
          />
          <div className="hero-product">
            <div>
              <small>MEET YOUR ENTRYWAY’S NEW FAVOURITE</small>
              <strong>Room for a better arrival.</strong>
            </div>
            <Link
              to="/shop?category=Slim+shoe+racks"
              aria-label="Explore slim shoe racks"
            >
              <ArrowUpRight />
            </Link>
          </div>
          <span className="image-note">Sample illustration</span>
        </div>
      </section>
      <section className="section categories">
        <div className="section-heading">
          <div>
            <span className="eyebrow">A LITTLE SOMETHING FOR EVERY SPACE</span>
            <h2>Find your kind of order.</h2>
          </div>
          <Link className="text-link" to="/shop">
            View all categories <ArrowRight size={18} />
          </Link>
        </div>
        <div className="category-grid">
          {[
            {
              name: "Shoe racks",
              sub: "A tidy welcome home",
              cat: "Slim shoe racks",
              img: "sample-1-0.svg",
            },
            {
              name: "Home storage",
              sub: "Everything in its place",
              cat: "Storage cabinets",
              img: "sample-4-0.svg",
            },
            {
              name: "Everyday footwear",
              sub: "Step into your day",
              cat: "Footwear",
              img: "sample-3-0.svg",
            },
          ].map((c, i) => (
            <Link
              key={c.name}
              to={"/shop?category=" + encodeURIComponent(c.cat)}
              className="category-card"
            >
              <span className="category-number">0{i + 1}</span>
              <img
                src={"/images/" + c.img}
                width="600"
                height="560"
                loading="lazy"
                alt={`Sample ${c.name.toLowerCase()} illustration`}
              />
              <div>
                <h3>{c.name}</h3>
                <p>{c.sub}</p>
                <ArrowUpRight />
              </div>
            </Link>
          ))}
        </div>
      </section>
      <section className="section bestsellers">
        <div className="section-heading">
          <div>
            <span className="eyebrow">THE CONSIDERED EDIT</span>
            <h2>Good things, in good places.</h2>
          </div>
          <Link to="/shop" className="text-link">
            Shop the collection <ArrowRight size={18} />
          </Link>
        </div>
        {loading ? (
          <p role="status">Loading the collection…</p>
        ) : products.length ? (
          <div className="product-grid">
            {products.slice(0, 4).map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        ) : (
          <div className="empty">
            <h3>The collection is on its way.</h3>
            <p>Check back soon, or contact us for help.</p>
          </div>
        )}
      </section>
      <section className="story-banner">
        <span className="eyebrow">THE RUFUS WAY</span>
        <h2>
          Home starts with
          <br />a little <em>breathing room.</em>
        </h2>
        <p>
          From the first step inside to the last pair put away, we believe
          everyday spaces deserve a little care.
        </p>
        <Link to="/about" className="text-link">
          Get to know us <ArrowUpRight size={18} />
        </Link>
        <span className="story-decoration">r.</span>
      </section>
    </>
  );
}
export function Shop() {
  const { products, loading } = useStore();
  const [params, setParams] = useSearchParams();
  const search = params.get("q") || "",
    category = params.get("category") || "",
    normalizedCategory = normalizeCategory(category),
    allCategories = !normalizedCategory || normalizedCategory === "all",
    selectedCategory = allCategories
      ? ""
      : (products.find(
          (product) =>
            normalizeCategory(product.category) === normalizedCategory,
        )?.category ?? category),
    brand = params.get("brand") || "",
    color = params.get("color") || "",
    size = params.get("size") || "",
    sort = params.get("sort") || "name",
    stock = params.get("stock") === "true",
    page = Math.max(1, Number(params.get("page")) || 1);
  useMeta(
    "Shop the collection | Rufus Shoe Store",
    "Browse shoe racks, storage and footwear.",
    products.some((p) => p.sample),
  );
  const change = (key: string, value: string) => {
    const n = new URLSearchParams(params);
    if (value) n.set(key, value);
    else n.delete(key);
    n.delete("page");
    setParams(n);
  };
  const filtered = products
    .filter(
      (p) =>
        (!search ||
          `${p.name} ${p.category} ${p.brand} ${p.description}`
            .toLowerCase()
            .includes(search.toLowerCase())) &&
        (allCategories ||
          normalizeCategory(p.category) === normalizedCategory) &&
        (!brand || p.brand === brand) &&
        p.variants.some(
          (v) =>
            (!color || v.color === color) &&
            (!size || v.size === size) &&
            (!stock || v.stock > 0),
        ),
    )
    .sort((a, b) =>
      sort === "price-low"
        ? Math.min(...a.variants.map((v) => v.price)) -
          Math.min(...b.variants.map((v) => v.price))
        : sort === "price-high"
          ? Math.min(...b.variants.map((v) => v.price)) -
            Math.min(...a.variants.map((v) => v.price))
          : a.name.localeCompare(b.name),
    );
  const pages = Math.max(1, Math.ceil(filtered.length / 6)),
    current = Math.min(page, pages);
  return (
    <div className="section shop-page">
      <div className="breadcrumbs">
        <Link to="/">Home</Link>
        <span>/</span> The collection
      </div>
      <div className="shop-intro">
        <span className="eyebrow">SPACE FOR THE EVERYDAY</span>
        <h1>The collection.</h1>
        <p>Find the right fit for your home, and your everyday.</p>
      </div>
      <div className="shop-layout">
        <aside className="filters">
          <h2>
            <SlidersHorizontal size={17} /> Refine your search
          </h2>
          <label className="search-input">
            <Search size={16} />
            <input
              aria-label="Search products"
              placeholder="Search the collection"
              value={search}
              onChange={(e) => change("q", e.target.value)}
            />
          </label>
          {[
            [
              "Category",
              "category",
              selectedCategory,
              [...new Set(products.map((p) => p.category))],
            ],
            [
              "Brand",
              "brand",
              brand,
              [...new Set(products.map((p) => p.brand))],
            ],
            [
              "Color",
              "color",
              color,
              [
                ...new Set(
                  products.flatMap((p) => p.variants.map((v) => v.color)),
                ),
              ],
            ],
            [
              "Size",
              "size",
              size,
              [
                ...new Set(
                  products.flatMap((p) =>
                    p.variants.map((v) => v.size).filter(Boolean),
                  ),
                ),
              ],
            ],
          ].map(([label, key, value, options]) => (
            <label key={key as string}>
              {label as string}
              <select
                value={value as string}
                onChange={(e) => change(key as string, e.target.value)}
              >
                <option value="">All {String(label).toLowerCase()}s</option>
                {(options as string[]).map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
          ))}
          <label className="check">
            <input
              type="checkbox"
              checked={stock}
              onChange={(e) => change("stock", e.target.checked ? "true" : "")}
            />
            In stock only
          </label>
          <button className="text-button" onClick={() => setParams({})}>
            Clear filters
          </button>
        </aside>
        <div>
          <div className="results-bar">
            <span>{filtered.length} thoughtfully selected pieces</span>
            <label>
              Sort by{" "}
              <select
                aria-label="Sort products"
                value={sort}
                onChange={(e) => change("sort", e.target.value)}
              >
                <option value="name">Name</option>
                <option value="price-low">Price: low to high</option>
                <option value="price-high">Price: high to low</option>
              </select>
            </label>
          </div>
          {loading ? (
            <p role="status">Loading products…</p>
          ) : filtered.length ? (
            <div className="product-grid shop-grid">
              {filtered.slice((current - 1) * 6, current * 6).map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          ) : (
            <div className="empty">
              <h2>No pieces found.</h2>
              <p>Try a different search or clear your filters.</p>
              <button onClick={() => setParams({})}>Reset filters</button>
            </div>
          )}
          <div className="pagination">
            <button
              disabled={current <= 1}
              onClick={() => {
                const n = new URLSearchParams(params);
                n.set("page", String(current - 1));
                setParams(n);
              }}
            >
              Previous
            </button>
            <span>
              Page {current} of {pages}
            </span>
            <button
              disabled={current >= pages}
              onClick={() => {
                const n = new URLSearchParams(params);
                n.set("page", String(current + 1));
                setParams(n);
              }}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
