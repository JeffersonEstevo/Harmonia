import { Router } from "express";
import { getSharedAudio, getSharedTrack } from "../controllers/shareController.js";

/** Rotas PÚBLICAS de visualização de links compartilhados — sem requireAuth (o token é a credencial). */
export const sharedRouter = Router();

sharedRouter.get("/shared/:token", getSharedTrack);
sharedRouter.get("/shared/:token/audio", getSharedAudio);
