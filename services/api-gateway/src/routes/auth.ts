import { Router } from "express";
import { register, login, me } from "../controllers/authController.js";
import { googleLoginRedirect, googleCallback } from "../controllers/googleAuthController.js";
import { requireAuth } from "../middleware/requireAuth.js";

export const authRouter = Router();

authRouter.post("/auth/register", register);
authRouter.post("/auth/login", login);
authRouter.get("/auth/me", requireAuth, me);

authRouter.get("/auth/google", googleLoginRedirect);
authRouter.get("/auth/google/callback", googleCallback);
