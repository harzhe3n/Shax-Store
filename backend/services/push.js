'use strict';
/**
 * Shax Store — Native Push Service
 *
 * Bridges the EXISTING in-app notification system (source of truth)
 * to optional native push delivery (best-effort only).
 *
 *  - registerDevice / unregisterDevice: account-scoped device token
 *    storage. The user_id ALWAYS comes from the authenticated JWT on
 *    the server (req.user.id) — clients never supply it, so a device
 *    can never be associated with the wrong account.
 *  - fanoutPush: resolves the same recipients the in-app system
 *    targets (audience 'all' | 'role' | 'user' — identical to
 *    visibilityWhere in services/notifications.js), looks up their
 *    ACTIVE device tokens, and pushes without ever blocking or
 *    disturbing the (already committed) in-app notification.
 *  - sendTestPush: admin-initiated diagnostic push (real or dry-run)
 *    whose outcome is persisted to the settings table so the admin
 *    panel can show the last result after a server restart.
 *  - Firebase Admin is OPTIONAL: if it isn't installed or there are
 *    no credentials, delivery is skipped with a log line. Dead
 *    tokens are marked inactive so fan-out stops retrying them.
 *  - Credentials NEVER come from the client. They are loaded from
 *    server environment config only:
 *       FIREBASE_SERVICE_ACCOUNT_B64  — base64 JSON service account
 *       FIREBASE_SERVICE_ACCOUNT_PATH — filesystem path to the JSON
 *    When neither is set the provider falls back to Application
 *    Default Credentials (GOOGLE_APPLICATION_CREDENTIALS /
 *    FIREBASE_CONFIG) so cloud hosts can configure push in place.
 *  - No secrets ever leave the server. Only device tokens belong to
 *    the client; provider credentials stay in server env config.
 */

const fs = require('fs');
const path = require('path');
const db = require('../config/db');

const MAX_TOKEN_LEN = 512;

/* ── Token lifecycle ───────────────────────────────────── */

/**
 * Store (or re-associate) a device token for an authenticated user.
 * A token is unique app-wide; if it already exists (e.g. a device
 * that was used by another account), the row is moved to the calling
 * user and re-activated. Idempotent.
 */
async function registerDevice({ userId, token, platform, deviceId }) {
  await db.execute(
    `INSERT INTO device_tokens (user_id, platform, token, device_identifier)
     VALUES (?,?,?,?)
     ON DUPLICATE KEY UPDATE
       user_id = VALUES(user_id),
       platform = VALUES(platform),
       device_identifier = VALUES(device_identifier),
       is_active = 1`,
    [userId, platform, token, deviceId || null]
  );
}

/**
 * Deactivate a device token for an authenticated user.
 * Scoped by BOTH user_id and token so an account can only ever
 * deactivate its own devices (account isolation on logout).
 * Returns true if a matching active row was deactivated.
 */
async function unregisterDevice({ userId, token }) {
  const [result] = await db.execute(
    `UPDATE device_tokens SET is_active = 0
     WHERE user_id = ? AND token = ? AND is_active = 1`,
    [userId, token]
  );
  return result.affectedRows > 0;
}

/* ── Recipient resolution (mirrors in-app visibility) ──── */

/**
 * Users that a notification is visible to (same audience/role/user
 * semantics as getUserNotifications / visibilityWhere in the
 * notifications service). Returns an array of numeric user ids.
 */
async function recipientUserIds(notification) {
  if (!notification || !notification.audience) return [];

  if (notification.audience === 'user' && notification.target_user_id) {
    return [Number(notification.target_user_id)];
  }

  if (notification.audience === 'role' && notification.target_role) {
    const [rows] = await db.execute(
      'SELECT id FROM users WHERE role = ?',
      [notification.target_role]
    );
    return rows.map(r => Number(r.id));
  }

  if (notification.audience === 'all') {
    const [rows] = await db.execute('SELECT id FROM users');
    return rows.map(r => Number(r.id));
  }

  return [];
}

/**
 * Resolve the ACTIVE device tokens belonging to a notification's
 * recipients. Returns { userIds, tokens } (tokens: {token, platform}).
 */
async function recipientDeviceTokens(notification) {
  const userIds = await recipientUserIds(notification);
  if (!userIds.length) return { userIds: [], tokens: [] };
  const [rows] = await db.execute(
    `SELECT token, platform FROM device_tokens
     WHERE is_active = 1 AND user_id IN (${userIds.map(() => '?').join(',')})`,
    userIds
  );
  return { userIds, tokens: rows };
}

/* ── Optional FCM delivery ─────────────────────────────── */

/* undefined = not yet checked, null = unavailable */
let _fb = undefined;
let _fbState = null;

function validateServiceAccount(sa) {
  if (!sa || typeof sa !== 'object' || Array.isArray(sa)) {
    throw new Error('Service account must be a JSON object.');
  }
  for (const key of ['project_id', 'client_email', 'private_key']) {
    if (typeof sa[key] !== 'string' || !sa[key]) {
      throw new Error(`Service account is missing "${key}".`);
    }
  }
}

/**
 * Load the Firebase service account from env (never the client).
 * Returns { source: 'none' } or { source, serviceAccount }.
 * Throws with a descriptive message when the configured value is broken.
 */
function serviceAccountFromEnv() {
  const b64 = (process.env.FIREBASE_SERVICE_ACCOUNT_B64 || '').trim();
  if (b64) {
    let sa;
    try {
      sa = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    } catch (err) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_B64 is not valid base64 JSON.');
    }
    validateServiceAccount(sa);
    return { source: 'service-account-b64', serviceAccount: sa };
  }

  const p = (process.env.FIREBASE_SERVICE_ACCOUNT_PATH || '').trim();
  if (p) {
    const abs = path.resolve(p);
    let sa;
    try {
      sa = JSON.parse(fs.readFileSync(abs, 'utf8'));
    } catch (err) {
      throw new Error(`FIREBASE_SERVICE_ACCOUNT_PATH is unreadable (${abs}): ${err.message}`);
    }
    validateServiceAccount(sa);
    return { source: 'service-account-path', serviceAccount: sa };
  }

  return { source: 'none' };
}

/**
 * Initialise (once) and cache the firebase-admin instance.
 * Returns the admin object, or null when the package is missing /
 * misconfigured — in which case push delivery is skipped but the
 * in-app notification system remains fully functional.
 */
function getFirebaseAdmin() {
  if (_fb !== undefined) return _fb;

  let fb = null;
  const state = {
    installed: false,
    configured: false,
    configuredVia: null,
    projectId: null,
    configError: null
  };

  try {
    const admin = require('firebase-admin'); // optional dependency
    state.installed = true;

    if (!admin.apps || admin.apps.length === 0) {
      const { source, serviceAccount } = serviceAccountFromEnv();
      if (source !== 'none') {
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
        state.configured = true;
        state.configuredVia = source;
        state.projectId = serviceAccount.project_id || null;
      } else if (
        process.env.GOOGLE_APPLICATION_CREDENTIALS ||
        process.env.FIREBASE_CONFIG ||
        process.env.GCLOUD_PROJECT
      ) {
        // Application Default Credentials configured by the deployment
        // host (GOOGLE_APPLICATION_CREDENTIALS / FIREBASE_CONFIG).
        admin.initializeApp();
        state.configured = true;
        state.configuredVia = 'application-default-credentials';
        state.projectId = (admin.apps[0] && admin.apps[0].options.projectId) || null;
      } else {
        // No credentials configured anywhere — do NOT initialise so the
        // original silent-skip behaviour is preserved (fanout logs and
        // skips instead of attempting broken sends).
        state.configured = false;
        state.configuredVia = null;
      }
    } else {
      state.configured = true;
      state.configuredVia = 'already-initialized';
      state.projectId = (admin.apps[0] && admin.apps[0].options.projectId) || null;
    }

    // Only hand back a usable admin instance when delivery is actually
    // configured; otherwise keep null so every caller takes the skip path.
    fb = state.configured ? admin : null;
  } catch (err) {
    /* Not installed, or credentials/data are broken. Keep delivery OFF;
       in-app notifications remain the source of truth. */
    fb = null;
    if (!(err && err.code === 'MODULE_NOT_FOUND')) {
      state.configError = (err && err.message) || String(err);
    }
  }

  _fb = fb;
  _fbState = state;
  return fb;
}

/**
 * Read-only status for the admin Push panel. Never returns secrets —
 * only booleans/counts and the two env var NAMES.
 */
function getPushConfigStatus() {
  getFirebaseAdmin(); // force the one-time evaluation above
  const state = _fbState || {};
  const configuredVia = state.configuredVia || null;
  const configured = Boolean(state.configured);
  return {
    installed: Boolean(state.installed),
    configured,
    configuredVia,
    projectId: state.projectId || null,
    configError: state.configError || null,
    env: {
      serviceAccountB64Set: Boolean((process.env.FIREBASE_SERVICE_ACCOUNT_B64 || '').trim()),
      serviceAccountPathSet: Boolean((process.env.FIREBASE_SERVICE_ACCOUNT_PATH || '').trim())
    },
    deliveryMode: state.installed && configured ? 'active' : 'unconfigured'
  };
}

function isDeadTokenError(err) {
  const code = (err && (err.code || (err.errorInfo && err.errorInfo.code))) || '';
  return (
    code === 'messaging/registration-token-not-registered' ||
    code === 'messaging/invalid-registration-token'
  );
}

function buildFcmMessage(notification, token) {
  return {
    token,
    notification: { title: notification.title, body: notification.message },
    data: {
      type: notification.type || 'general',
      notificationId: String(notification.id || ''),
      link: notification.link || '',
      title: notification.title,
      body: notification.message
    },
    android: { priority: 'high' }
  };
}

async function deliver(tokens, notification) {
  const fb = getFirebaseAdmin();
  if (!fb) {
    console.log(`[push] Firebase not configured — skipping ${tokens.length} device(s); in-app notification remains the source of truth.`);
    return { delivered: 0, skipped: tokens.length, invalid: 0, reason: 'firebase-unconfigured' };
  }

  let delivered = 0, invalid = 0;
  for (const row of tokens) {
    try {
      await fb.messaging().send(buildFcmMessage(notification, row.token));
      delivered += 1;
    } catch (err) {
      if (isDeadTokenError(err)) {
        invalid += 1;
        // Soft-delete the dead token so future fan-outs skip it.
        try {
          await db.execute('UPDATE device_tokens SET is_active = 0 WHERE token = ?', [row.token]);
        } catch { /* keep going */ }
      } else {
        console.error('[push] send error:', err && (err.message || err.code));
      }
    }
  }
  return { delivered, skipped: tokens.length - delivered, invalid };
}

/* ── Fan-out (best-effort, never throws) ───────────────── */

/**
 * Push a notification to all active devices of its recipients.
 * Fire-and-forget by callers. NEVER throws and NEVER touches the
 * already-committed in-app notification. If anything goes wrong it
 * returns a summary (and logs) instead of failing the request.
 */
async function fanoutPush(notification) {
  try {
    if (!notification || !notification.id) return { skipped: true };
    const { userIds, tokens } = await recipientDeviceTokens(notification);
    if (!tokens.length) return { recipients: userIds.length, devices: 0 };
    const out = await deliver(tokens, notification);
    return { ...out, recipients: userIds.length, devices: tokens.length };
  } catch (err) {
    console.error('[push] fan-out failed (in-app notification unaffected):', err);
    return { error: true };
  }
}

/* ── Admin diagnostics (real or dry-run test push) ────── */

/**
 * Persist the latest test-run outcome to the settings table so it
 * survives restarts and can be shown on the admin Push panel.
 * Best-effort: a failure here never affects the send itself.
 */
async function saveTestResult(result) {
  try {
    const payload = JSON.stringify(result);
    await db.execute(
      `INSERT INTO settings (key_name, value)
       VALUES ('push_test_result', ?)
       ON DUPLICATE KEY UPDATE value = VALUES(value)`,
      [payload]
    );
  } catch (err) {
    console.error('[push] could not persist test result:', err && err.message);
  }
}

/**
 * Latest persisted test-push outcome (or null).
 */
async function lastTestResult() {
  try {
    const [rows] = await db.execute(
      "SELECT value FROM settings WHERE key_name = 'push_test_result'"
    );
    if (!rows.length) return null;
    try { return JSON.parse(rows[0].value); } catch { return null; }
  } catch {
    return null;
  }
}

/**
 * Admin-initiated test push.
 *  - With `token`: targets that single device only.
 *  - Without `token`: resolves recipients from the audience/role/user
 *    fields (same semantics as an in-app broadcast).
 *  - When firebase-admin is unavailable or unconfigured this runs in
 *    DRY-RUN mode: it reports exactly how many recipients/devices WOULD
 *    be targeted and does not send anything.
 *  - Never throws; the outcome (real or projected) is persisted via
 *    saveTestResult and returned to the caller.
 */
async function sendTestPush({ title, message, type = 'general', audience = 'all', targetRole = null, targetUserId = null, token = null }) {
  const fb = getFirebaseAdmin();
  const targets = token
    ? { userIds: [], tokens: [{ token, platform: 'manual' }] }
    : await recipientDeviceTokens({ audience, target_role: targetRole, target_user_id: targetUserId });

  const result = {
    runAt: new Date().toISOString(),
    mode: 'dry-run',
    deliveryMode: getPushConfigStatus().deliveryMode,
    title: String(title || ''),
    message: String(message || ''),
    audience: token ? 'single-token' : audience,
    recipients: targets.userIds ? targets.userIds.length : 0,
    devices: targets.tokens ? targets.tokens.length : 0,
    sent: 0,
    failed: 0,
    invalid: 0,
    samples: [],
    reason: null
  };

  if (!fb || !targets.tokens.length) {
    result.reason = !fb ? 'firebase-unconfigured' : 'no-devices';
    result.mode = 'dry-run';
    await saveTestResult(result);
    return result;
  }

  // Real send (firebase configured and at least one active device).
  result.mode = 'real';
  const payload = {
    title: String(title || 'Shax Store test'),
    message: String(message || 'Test push notification'),
    type,
    id: 'test'
  };

  for (const t of targets.tokens) {
    try {
      await fb.messaging().send(buildFcmMessage(payload, t.token));
      result.sent += 1;
      result.samples.push({ ok: true, platform: t.platform || 'manual' });
    } catch (err) {
      if (isDeadTokenError(err)) {
        result.invalid += 1;
        try {
          await db.execute('UPDATE device_tokens SET is_active = 0 WHERE token = ?', [t.token]);
        } catch { /* keep going */ }
        result.samples.push({ ok: false, platform: t.platform || 'manual', error: 'invalid-token' });
      } else {
        result.failed += 1;
        result.samples.push({ ok: false, platform: t.platform || 'manual', error: (err && err.message) || 'error' });
      }
    }
  }

  await saveTestResult(result);
  return result;
}

module.exports = {
  MAX_TOKEN_LEN,
  registerDevice,
  unregisterDevice,
  recipientUserIds,
  recipientDeviceTokens,
  fanoutPush,
  getFirebaseAdmin,
  getPushConfigStatus,
  sendTestPush,
  lastTestResult
};