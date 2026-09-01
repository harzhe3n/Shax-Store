# Shax Store

A premium gym-products store: Express + MySQL REST API, web storefront (vanilla JS), a mobile app wrapper via Ionic Capacitor, and a full admin panel. Includes role-based accounts (customers, sponsors, admins), orders with tracking, notifications (in-app + optional native push), Telegram alerts, and a warehouse/storage module.

## Project layout

```
.
├── backend/            # Express + MySQL API, web storefront & admin panel
│   ├── config/         #   DB pool, native-config
│   ├── routes/         #   auth, admin, sponsor, products, orders, notifications, push, …
│   ├── services/       #   notifications, push, telegram, …
│   ├── middleware/     #   auth (JWT), upload
│   ├── migrations/     #   idempotent SQL migrations (run-migrations.js)
│   ├── public/         #   storefront (index.html, Main.js), admin/ panel
│   └── tests/          #   automated API test suite (node:test)
├── android/            # Capacitor-generated Android project (app package com.shaxstore.app)
├── ios/                # Capacitor-generated iOS project (build on macOS with Xcode)
├── capacitor.config.json
├── package.json        # root scripts: sync, open, build
└── README.md
```

## Prerequisites

- **Node.js ≥ 18** (developed & tested on Node 24)
- **MySQL** (8.x recommended)
- **JDK 21 + Android SDK** (to build the Android APK)
- **macOS + Xcode** (only to build/sign the iOS app)

## 1. Backend setup

```sh
cd backend
npm install
cp .env.example .env     # then fill in real values (never commit .env)
node run-migrations.js   # creates DB + runs all migrations (idempotent — safe to rerun)
npm run seed             # creates the admin account from ADMIN_* in .env
npm start                # API on http://localhost:3000
```

Required `.env` keys: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET` (≥ 32 chars), `ADMIN_NAME/EMAIL/PASSWORD`, `PORT`, `ALLOWED_ORIGIN`. Optional: `PUBLIC_BASE_URL`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, and the Firebase variables below.

> In production `NODE_ENV=production` is enforced and `ALLOWED_ORIGIN` may not be `*`.

## 2. Admin panel

Open http://localhost:3000/admin and sign in with the seeded admin account. Sections: Dashboard, Products, Categories, Filters, Orders, Storage, Analytics, Sponsor Analytics, Notifications, Push Messages, Settings.

## 3. Tests

```sh
cd backend
npm test          # node --test tests/ — spawns its own server on a test port & cleans up after itself
```

## 4. Native mobile app (Capacitor)

Web source of truth lives in `backend/public` (`capacitor.config.json` → `webDir: backend/public`).

```sh
npm install                 # root — installs Capacitor 8 + push-notifications plugin
npx cap sync                # copies web assets + plugins into android/ and ios/
npx cap copy                # re-copy web assets only (frontend-only refresh)
npm run open:android        # open in Android Studio
npm run open:ios            # open in Xcode (macOS)
```

### Build the Android APK (Windows)

```sh
cd android
set ANDROID_HOME=C:\Users\<you>\AppData\Local\Android\Sdk
set JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot
gradlew.bat assembleDebug
# Output: android/app/build/outputs/apk/debug/app-debug.apk
```

- Install on a device `adb install -r app-debug.apk`
- The in-app notification bell works everywhere; native push delivery additionally requires Firebase (below).
- Release signing / AAB bundles are out of scope for the current build (debug key only).

## 5. Native push notifications (Firebase Cloud Messaging)

Push is **optional and best-effort**. The in-app notification system is the source of truth — it works with or without Firebase. When Firebase is not configured, device fan-out and admin test pushes run in **dry-run** mode (projections only, nothing sent).

### 5.1 Server (admin can verify in Admin → Push Messages)

1. Create a Firebase project (or use an existing one) → **Project settings → Service accounts → Generate new private key** → download `serviceAccount.json`.
2. Configure one (either):
   - `FIREBASE_SERVICE_ACCOUNT_B64` — base64 of the JSON: `base64 -w0 serviceAccount.json` (paste in `.env`)
   - `FIREBASE_SERVICE_ACCOUNT_PATH` — the file's absolute path on the server machine
   - or host the API on a service that provides `GOOGLE_APPLICATION_CREDENTIALS` / `FIREBASE_CONFIG`
3. Restart the API. The **Push Messages** page flips to **Active** and shows the Firebase project id. `POST /api/admin/push/test` then performs real sends (also see below).

### 5.2 Android app

1. Firebase console → Project settings → **Your apps → Android** → register the app with package `com.shaxstore.app`, download **`google-services.json`** and place it at **`android/app/google-services.json`**.
2. Root `android/build.gradle` already loads the Google Services plugin (`classpath com.google.gms:google-services:4.4.4`); the app module auto-applies it **only when the file exists** — no gradle edits required.
3. Rebuild the APK (`gradlew.bat assembleDebug`) and reinstall. After login, the app registers the device token automatically (`POST /api/push/register`) — no code to write.
4. Android 13+ will prompt for notification permission (`POST_NOTIFICATIONS` is already in the manifest).

### 5.3 iOS app (macOS + Xcode required — not buildable on Windows)

1. Firebase → add an iOS app (bundle id `com.shaxstore.app`) and download `GoogleService-Info.plist` (or use Firebase via the Service-Account/APNs flow).
2. In Xcode add the **Push Notifications** capability (adds the `aps-environment` entitlement).
3. Generate an **APNs key (`.p8`)** in the Apple Developer portal and upload it to Firebase (Cloud Messaging → APNs).
4. `ios/App/App/Info.plist` already declares `UIBackgroundModes = [remote-notification]` so the app wakes for silent notifications.
5. Since no macOS runner is available here, iOS builds/signing are performed with Xcode on a Mac; follow the standard Capacitor iOS workflow.

> Credentials (`.p8`, `GoogleService-Info.plist`, keystores, `google-services.json`) are never committed — the gitignores cover them.

## 6. Deploying the API

The API is a standard Node process (`node server.js`; `Procfile` provided). It serves both the API and the storefront/admin web assets, so a single origin is enough:

- Set `NODE_ENV=production`, a concrete `ALLOWED_ORIGIN`, a strong `JWT_SECRET`, real DB creds and (optionally) the Telegram/Firebase values.
- `npm start`. Use a process manager / platform of your choice (e.g. Heroku/Render/Railway with the Procfile).

## Security notes

- Passwords are hashed with bcrypt; JWTs are signed with the env secret and expire after 7 days.
- `device_tokens.user_id` is always taken from the authenticated JWT — clients can never attach a token to another account; logout deactivates only the caller's own tokens.
- Firebase/Telegram/DB credentials live solely in server-side env config; the admin push endpoints expose booleans/counts, never secrets.