# Netlify and Firebase deployment

The static site is built into `dist/`. The build copies only browser pages and assets; it deliberately excludes `server.js`, `dashboard-api.js`, `lib/`, and the local JSON database. Netlify Functions use Firebase Admin for server-side contact writes. Browser Firebase settings in `firebase-config.js` are public client configuration, not service-account credentials.

Run `npm run check:publish` before deployment. It builds `dist` and checks that published pages are nonempty, local page/assets resolve, PWA resources are present, and server-only files stay out of the publish directory.

## Learning workspace assistant

The `/learn-workspace.html` IDE keeps its code editor and Ollama assistant. Local development uses `start_learn_workspace.bat` or `npm run start:learn-workspace`; the local Node server listens on `127.0.0.1:5501` and only serves model discovery and assistant chat. Hosted chat uses the `/api/learn/*` Netlify Function routes and the `learnWorkspaceUsers` private Firestore collection. Users sign in with Ukid, and suggested file replacements are reviewed in the browser before they are applied.

For hosted assistant requests, set `FIREBASE_SERVICE_ACCOUNT` and `WORKSPACE_OLLAMA_URL` in Netlify. The endpoint must use HTTPS and be reachable from Netlify Functions; protect it with a gateway token when available and set `WORKSPACE_OLLAMA_TOKEN` if required. `WORKSPACE_MODEL` selects the default model, and `WORKSPACE_MODELS` can list additional models. Usage is limited to 60 requests per account per UTC day with a five-second cooldown. Academy courses remain on `/academy.html`.

The local launcher can use local Ollama or Ollama Cloud. Local Ollama uses `http://127.0.0.1:11434/api/generate` and defaults to `qwen2.5-coder:3b`; use `ollama pull <model-name>` to install another model and set `WORKSPACE_MODEL` to select it. Cloud mode uses `https://ollama.com/api/chat`, defaults to `glm-5.3`, and reads the API key from the Windows user environment variable `OLLAMA_API_KEY`. The key stays in the local server process and is sent only to Ollama. Local workspace assistance does not require Firebase credentials or Netlify CLI.

## Firebase setup

### Email OTP and custom auth domain

Email/password account creation uses a six-digit email code. The Netlify Function stores only a keyed code digest, expires challenges after 10 minutes, limits retries, and creates the Firebase account as email-verified after a successful check. Delivery uses Resend; verify `ukid-templates.com` with Resend and configure these Netlify environment variables for production and deploy previews:

- `FIREBASE_SERVICE_ACCOUNT`: Firebase Admin service-account JSON for this project.
- `FIREBASE_WEB_API_KEY`: the Firebase project's web API key, used server-side to verify email/password credentials before deciding whether a device needs OTP. This is the same public project key used by the browser, not an Admin credential.
- `RESEND_API_KEY`: Resend API key with permission to send email.
- `AUTH_OTP_FROM_EMAIL`: verified sender address, for example `no-reply@ukid-templates.com`.
- `AUTH_OTP_SECRET`: a randomly generated secret of at least 32 characters. Keep it private and do not reuse the Firebase web API key.

The client uses `ukid-templates.com` as its Firebase `authDomain`. Add the domain to Firebase Authentication's authorized domains and configure each enabled OAuth provider for the custom callback `https://ukid-templates.com/__/auth/handler`. Netlify proxies `/__/auth/*` to this Firebase project's default Hosting auth helper. Deploy Firestore rules and indexes so the OTP challenge and IP rate-limit records are removed by their configured TTL fields:

```sh
firebase deploy --only firestore:rules,firestore:indexes
```

New email/password accounts require a code. Existing email/password accounts require one code per untrusted browser; that browser remains trusted for up to one year or until its local browser ID is cleared. Social sign-in providers do not use this OTP flow. The endpoint limits each email to one code per minute, limits each client IP to five requests per 15 minutes, and allows at most five verification attempts per code. The email OTP endpoint requires Netlify Functions and is not available from a static/offline copy or the local Express server.

Firestore rules and the learning workspace assistant require an OTP-issued token for email/password and custom-token sessions, preventing direct Firebase password sign-in from bypassing the device challenge. Trusted-device hashes expire after one year through Firestore TTL.

1. Select the Firebase project for this site and enable Authentication providers used by the app, Firestore, and the Email/Password or Google sign-in providers you intend to offer.
2. Add the Netlify production domain and any preview/custom domains to Firebase Authentication's authorized domains.
3. Deploy the included Firestore rules and indexes:

   ```sh
   firebase login
   firebase use --add
   firebase deploy --only firestore:rules,firestore:indexes
   ```

4. The rules grant administrative actions only to authenticated users with the Firebase custom claim `admin: true`. Set that claim from a trusted server or local administrative environment using Firebase Admin SDK; never add service-account credentials or claim-setting code to the browser. For example, after initializing Admin SDK with a secure credential:

   ```js
   const user = await admin.auth().getUser(uid);
   await admin.auth().setCustomUserClaims(uid, {
     ...user.customClaims,
     admin: true
   });
   ```

   Have the administrator sign out and back in (or refresh the ID token) after changing claims. The claim protects Firestore writes; hiding admin controls in the page is only a user-interface convenience.

5. Restrict the Firebase web API key to the site's domains where supported. The web API key in `firebase-config.js` is necessarily visible to visitors; it is not an Admin SDK credential.

## Netlify setup

1. Import the repository into Netlify. `netlify.toml` configures the build command, `dist` publish directory, function directory, and `/api/contact` route.
2. Add `FIREBASE_SERVICE_ACCOUNT` as a Netlify environment variable containing the Firebase service-account JSON for the same project. Keep it secret; do not commit it, put it in `firebase-config.js`, or place it in a deploy-published file. Use a service account with only the Firestore permissions needed by the contact function.
3. Deploy. The contact form writes to the `contacts` collection through `/.netlify/functions/contact`; direct client access to that collection is denied by Firestore Rules.
4. Verify the home page and contact page, then submit a test message and confirm it appears in Firestore. The function returns an explicit unavailable response if its service-account setting is missing or invalid.

For Firebase Hosting instead of Netlify, select the intended Firebase project with `firebase use --add`, run `npm run build:site`, then deploy `firebase deploy --only hosting`. The contact endpoint is specifically configured as a Netlify Function and must be replaced with a Firebase Function before the contact form can be deployed through Firebase Hosting alone.

## Local API note

`npm start` still runs the existing Express API for local development. Its `data/store.json` database is local-file persistence and is not deployed to Netlify Functions; the deployed site uses Firebase for browser features and the Netlify contact function. The legacy Express API routes are not available in the Netlify deployment.
