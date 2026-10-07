import type { Request, Response } from "express";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { signToken } from "../auth/jwt.js";
import {
  createUserWithPassword,
  findUserByEmail,
  type User,
} from "../auth/userRepository.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toPublicUser(user: User) {
  return { id: user.id, email: user.email, displayName: user.display_name };
}

export async function register(req: Request, res: Response): Promise<void> {
  const { email, password, displayName } = req.body as {
    email?: string;
    password?: string;
    displayName?: string;
  };

  if (!email || !EMAIL_RE.test(email)) {
    res.status(400).json({ error: "Email inválido" });
    return;
  }
  if (!password || password.length < 8) {
    res.status(400).json({ error: "Senha precisa ter pelo menos 8 caracteres" });
    return;
  }
  if (!displayName || displayName.trim().length === 0) {
    res.status(400).json({ error: "Nome é obrigatório" });
    return;
  }

  const existing = await findUserByEmail(email);
  if (existing) {
    res.status(409).json({ error: "Já existe uma conta com esse email" });
    return;
  }

  const passwordHash = await hashPassword(password);
  const user = await createUserWithPassword(email, passwordHash, displayName.trim());
  const token = signToken({ sub: user.id, email: user.email });

  res.status(201).json({ token, user: toPublicUser(user) });
}

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({ error: "Email e senha são obrigatórios" });
    return;
  }

  const user = await findUserByEmail(email);
  if (!user || !user.password_hash) {
    res.status(401).json({ error: "Email ou senha incorretos" });
    return;
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    res.status(401).json({ error: "Email ou senha incorretos" });
    return;
  }

  const token = signToken({ sub: user.id, email: user.email });
  res.json({ token, user: toPublicUser(user) });
}

export async function me(req: Request, res: Response): Promise<void> {
  // req.user já foi validado pelo middleware requireAuth
  res.json({ id: req.user!.sub, email: req.user!.email });
}
