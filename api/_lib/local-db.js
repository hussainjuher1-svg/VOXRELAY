import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

let dbInstance = null;

export function isLocalDbAllowed() {
  return process.env.VERCEL !== '1';
}

export function getLocalDb() {
  if (!isLocalDbAllowed()) return null;
  const dataDir = path.join(process.cwd(), '.data');
  const dbPath = path.join(dataDir, 'voxrelay.sqlite');
  if (dbInstance && fs.existsSync(dbPath)) return dbInstance;

  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

  db.exec(`
    CREATE TABLE IF NOT EXISTS access_requests (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL DEFAULT '',
      work_email TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'interpreter',
      organization TEXT NOT NULL DEFAULT '',
      country TEXT NOT NULL DEFAULT '',
      languages TEXT NOT NULL DEFAULT '',
      message TEXT NOT NULL DEFAULT '',
      consent INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'pending',
      reviewer_note TEXT NOT NULL DEFAULT '',
      invite_token_hash TEXT,
      invite_expires_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS email_outbox (
      id TEXT PRIMARY KEY,
      to_email TEXT NOT NULL,
      locale TEXT NOT NULL DEFAULT 'en',
      kind TEXT NOT NULL DEFAULT 'notification',
      subject TEXT NOT NULL,
      text_body TEXT NOT NULL,
      html_body TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS local_users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT 'interpreter',
      password_hash TEXT NOT NULL,
      locale TEXT NOT NULL DEFAULT 'en',
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS local_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      user_agent TEXT NOT NULL DEFAULT '',
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS assignments (
      id TEXT PRIMARY KEY,
      ref TEXT NOT NULL UNIQUE,
      owner_id TEXT NOT NULL,
      start_at TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL,
      time_zone TEXT NOT NULL DEFAULT 'UTC',
      language_pair TEXT NOT NULL,
      modality TEXT NOT NULL DEFAULT 'video_remote',
      category TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'scheduled',
      checklist_json TEXT NOT NULL DEFAULT '[]',
      personal_note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS terms (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      label TEXT NOT NULL,
      source_lang TEXT NOT NULL DEFAULT '',
      target_lang TEXT NOT NULL DEFAULT '',
      target_term TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS support_tickets (
      id TEXT PRIMARY KEY,
      requester_id TEXT NOT NULL,
      requester_email TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'general',
      subject TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS support_messages (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL,
      author_id TEXT NOT NULL,
      author_role TEXT NOT NULL DEFAULT 'user',
      body TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_id TEXT,
      area TEXT NOT NULL,
      type TEXT NOT NULL,
      object_ref TEXT,
      result TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rate_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS assistant_feedback (
      id TEXT PRIMARY KEY,
      mode TEXT NOT NULL,
      rating TEXT NOT NULL,
      question_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  dbInstance = db;
  return dbInstance;
}

export function hashSecret(raw) {
  const secret = process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'voxrelay-dev-secret-change-me';
  return crypto.createHmac('sha256', secret).update(String(raw)).digest('hex');
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(password), salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

export function verifyPassword(password, stored) {
  if (!stored || !stored.startsWith('scrypt:')) return false;
  const [, salt, hex] = stored.split(':');
  if (!salt || !hex) return false;
  const derived = crypto.scryptSync(String(password), salt, 64, { N: 16384, r: 8, p: 1 });
  const expected = Buffer.from(hex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

export function enqueueOutboxEmail(db, { toEmail, locale = 'en', kind = 'notification', subject, textBody, htmlBody }) {
  if (!db) return null;
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO email_outbox (id, to_email, locale, kind, subject, text_body, html_body, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, toEmail, locale, kind, subject, textBody, htmlBody, createdAt);
  return { id, toEmail, locale, kind, subject, createdAt };
}

export function writeLocalAudit(db, { actorId = null, area, type, objectRef = null, result = 'ok' }) {
  if (!db) return;
  db.prepare(
    `INSERT INTO audit_events (actor_id, area, type, object_ref, result, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(actorId, area, type, objectRef, result, new Date().toISOString());
}
