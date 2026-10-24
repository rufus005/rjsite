import {
  initializeApp,
  applicationDefault,
  refreshToken,
} from "firebase-admin/app";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

// Operator-only utility. Credentials never enter storefront code or project files.
export async function initializeOperator(projectId, local = false) {
  if (local) return initializeApp({ projectId });
  if (
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    existsSync(
      path.join(
        homedir(),
        ".config/gcloud/application_default_credentials.json",
      ),
    )
  )
    return initializeApp({ projectId, credential: applicationDefault() });
  const require = createRequire(import.meta.url);
  const { getGlobalDefaultAccount } = require("firebase-tools/lib/auth.js");
  const { clientId, clientSecret } = require("firebase-tools/lib/api.js");
  const account = getGlobalDefaultAccount();
  if (!account?.tokens?.refresh_token)
    throw Error(
      "An authorized operator must run npx firebase login from backend, or configure Application Default Credentials. The storefront admin password does not grant project administration access.",
    );
  return initializeApp({
    projectId,
    credential: refreshToken({
      type: "authorized_user",
      client_id: clientId(),
      client_secret: clientSecret(),
      refresh_token: account.tokens.refresh_token,
    }),
  });
}
