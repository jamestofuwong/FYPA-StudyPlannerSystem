import type { PingResponse } from "../models/ping";

export function createPingResponse(): PingResponse {
  return {
    ok: true,
    message: "pong",
    timestamp: new Date().toISOString()
  };
}
