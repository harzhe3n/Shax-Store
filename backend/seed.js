'use strict';
/**
 * Shax Store — Database Seeder
 * Run: npm run seed
 *
 * Creates the first admin user from .env values, plus one default
 * "Other Stores" category (fully editable afterwards in the Admin Panel).
 *
 * No products are seeded — the storefront starts empty until the
 * admin adds products through the Admin Panel.
 *
 * SECURITY: Admin password is read from ADMIN_PASSWORD in .env — never hardcoded here.
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db     = require('./config/db');

/* ── Validate required env vars ──────────────────────────── */
const ADMIN_NAME     = process.env.ADMIN_NAME;
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('❌  ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD must all be set in .env');
  process.exit(1);
}

if (ADMIN_PASSWORD.length < 12) {
  console.error('❌  ADMIN_PASSWORD must be at least 12 characters for security.');
  process.exit(1);
}

async function seed() {
  console.log('🌱  Shax Store — Database Seeder\n');

  try {
    /* ── 1. Super Admin User ────────────────────────── */
    const [existing] = await db.execute(
      'SELECT id, role FROM users WHERE email = ?',
      [ADMIN_EMAIL.toLowerCase()]
    );
    if (existing.length) {
      // Make sure the seeded account is a super_admin (upgrades older installs).
      if (existing[0].role !== 'super_admin') {
        await db.execute(
          "UPDATE users SET role = 'super_admin', is_admin = 1 WHERE id = ?",
          [existing[0].id]
        );
        console.log(`ℹ️   Existing account upgraded to SUPER ADMIN: ${ADMIN_EMAIL}`);
      } else {
        console.log(`ℹ️   Super admin already exists: ${ADMIN_EMAIL}`);
      }
    } else {
      const hashed = await bcrypt.hash(ADMIN_PASSWORD, 12);
      await db.execute(
        "INSERT INTO users (name, email, password, is_admin, role) VALUES (?,?,?,1,'super_admin')",
        [ADMIN_NAME, ADMIN_EMAIL.toLowerCase(), hashed]
      );
      console.log(`✅  Super admin created: ${ADMIN_EMAIL}`);
      console.log(`    (Password set from .env — do not share it)`);
    }

    /* ── 2. Default Category ─────────────────────────── */
    const [[{ cnt }]] = await db.execute('SELECT COUNT(*) AS cnt FROM categories');
    if (cnt > 0) {
      console.log(`ℹ️   Categories already exist (${cnt} found) — skipping.`);
    } else {
      await db.execute(
        `INSERT INTO categories (id, name, name_ku, name_ar, image_url, sort_order)
         VALUES (?,?,?,?,?,?)`,
        ['other-stores', 'Other Stores', 'فرۆشگای تر', 'متاجر أخرى', null, 0]
      );
      console.log('✅  Default category created: "Other Stores"');
      console.log('    (Editable any time from the Admin Panel)');
    }

    console.log('\n🎉  Seeding complete! The storefront has no products yet —');
    console.log('    add your first ones from the Admin Panel.');
  } catch (err) {
    console.error('❌  Seed error:', err.message);
  } finally {
    await db.end();
    process.exit(0);
  }
}

seed();
