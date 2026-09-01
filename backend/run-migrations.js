const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

async function run() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'shaxstore',
    multipleStatements: true
  });

  const migrations = [
    '2026-06-sponsor-profit.sql',
    '2026-08-storage.sql',
    '2026-09-sponsors.sql',
    '2026-10-notifications.sql',
    '2026-11-device-tokens.sql',
    '2026-12-order-status-tracking.sql'
  ];

  for (const file of migrations) {
    const filePath = path.join(__dirname, 'migrations', file);
    console.log(`\n▶ Running ${file}...`);
    try {
      const sql = fs.readFileSync(filePath, 'utf8');
      await conn.query(sql);
      console.log(`  ✓ ${file} completed`);
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY' || err.message.includes('Duplicate')) {
        console.log(`  ⚠ ${file} — some columns/rows already exist, skipping duplicates`);
      } else if (err.message.includes('Duplicate column name')) {
        console.log(`  ⚠ ${file} — column already exists, skipping`);
      } else {
        console.error(`  ✗ ${file} FAILED:`, err.message);
      }
    }
  }

  await conn.end();
  console.log('\nDone.');
}

run().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
