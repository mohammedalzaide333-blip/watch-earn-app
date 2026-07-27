const { Pool } = require("pg");
require("dotenv").config();

const dbPath = process.env.DB_PATH || "./data/app.db";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes("localhost")
    ? false
    : { rejectUnauthorized: false },
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      balance NUMERIC(12,4) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ad_sessions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      completed_at TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT 'pending',
      amount NUMERIC(12,4)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS withdrawals (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      amount NUMERIC(12,4) NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      note TEXT
    );
  `);

  // سجل كل postback وارد من شبكة الإعلانات، بمعرّف فريد لمنع تكرار إضافة نفس الرصيد مرتين
  await pool.query(`
    CREATE TABLE IF NOT EXISTS offerwall_postbacks (
      id SERIAL PRIMARY KEY,
      transaction_id TEXT UNIQUE NOT NULL,
      user_id INTEGER NOT NULL REFERENCES users(id),
      amount NUMERIC(12,4) NOT NULL,
      network TEXT,
      raw_query TEXT,
      received_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // ترحيل: إضافة عمود البريد الإلكتروني للحسابات التي أُنشئت قبل إضافة هذه الميزة
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_resets (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      token TEXT UNIQUE NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_ad_sessions_user_time ON ad_sessions(user_id, started_at);
  `);
}

module.exports = { pool, init };
