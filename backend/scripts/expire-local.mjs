import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { StoreService } from "../functions/lib/service.js";
if (!process.env.FIRESTORE_EMULATOR_HOST) throw Error("Emulator-only script.");
initializeApp({ projectId: "demo-rufus" });
console.log(
  "Expired reservations:",
  await new StoreService(getFirestore()).expire(),
);
