import type { Request, Response } from "express";
import { config } from "../config/index.js";

export function getHealth(_req: Request, res: Response) {
  res.json({
    status: "ok",
    service: "api-gateway",
    version: config.version,
    timestamp: new Date().toISOString(),
  });
}
