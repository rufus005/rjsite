import { getStorage, connectStorageEmulator } from "firebase/storage";
import { app, emulatorHost, isEmulator } from "./core";

export const storage = getStorage(app);
if (isEmulator) connectStorageEmulator(storage, emulatorHost, 9199);
