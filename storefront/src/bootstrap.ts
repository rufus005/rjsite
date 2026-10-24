import("./main").catch((error: unknown) => {
  const root = document.getElementById("root")!;
  root.replaceChildren();
  const heading = document.createElement("h1");
  heading.textContent = "Store configuration needs attention";
  const message = document.createElement("p");
  message.textContent =
    error instanceof Error
      ? error.message
      : "Unable to load the store. Please try again.";
  root.append(heading, message);
});
