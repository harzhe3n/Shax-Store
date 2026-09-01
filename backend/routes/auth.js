'use strict';
/**
 * Shax Store — Auth Routes
 * POST /api/auth/login
 * POST /api/auth/signup
 * GET  /api/auth/me
 */
const router    = require('express').Router();
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const db        = require('../config/db');

const JWT_SECRET  = process.env.JWT_SECRET;
const JWT_EXPIRES = '7d';

/* 5 auth attempts per 15 min per IP */
const authLimiter = rateLimit({
  windowMs      : 15 * 60 * 1000,
  max           : 5,
  message       : { error: 'Too many attempts — try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders : false
});

/* ── POST /api/auth/login ──────────────────────────────── */
router.post('/login', authLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    const [rows] = await db.execute(
      'SELECT id, name, email, password, is_admin, role FROM users WHERE email = ?',
      [email.toLowerCase().trim()]
    );

    /* Always run bcrypt to prevent timing attacks */
    const dummy = '$2a$12$invalidhashfortimingattack.......';
    const hash  = rows.length ? rows[0].password : dummy;
    const match = await bcrypt.compare(password, hash);

    if (!rows.length || !match) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const user  = rows[0];
    const role  = user.role || (user.is_admin ? 'admin' : 'customer');
    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, isAdmin: Boolean(user.is_admin), role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, isAdmin: Boolean(user.is_admin), role }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed.' });
  }
});

/* ── POST /api/auth/signup ─────────────────────────────── */
router.post('/signup', authLimiter, async (req, res) => {
  const { name, email, password } = req.body || {};

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email and password are required.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }
  /* Basic email format guard */
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email format.' });
  }

  try {
    const [existing] = await db.execute(
      'SELECT id FROM users WHERE email = ?',
      [email.toLowerCase().trim()]
    );
    if (existing.length) {
      return res.status(409).json({ error: 'Email already registered.' });
    }

    const hashed  = await bcrypt.hash(password, 12);
    const [result] = await db.execute(
      "INSERT INTO users (name, email, password, is_admin, role) VALUES (?, ?, ?, 0, 'customer')",
      [name.trim(), email.toLowerCase().trim(), hashed]
    );

    const token = jwt.sign(
      { id: result.insertId, name: name.trim(), email: email.toLowerCase().trim(), isAdmin: false, role: 'customer' },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    res.status(201).json({
      token,
      user: { id: result.insertId, name: name.trim(), email: email.toLowerCase().trim(), isAdmin: false, role: 'customer' }
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Registration failed.' });
  }
});

/* ── GET /api/auth/me ──────────────────────────────────── */
router.get('/me', async (req, res) => {
  const header = req.headers['authorization'] || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not authenticated.' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const [rows]  = await db.execute(
      'SELECT id, name, email, is_admin, role, created_at FROM users WHERE id = ?',
      [decoded.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found.' });
    const u = rows[0];
    res.json({
      id: u.id, name: u.name, email: u.email,
      isAdmin: Boolean(u.is_admin),
      role: u.role || (u.is_admin ? 'admin' : 'customer'),
      createdAt: u.created_at
    });
  } catch {
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
});

module.exports = router;
