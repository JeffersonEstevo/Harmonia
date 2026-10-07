import { pool } from "../db/pool.js";

export interface User {
  id: string;
  email: string;
  password_hash: string | null;
  display_name: string;
  oauth_provider: string | null;
  oauth_subject: string | null;
  created_at: Date;
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const result = await pool.query<User>("SELECT * FROM users WHERE email = $1", [email]);
  return result.rows[0] ?? null;
}

export async function findUserById(id: string): Promise<User | null> {
  const result = await pool.query<User>("SELECT * FROM users WHERE id = $1", [id]);
  return result.rows[0] ?? null;
}

export async function findUserByOAuth(provider: string, subject: string): Promise<User | null> {
  const result = await pool.query<User>(
    "SELECT * FROM users WHERE oauth_provider = $1 AND oauth_subject = $2",
    [provider, subject],
  );
  return result.rows[0] ?? null;
}

export async function createUserWithPassword(
  email: string,
  passwordHash: string,
  displayName: string,
): Promise<User> {
  const result = await pool.query<User>(
    `INSERT INTO users (email, password_hash, display_name)
     VALUES ($1, $2, $3) RETURNING *`,
    [email, passwordHash, displayName],
  );
  return result.rows[0];
}

export async function createUserWithOAuth(
  email: string,
  displayName: string,
  provider: string,
  subject: string,
): Promise<User> {
  const result = await pool.query<User>(
    `INSERT INTO users (email, display_name, oauth_provider, oauth_subject)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [email, displayName, provider, subject],
  );
  return result.rows[0];
}
