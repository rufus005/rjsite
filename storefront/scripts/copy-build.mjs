import { mkdir, copyFile } from "node:fs/promises";
const target = new URL("../../backend/functions/public/", import.meta.url);
await mkdir(target, { recursive: true });
await copyFile(
  new URL("../dist/index.html", import.meta.url),
  new URL("index.html", target),
);
console.log("Copied HTML template for Firebase server-rendered public routes.");
