/* SHAX STORE — Native app API origin override.
   The Capacitor app bundles its web assets locally; the WebView origin is a
   local scheme with NO backend behind it, so API calls need a real backend
   origin. The website itself keeps same-origin relative /api and is untouched
   by this file.

   SET `apiBase` to your deployed backend HTTPS origin for release builds
   (e.g. 'https://api.yourdomain.com' — your ACTUAL backend). NOTE: the old
   default 'https://shaxstore.com' is currently an unrelated Shopify site and
   must NOT be used. Leave it '' to fall back to same-origin '/api', which
   works when the app is loaded from the backend (dev: server.url set in
   capacitor.config.json). */
window.ShaxNativeConfig = {
  apiBase: ''
};