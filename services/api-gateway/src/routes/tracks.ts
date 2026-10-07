import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  getTrack,
  getTrackAudio,
  listTracks,
  patchTrack,
  removeTrack,
  saveTrack,
} from "../controllers/trackController.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB — mesmo limite do client (ver docs/SPEC.md §4.2)
});

export const tracksRouter = Router();

tracksRouter.use(requireAuth); // todas as rotas de tracks exigem login

tracksRouter.post("/tracks", upload.single("file"), saveTrack);
tracksRouter.get("/tracks", listTracks);
tracksRouter.get("/tracks/:id", getTrack);
tracksRouter.get("/tracks/:id/audio", getTrackAudio);
tracksRouter.patch("/tracks/:id", patchTrack);
tracksRouter.delete("/tracks/:id", removeTrack);
