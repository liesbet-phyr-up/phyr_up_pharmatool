import type { Express, Request, Response } from "express";
import { parse as parseCookieHeader } from "cookie";
import { COOKIE_NAME } from "@shared/const";
import type { User } from "../drizzle/schema";
import * as db from "./db";
import { createRateLimiter } from "./_core/rateLimit";
import { verifyFirstPartySession } from "./_core/session";
import {
  briefingFor,
  getCurrentModuleContext,
  getNalediPublicConfig,
  logNalediFailure,
  mintAnamSessionToken,
} from "./naledi";

const sessionTokenLimiter = createRateLimiter(10, 15 * 60 * 1000);

function sendError(res: Response, status: number, message: string, extra?: Record<string, unknown>) {
  res.status(status).json({ error: message, ...extra });
}

function clientSuppliedLearnerId(req: Request): boolean {
  const query = req.query as Record<string, unknown>;
  const body = (req.body ?? {}) as Record<string, unknown>;
  return (
    query.learnerId != null ||
    query.userId != null ||
    query.learner_id != null ||
    body.learnerId != null ||
    body.userId != null ||
    body.learner_id != null
  );
}

async function requireActiveSessionUser(req: Request): Promise<{ user: User } | { status: number; error: string }> {
  const cookies = parseCookieHeader(req.headers.cookie ?? "");
  const session = await verifyFirstPartySession(cookies[COOKIE_NAME]);
  if (!session) {
    return { status: 401, error: "Sign in required." };
  }
  const user = await db.getUserById(session.userId);
  if (!user) {
    return { status: 401, error: "Sign in required." };
  }
  try {
    await db.ensureActiveAccess(user.id);
  } catch {
    return { status: 403, error: "An active Maximed invitation is required." };
  }
  return { user };
}

function parsePositiveInt(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return undefined;
  return n;
}

export async function handleNalediConfig(req: Request, res: Response): Promise<void> {
  const auth = await requireActiveSessionUser(req);
  if ("error" in auth) {
    sendError(res, auth.status, auth.error);
    return;
  }
  res.status(200).json(getNalediPublicConfig());
}

export async function handleCurrentModule(req: Request, res: Response): Promise<void> {
  if (clientSuppliedLearnerId(req)) {
    sendError(res, 400, "Learner id is not accepted from the client.");
    return;
  }

  const auth = await requireActiveSessionUser(req);
  if ("error" in auth) {
    sendError(res, auth.status, auth.error);
    return;
  }

  const courseId = parsePositiveInt(req.query.courseId);
  if (!courseId) {
    sendError(res, 400, "courseId is required.");
    return;
  }
  const moduleId = parsePositiveInt(req.query.moduleId);

  try {
    const context = await getCurrentModuleContext(auth.user, courseId, moduleId);
    if (!context) {
      sendError(res, 404, "No published module context is available.");
      return;
    }
    res.status(200).json({
      learnerId: context.learnerId,
      moduleId: context.moduleId,
      moduleTitle: context.moduleTitle,
      content: context.content,
      contentVersion: context.contentVersion,
      instruction: context.instruction,
      briefing: briefingFor(context),
    });
  } catch (error) {
    logNalediFailure("context-fetch", {
      reason: error instanceof Error ? "domain-error" : "unknown",
    });
    sendError(res, 500, "Could not load module context.");
  }
}

export async function handleNalediSessionToken(req: Request, res: Response): Promise<void> {
  if (clientSuppliedLearnerId(req)) {
    sendError(res, 400, "Learner id is not accepted from the client.");
    return;
  }

  const auth = await requireActiveSessionUser(req);
  if ("error" in auth) {
    sendError(res, auth.status, auth.error);
    return;
  }

  if (!sessionTokenLimiter.allow(String(auth.user.id))) {
    sendError(res, 429, "Too many Naledi session requests. Wait a few minutes and try again.");
    return;
  }

  const minted = await mintAnamSessionToken();
  if (!minted.ok) {
    sendError(res, minted.status, minted.error, minted.fallback ? { fallback: minted.fallback } : undefined);
    return;
  }
  res.status(200).json({ sessionToken: minted.sessionToken });
}

export function registerNalediRoutes(app: Express) {
  const wrap = (
    handler: (req: Request, res: Response) => Promise<void>,
    event: "session-start" | "context-fetch"
  ) => {
    return (req: Request, res: Response) => {
      handler(req, res).catch((error) => {
        logNalediFailure(event, { reason: "unhandled-route" });
        void error;
        if (!res.headersSent) {
          sendError(res, 500, "Naledi is temporarily unavailable.");
        }
      });
    };
  };

  app.get("/api/naledi/config", wrap(handleNalediConfig, "context-fetch"));
  app.get("/api/training/modules/current", wrap(handleCurrentModule, "context-fetch"));
  app.get("/api/naledi/current-module", wrap(handleCurrentModule, "context-fetch"));
  app.post("/api/anam/session-token", wrap(handleNalediSessionToken, "session-start"));
  app.post("/api/naledi/session-token", wrap(handleNalediSessionToken, "session-start"));
}
