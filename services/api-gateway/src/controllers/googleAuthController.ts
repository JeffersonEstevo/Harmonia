/**
 * Google OAuth 2.0 — fluxo "authorization code" manual (sem passport),
 * usando fetch nativo do Node. Ver docs/DECISIONS.md: sem credenciais
 * reais (GOOGLE_CLIENT_ID/SECRET) configuradas, essas rotas respondem 501
 * em vez de quebrar — o usuário precisa criar um app OAuth no Google Cloud
 * Console e preencher o .env pra isso funcionar de verdade.
 */
import type { Request, Response } from "express";
import { config } from "../config/index.js";
import { signToken } from "../auth/jwt.js";
import { createUserWithOAuth, findUserByOAuth, findUserByEmail } from "../auth/userRepository.js";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

function isConfigured(): boolean {
  return Boolean(config.googleClientId && config.googleClientSecret);
}

export function googleLoginRedirect(_req: Request, res: Response): void {
  if (!isConfigured()) {
    res.status(501).json({
      error:
        "Login com Google não configurado neste ambiente — defina GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET (ver services/api-gateway/.env.example)",
    });
    return;
  }

  const params = new URLSearchParams({
    client_id: config.googleClientId!,
    redirect_uri: config.googleRedirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "online",
    prompt: "select_account",
  });

  res.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`);
}

export async function googleCallback(req: Request, res: Response): Promise<void> {
  if (!isConfigured()) {
    res.status(501).json({ error: "Login com Google não configurado neste ambiente" });
    return;
  }

  const code = req.query.code as string | undefined;
  if (!code) {
    res.status(400).json({ error: "Código de autorização ausente" });
    return;
  }

  try {
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: config.googleClientId!,
        client_secret: config.googleClientSecret!,
        redirect_uri: config.googleRedirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      res.status(502).json({ error: "Falha ao trocar código por token com o Google" });
      return;
    }

    const { access_token: accessToken } = (await tokenRes.json()) as { access_token: string };

    const profileRes = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const profile = (await profileRes.json()) as { sub: string; email: string; name: string };

    let user = await findUserByOAuth("google", profile.sub);
    if (!user) {
      const existing = await findUserByEmail(profile.email);
      user = existing ?? (await createUserWithOAuth(profile.email, profile.name, "google", profile.sub));
    }

    const token = signToken({ sub: user.id, email: user.email });

    const frontendUrl = config.corsOrigin[0] ?? "http://localhost:5173";
    res.redirect(`${frontendUrl}/?token=${token}`);
  } catch (err) {
    res.status(502).json({ error: `Falha no login com Google: ${err}` });
  }
}
