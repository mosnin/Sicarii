// One line of JSON per event, on stdout. Every hosted target we might run on
// (LiveKit Cloud Agents, Fly, Render, ECS, Kubernetes) collects stdout and
// nothing else, so structured lines here are the difference between grepping a
// failed call and guessing at it.
//
// Nothing in this module ever receives a secret: the internal API client keeps
// its shared secret out of every message it produces before it reaches a logger.

import type { Logger } from "./tenant.js";

type Level = "info" | "warn" | "error";

const LEVELS: Record<Level, number> = { info: 10, warn: 20, error: 30 };

function threshold(): number {
  const configured = (process.env.LOG_LEVEL ?? "info").toLowerCase() as Level;
  return LEVELS[configured] ?? LEVELS.info;
}

export function createLogger(base: Record<string, unknown> = {}): Logger {
  const min = threshold();

  const emit = (level: Level, message: string, fields?: Record<string, unknown>) => {
    if (LEVELS[level] < min) return;
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      component: "voice-agent",
      message,
      ...base,
      ...fields,
    });
    if (level === "error") process.stderr.write(`${line}\n`);
    else process.stdout.write(`${line}\n`);
  };

  return {
    info: (message, fields) => emit("info", message, fields),
    warn: (message, fields) => emit("warn", message, fields),
    error: (message, fields) => emit("error", message, fields),
  };
}
