import { Link, useLocation } from "react-router-dom";
import { useStore } from "../context/Store";
import { useMeta } from "../hooks/useMeta";
export default function Info() {
  const { pathname } = useLocation();
  const { settings } = useStore();
  const key = pathname.slice(1);
  const titles: Record<string, string> = {
    about: "A little order. A better everyday.",
    contact: "Let’s find your good fit.",
    shipping: "Shipping & delivery",
    returns: "Returns & exchanges",
    privacy: "Your privacy matters.",
    terms: "Terms & conditions",
  };
  const title = titles[key] || "This page has wandered off.";
  useMeta(title + " | Rufus", "Store information", !titles[key]);
  return (
    <div className="section narrow prose">
      <span className="eyebrow">RUFUS SHOE STORE</span>
      <h1>{title}</h1>
      {!titles[key] ? (
        <>
          <p>We couldn’t find the page you’re looking for.</p>
          <Link className="button" to="/shop">
            Back to the collection
          </Link>
        </>
      ) : key === "contact" ? (
        <>
          <p>
            Questions about capacity, a particular finish or an existing order?
            Get in touch with the store.
          </p>
          {settings?.email && (
            <p>
              <a href={"mailto:" + settings.email}>{settings.email}</a>
            </p>
          )}
          {settings?.phone && (
            <p>
              <a href={"tel:" + settings.phone}>{settings.phone}</a>
            </p>
          )}
          {settings?.whatsapp && (
            <p>
              <a href={"https://wa.me/" + settings.whatsapp}>
                Chat on WhatsApp
              </a>
            </p>
          )}
          <p>
            {settings?.address ||
              "Store contact details are awaiting configuration."}
          </p>
          <Link to="/order">Look up an existing order →</Link>
        </>
      ) : (
        <>
          {!settings?.policiesApproved && (
            <p className="notice">
              Draft content — pending store approval. These are not confirmed
              commercial terms.
            </p>
          )}
          <p className="preserve-lines">
            {settings?.policies[key as keyof typeof settings.policies] ||
              "Loading store information…"}
          </p>
        </>
      )}
    </div>
  );
}
