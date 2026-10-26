export const money = (paise: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(paise / 100);
export const words = (text: string) => text.replaceAll("_", " ");
export function errorMessage(e: unknown): string {
  const code =
    typeof e === "object" && e !== null && "code" in e ? String(e.code) : "";
  if (
    code === "auth/configuration-not-found" ||
    code === "auth/operation-not-allowed"
  )
    return "Firebase Authentication is not configured for this sign-in method. Enable Email/Password in the Firebase console for rufus-website-540cb.";
  if (code === "auth/admin-restricted-operation")
    return "Firebase Authentication is restricted for this operation. Guest checkout can still continue, but this optional upload needs an enabled sign-in method.";
  if (code === "auth/invalid-credential")
    return "The email or password is incorrect.";
  if (code === "auth/network-request-failed")
    return "Cannot reach Firebase Authentication. Check your connection and Firebase configuration.";
  return e instanceof Error
    ? e.message
    : "Something went wrong. Please try again.";
}
