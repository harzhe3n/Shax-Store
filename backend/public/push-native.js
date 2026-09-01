/* SHAX STORE — native push foundation (Stage 9 Part 2/3).
   This file only activates inside the Capacitor app. In a normal browser it is inert:
   no permission is requested, no Capacitor is required, and the Stage 7 notification
   center is completely unaffected.
   Part 3 adds the authenticated token lifecycle: the device token is sent to the
   backend ONLY when a signed-in session exists (register on token arrival / login,
   unregister on logout). All calls are best-effort and swallowed on failure. */
(function () {
  'use strict';

  if (!window.Capacitor ||
      typeof window.Capacitor.isNativePlatform !== 'function' ||
      !window.Capacitor.isNativePlatform()) {
    return; /* regular browser -> never touch push */
  }

  var Push = window.Capacitor.Plugins && window.Capacitor.Plugins.PushNotifications;
  if (!Push) return;

  var DEFAULT_CHANNEL_ID = 'default';
  var DEFAULT_CHANNEL_NAME = 'Shax Store Notifications';
  var PLATFORM = (typeof window.Capacitor.getPlatform === 'function')
    ? window.Capacitor.getPlatform() : 'android';
  var DEVICE_ID = null;
  try {
    DEVICE_ID = localStorage.getItem('shax_device_id');
    if (!DEVICE_ID) {
      DEVICE_ID = 'dev-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem('shax_device_id', DEVICE_ID);
    }
  } catch (e) { /* storage unavailable — deviceId stays null */ }

  window.shaxNativePushAvailable = true;
  window.shaxPushToken = null;
  window.shaxPendingPushLink = null;

  /* ── small authed API helper (mirrors Main.js api(); self-contained) ── */
  function apiBase() {
    try {
      var cfg = window.ShaxNativeConfig && window.ShaxNativeConfig.apiBase;
      if (typeof cfg === 'string' && cfg.trim()) return cfg.replace(/\/+$/, '');
    } catch (e) { /* fall through */ }
    return (typeof API_BASE !== 'undefined' && API_BASE) ? API_BASE : '/api';
  }
  function sessionToken() {
    try { return localStorage.getItem('shax_token'); } catch (e) { return null; }
  }
  function authedPushRequest(path, body) {
    var t = sessionToken();
    if (!t) return Promise.resolve(false);
    return fetch(apiBase() + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + t
      },
      body: JSON.stringify(body)
    }).then(function (res) {
      if (!res.ok) throw new Error('http ' + res.status);
      return true;
    }).catch(function () { return false; });
  }

  /* ── authenticated token lifecycle (Part 3) ── */
  function buildRegisterBody() {
    return { token: window.shaxPushToken, platform: PLATFORM, deviceId: DEVICE_ID };
  }

  window.registerShaxPushToken = function () {
    if (!window.shaxPushToken) return Promise.resolve(false);
    return authedPushRequest('/push/register', buildRegisterBody());
  };

  window.deactivateShaxPush = function () {
    var t = window.shaxPushToken;
    var req = t
      ? authedPushRequest('/push/unregister', { token: t })
      : Promise.resolve(false);
    return req.then(function () {
      window.shaxPushToken = null;
      return true;
    });
  };

  /* ── plugin push foundation (Part 2) ── */
  function safeLink(data) {
    if (!data) return null;
    var link = data.link || data.url || data.notificationLink || null;
    return typeof link === 'string' && link ? link : null;
  }

  /* Only allow navigation to safe, same-origin app URLs (mirrors Main.js
     notifSafeLink so a malicious push payload can never leave the app). */
  function isSafeLink(link) {
    if (!link || typeof link !== 'string') return null;
    var s = link.trim();
    if (!s) return null;
    if (/^\s*javascript:/i.test(s)) return null;
    if (/^\s*(https?:|data:|vbscript:|file:)/i.test(s)) return null;
    if (/^\/\//.test(s)) return null;
    if (s.charAt(0) === '/' || s.charAt(0) === '#' ||
        s.indexOf('./') === 0 || s.indexOf('../') === 0 || s.indexOf(':') === -1) {
      return s;
    }
    return null;
  }

  function navigatePushTap(link) {
    var safe = isSafeLink(link);
    if (!safe) return;
    if (safe.charAt(0) === '#') {
      var target = null;
      try { target = document.querySelector(safe); } catch (e) { target = null; }
      if (target && target.scrollIntoView) target.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    try { window.location.href = safe; } catch (e) { /* ignore */ }
  }

  function setupPush() {
    Push.createChannel({
      id: DEFAULT_CHANNEL_ID,
      name: DEFAULT_CHANNEL_NAME,
      description: DEFAULT_CHANNEL_NAME,
      importance: 4,
      vibration: true,
      lights: true
    }).catch(function () { /* channel exists / unsupported platform */ });

    try {
      Push.addListener('registration', function (token) {
        window.shaxPushToken = token && token.value ? token.value : null;
        window.shaxPushRegistrationError = null;
        document.dispatchEvent(new CustomEvent('shax:push-token', { detail: window.shaxPushToken }));
        if (sessionToken()) window.registerShaxPushToken();
      });

      Push.addListener('registrationError', function (err) {
        window.shaxPushRegistrationError = err;
        document.dispatchEvent(new CustomEvent('shax:push-registration-error', { detail: err }));
      });

      Push.addListener('pushNotificationReceived', function (notification) {
        var link = safeLink(notification && notification.data);
        if (link) window.shaxPendingPushLink = link;
        document.dispatchEvent(new CustomEvent('shax:push-received', { detail: notification }));
      });

      Push.addListener('pushNotificationActionPerformed', function (res) {
        var notification = res && res.notification;
        var link = safeLink(notification && notification.data);
        if (link) {
          window.shaxPendingPushLink = link;
          navigatePushTap(link);
        }
        document.dispatchEvent(new CustomEvent('shax:push-tap', { detail: link }));
      });
    } catch (err) {
      /* listener registration failed — keep the app usable anyway */
    }
  }

  /* User-controlled flow (login / explicit action). Never auto-runs on startup.
     Always returns a Promise, never throws, and never lets a plugin error
     surface into the calling login handler. */
  window.requestShaxNotificationPermission = function () {
    if (!Push) return Promise.resolve(false);
    return Push.checkPermissions().then(function (state) {
      var granted = state && state.receive === 'granted';
      return (granted ? Promise.resolve() : Push.requestPermissions()).then(function () {
        return Push.register();
      });
    }).then(function () {
      if (window.shaxPushToken) return window.registerShaxPushToken();
      return true;
    }).catch(function () {
      return false;
    });
  };

  setupPush();
})();