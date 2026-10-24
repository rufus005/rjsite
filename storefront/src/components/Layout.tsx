import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  ShoppingBag,
  ArrowUpRight,
  Menu,
  X,
  ArrowRight,
  PackageCheck,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useStore } from "../context/Store";
import { isEmulator } from "../services/firebase";
export default function Layout() {
  const { cart, settings, error, retry } = useStore();
  const [menu, setMenu] = useState(false);
  const location = useLocation();
  useEffect(() => {
    setMenu(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="announcement">
        {isEmulator
          ? "LOCAL PREVIEW · Sample products and prices · Do not send payments"
          : settings?.banner || "Welcome to Rufus Shoe Store"}
        <span>
          Made for everyday living <ArrowUpRight size={12} />
        </span>
      </div>
      <header className="header">
        <Link className="wordmark" to="/" aria-label="Rufus Shoe Store home">
          rufus<span>SHOE STORE</span>
        </Link>
        <nav
          className={menu ? "navigation open" : "navigation"}
          aria-label="Main"
        >
          <NavLink to="/shop">Shop all</NavLink>
          <Link to="/shop?category=Slim+shoe+racks">Shoe racks</Link>
          <Link to="/shop?category=Storage+cabinets">Home storage</Link>
          <NavLink to="/about">Our story</NavLink>
        </nav>
        <div className="header-actions">
          <Link className="contact-link" to="/contact">
            Let’s talk <ArrowUpRight size={15} />
          </Link>
          <Link
            to="/cart"
            className="bag"
            aria-label={`Cart, ${cart.reduce((n, l) => n + l.quantity, 0)} items`}
          >
            <ShoppingBag size={21} />
            <span>{cart.reduce((n, l) => n + l.quantity, 0)}</span>
          </Link>
          <button
            className="icon-button menu-toggle"
            aria-label={menu ? "Close menu" : "Open menu"}
            onClick={() => setMenu(!menu)}
          >
            {menu ? <X /> : <Menu />}
          </button>
        </div>
      </header>
      {error && (
        <div role="alert" className="notice error">
          {error}
          <button type="button" onClick={retry}>
            Try again
          </button>
        </div>
      )}
      <main id="main">
        <Outlet />
      </main>
      <section className="trust-strip">
        <div>
          <Truck />
          <span>
            Delivery, made clear<small>Review charges before you order</small>
          </span>
        </div>
        <div>
          <PackageCheck />
          <span>
            A considered collection
            <small>Storage and footwear, in one place</small>
          </span>
        </div>
        <div>
          <ShieldCheck />
          <span>
            Payment transparency
            <small>Every UPI payment is manually verified</small>
          </span>
        </div>
      </section>
      <footer>
        <div className="footer-top">
          <div>
            <Link className="wordmark" to="/">
              rufus<span>SHOE STORE</span>
            </Link>
            <p>
              A little order.
              <br />A lot more room to live.
            </p>
          </div>
          <div>
            <h3>Explore</h3>
            <Link to="/shop">The collection</Link>
            <Link to="/about">Our story</Link>
            <Link to="/contact">Contact us</Link>
            <Link to="/order">Find your order</Link>
          </div>
          <div>
            <h3>Here to help</h3>
            <Link to="/shipping">Shipping & delivery</Link>
            <Link to="/returns">Returns & exchanges</Link>
            <Link to="/privacy">Privacy policy</Link>
            <Link to="/terms">Terms & conditions</Link>
          </div>
          <div>
            <h3>Make yourself at home.</h3>
            <p>Questions about the right fit for your space?</p>
            <Link to="/contact" className="text-link">
              Talk to our team <ArrowRight size={17} />
            </Link>
          </div>
        </div>
        <div className="footer-bottom">
          <span>
            © {new Date().getFullYear()}{" "}
            {settings?.storeName || "Rufus Shoe Store"}
          </span>
          <span>Considered spaces. Everyday essentials.</span>
        </div>
      </footer>
    </>
  );
}
