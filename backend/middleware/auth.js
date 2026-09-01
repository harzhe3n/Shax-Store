'use strict';
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('FATAL: JWT_SECRET is missing or too short (need ≥32 chars). Set it in .env');
  process.exit(1);
}

/**
 * Parses the JWT from the Authorization header.
 * Attaches decoded payload to req.user on success.
 */
function requireAuth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7).trim() : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }
    return res.status(401).json({ error: 'Invalid token.' });
  }
}

/**
 * Must be chained after requireAuth.
 * Allows admin AND super_admin users.
 */
function requireAdmin(req, res, next) {
  const u = req.user;
  const ok = u && (u.isAdmin || u.role === 'admin' || u.role === 'super_admin');
  if (!ok) {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  next();
}

/**
 * Must be chained after requireAuth.
 * Allows ONLY super_admin — used for creating admins and editing the
 * Telegram bot token.
 */
function requireSuperAdmin(req, res, next) {
  const u = req.user;
  if (!u || u.role !== 'super_admin') {
    return res.status(403).json({ error: 'Super admin access required.' });
  }
  next();
}

/**
 * Must be chained after requireAuth.
 * Allows sponsors AND admins (used for product/category management
 * endpoints that sponsors are permitted to use in a limited way).
 */
function requireSponsorOrAdmin(req, res, next) {
  const u = req.user;
  const ok = u && (u.isAdmin || u.role === 'admin' || u.role === 'super_admin' || u.role === 'sponsor');
  if (!ok) {
    return res.status(403).json({ error: 'Sponsor or admin access required.' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin, requireSuperAdmin, requireSponsorOrAdmin };
