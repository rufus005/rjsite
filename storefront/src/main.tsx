import { Component, Suspense, lazy, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { StoreProvider } from "./context/Store";
import Layout from "./components/Layout";
import { Home, Shop } from "./pages/Catalog";
import "./styles.css";
const Product = lazy(() => import("./pages/Product"));
const Checkout = lazy(() => import("./pages/Checkout"));
const Cart = lazy(() =>
  import("./pages/Checkout").then((m) => ({ default: m.Cart })),
);
const Order = lazy(() => import("./pages/Order"));
const Info = lazy(() => import("./pages/Info"));
const Admin = lazy(() => import("./pages/Admin"));
class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: string }
> {
  state = { error: "" };
  static getDerivedStateFromError(e: Error) {
    return { error: e.message };
  }
  render() {
    return this.state.error ? (
      <main className="section">
        <h1>We couldn’t load this page.</h1>
        <p role="alert">{this.state.error}</p>
        <button onClick={() => location.reload()}>Try again</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <BrowserRouter>
      <StoreProvider>
        <Suspense
          fallback={
            <div className="section" role="status">
              Loading your next good find…
            </div>
          }
        >
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="shop" element={<Shop />} />
              <Route path="product/:slug" element={<Product />} />
              <Route path="cart" element={<Cart />} />
              <Route path="checkout" element={<Checkout />} />
              <Route path="order/:id?" element={<Order />} />
              {[
                "about",
                "contact",
                "shipping",
                "returns",
                "privacy",
                "terms",
              ].map((p) => (
                <Route key={p} path={p} element={<Info />} />
              ))}
              <Route path="*" element={<Info />} />
            </Route>
            <Route path="admin/*" element={<Admin />} />
          </Routes>
        </Suspense>
      </StoreProvider>
    </BrowserRouter>
  </ErrorBoundary>,
);
