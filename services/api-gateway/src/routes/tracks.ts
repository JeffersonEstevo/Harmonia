import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/requireAuth.js";
import { createShare, listShares, revokeShare } from "../controllers/shareController.js";
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

tracksRouter.use("/tracks", requireAuth); // todas as rotas de tracks exigem login (e SÓ elas)

tracksRouter.post("/tracks", upload.single("file"), saveTrack);
tracksRouter.get("/tracks", listTracks);
tracksRouter.get("/tracks/:id", getTrack);
tracksRouter.get("/tracks/:id/audio", getTrackAudio);
tracksRouter.patch("/tracks/:id", patchTrack);
tracksRouter.delete("/tracks/:id", removeTrack);

tracksRouter.post("/tracks/:id/shares", createShare);
tracksRouter.get("/tracks/:id/shares", listShares);
tracksRouter.delete("/tracks/:id/shares/:shareId", revokeShare);
