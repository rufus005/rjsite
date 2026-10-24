import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createConnection } from "node:net";
const backend = fileURLToPath(new URL("../", import.meta.url));
const preferredJava = fileURLToPath(
  new URL("../../.local-tools/java21/bin/", import.meta.url),
);
const localJava = existsSync(path.join(preferredJava, "java"))
  ? preferredJava
  : fileURLToPath(
      new URL("../../../.local-tools/java21/bin/", import.meta.url),
    );
const dataPath = fileURLToPath(
  new URL("../../.local-data/firebase/", import.meta.url),
);
const env = {
  ...process.env,
  FUNCTIONS_DISCOVERY_TIMEOUT: process.env.FUNCTIONS_DISCOVERY_TIMEOUT || "120",
};
// Keep child npm/Functions processes on the same Node runtime as this launcher.
env.PATH = path.dirname(process.execPath) + path.delimiter + (env.PATH || "");
if (existsSync(path.join(localJava, "java")))
  env.PATH = localJava + path.delimiter + env.PATH;
const testing = process.argv.includes("--test");
const ports = testing
  ? [9099, 8080, 9199]
  : [9099, 8080, 9199, 5001, 5000, 4000, 4400];
for (const port of ports) {
  const occupied = await new Promise((resolve, reject) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", (error) => {
      if (error.code === "ECONNREFUSED") resolve(false);
      else reject(error);
    });
    socket.setTimeout(2000, () => {
      socket.destroy();
      reject(Error(`Port check timed out: ${port}`));
    });
  });
  if (occupied)
    throw Error(
      `Port ${port} is already in use. Stop the existing emulator session before starting the complete demo-rufus suite. No seed was run.`,
    );
}
const args = testing
  ? [
      "emulators:exec",
      "--project",
      "demo-rufus",
      "--only",
      "auth,firestore,storage",
      "npm --prefix functions test",
    ]
  : [
      "emulators:start",
      "--project",
      "demo-rufus",
      "--export-on-exit",
      dataPath,
    ];
if (
  !testing &&
  existsSync(path.join(dataPath, "firebase-export-metadata.json"))
)
  args.push("--import", dataPath);
console.log(
  "Starting demo-rufus emulators. Keep this terminal open while using the store.",
);
const child = spawn(
  process.execPath,
  [
    path.join(backend, "node_modules/firebase-tools/lib/bin/firebase.js"),
    ...args,
  ],
  { cwd: backend, env, stdio: "inherit" },
);
let exited = false;
child.on("exit", (code) => {
  exited = true;
  process.exitCode = code ?? 1;
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
if (!testing) {
  // Wait for the full suite, not an unrelated process already holding port 8080.
  while (!exited) {
    try {
      const response = await fetch("http://127.0.0.1:4400/emulators", {
        signal: AbortSignal.timeout(1000),
      });
      if (!response.ok) throw Error("Emulator hub is not ready.");
      const running = await response.json();
      if (
        !["auth", "firestore", "functions", "storage", "hosting"].every(
          (name) => running[name],
        )
      )
        throw Error("Waiting for the full emulator suite.");
      if (exited) break;
      const seeder = spawn(
        process.execPath,
        [path.join(backend, "scripts/seed.mjs"), "--if-empty"],
        {
          cwd: backend,
          env: {
            ...env,
            FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
            FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
          },
          stdio: "inherit",
        },
      );
      const code = await new Promise((resolve) => seeder.on("exit", resolve));
      if (code !== 0)
        console.error(
          "Demo seed failed. Check the error above; no production data was accessed.",
        );
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}
