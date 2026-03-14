import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "app.db");

mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    picture TEXT,
    auth_provider TEXT NOT NULL,
    password_hash TEXT,
    password_salt TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS strategy_purchases (
    user_id TEXT NOT NULL,
    strategy_id TEXT NOT NULL,
    purchased_at TEXT NOT NULL,
    PRIMARY KEY (user_id, strategy_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

const findUserByEmailStmt = db.prepare(`
  SELECT id, email, name, picture, auth_provider, created_at
  FROM users
  WHERE email = ?
`);

const findUserByIdStmt = db.prepare(`
  SELECT id, email, name, picture, auth_provider, created_at
  FROM users
  WHERE id = ?
`);

const findEmailAuthRowStmt = db.prepare(`
  SELECT id, email, name, picture, auth_provider, password_hash, password_salt, created_at
  FROM users
  WHERE email = ?
`);

const insertUserStmt = db.prepare(`
  INSERT INTO users (id, email, name, picture, auth_provider, password_hash, password_salt, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const updateGoogleUserStmt = db.prepare(`
  UPDATE users
  SET name = ?, picture = ?, auth_provider = ?
  WHERE email = ?
`);

const insertSessionStmt = db.prepare(`
  INSERT INTO sessions (id, user_id, expires_at, created_at)
  VALUES (?, ?, ?, ?)
`);

const findSessionStmt = db.prepare(`
  SELECT s.id, s.user_id, s.expires_at
  FROM sessions s
  WHERE s.id = ?
`);

const deleteSessionStmt = db.prepare(`
  DELETE FROM sessions
  WHERE id = ?
`);

const deleteExpiredSessionsStmt = db.prepare(`
  DELETE FROM sessions
  WHERE expires_at < ?
`);

const insertPurchaseStmt = db.prepare(`
  INSERT OR IGNORE INTO strategy_purchases (user_id, strategy_id, purchased_at)
  VALUES (?, ?, ?)
`);

const ownedStrategiesStmt = db.prepare(`
  SELECT strategy_id
  FROM strategy_purchases
  WHERE user_id = ?
  ORDER BY purchased_at DESC
`);

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix) {
  return `${prefix}_${randomBytes(16).toString("hex")}`;
}

function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const hash = scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}

function verifyPassword(password, salt, expectedHash) {
  const actualHash = scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHash, "hex");
  return actualHash.length === expected.length && timingSafeEqual(actualHash, expected);
}

function safeUser(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    picture: row.picture,
    authProvider: row.auth_provider,
    createdAt: row.created_at
  };
}

export function getUserByEmail(email) {
  return safeUser(findUserByEmailStmt.get(email));
}

export function getUserById(userId) {
  return safeUser(findUserByIdStmt.get(userId));
}

export function createEmailUser({ email, name, password }) {
  const existing = findEmailAuthRowStmt.get(email);
  if (existing) {
    throw new Error("This email is already registered.");
  }

  const id = createId("user");
  const createdAt = nowIso();
  const { hash, salt } = hashPassword(password);

  insertUserStmt.run(id, email, name, null, "email", hash, salt, createdAt);
  insertPurchaseStmt.run(id, "yes-no-parity-reversal", createdAt);
  return getUserById(id);
}

export function signInEmailUser({ email, password }) {
  const row = findEmailAuthRowStmt.get(email);
  if (!row || !row.password_hash || !row.password_salt) {
    throw new Error("No account found for this email.");
  }

  if (!verifyPassword(password, row.password_salt, row.password_hash)) {
    throw new Error("Incorrect email or password.");
  }

  return safeUser(row);
}

export function upsertGoogleUser({ id, email, name, picture }) {
  const existing = findEmailAuthRowStmt.get(email);
  if (existing) {
    updateGoogleUserStmt.run(name, picture || null, "google", email);
    insertPurchaseStmt.run(existing.id, "yes-no-parity-reversal", nowIso());
    return getUserById(existing.id);
  }

  const createdAt = nowIso();
  insertUserStmt.run(id, email, name, picture || null, "google", null, null, createdAt);
  insertPurchaseStmt.run(id, "yes-no-parity-reversal", createdAt);
  return getUserById(id);
}

export function createSession(userId) {
  cleanupExpiredSessions();
  const id = createId("sess");
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString();
  insertSessionStmt.run(id, userId, expiresAt, createdAt);
  return { id, expiresAt };
}

export function deleteSession(sessionId) {
  if (sessionId) {
    deleteSessionStmt.run(sessionId);
  }
}

export function getUserBySession(sessionId) {
  if (!sessionId) {
    return null;
  }

  cleanupExpiredSessions();
  const row = findSessionStmt.get(sessionId);
  if (!row) {
    return null;
  }

  return getUserById(row.user_id);
}

export function cleanupExpiredSessions() {
  deleteExpiredSessionsStmt.run(nowIso());
}

export function getOwnedStrategyIds(userId) {
  if (!userId) {
    return [];
  }

  return ownedStrategiesStmt.all(userId).map((row) => row.strategy_id);
}

export function addOwnedStrategy(userId, strategyId) {
  insertPurchaseStmt.run(userId, strategyId, nowIso());
}
