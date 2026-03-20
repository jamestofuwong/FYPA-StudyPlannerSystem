import type { PingResponse } from "../shared/types/ping";

export function ping(): PingResponse {
  return {
    ok: true,
    message: "pong",
    timestamp: new Date().toISOString()
  };
}
