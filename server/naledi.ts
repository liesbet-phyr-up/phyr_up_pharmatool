import { createHash } from "node:crypto";
import type { User } from "../drizzle/schema";
import * as db from "./db";
import { ENV } from "./_core/env";

/**
 * Maximed-owned Naledi bridge (MAXIMED-NALEDI-001).
 * Anam is a replaceable renderer/voice shell. Identity, module, content,
 * answers, scoring, completion, rewards, and audit stay in Maximed.
 * This file must not write completions or couple the schema to Anam.
 */

export const NALEDI_INSTRUCTION = {
  character: "Naledi",
  role: "experienced pharmacy-floor colleague",
  rules: [
    "Ask one question at a time.",
    "Do not diagnose a customer or the learner.",
    "Do not invent clinical or product claims.",
    "When unsure, or when the query needs a pharmacist, refer to the pharmacist.",
    "Teach only the approved training content in this payload.",
  ],
} as const;

export const POC_CONTENT_TITLE =
  "Pharmacy Staff Training: Vaginal Infections & The Power of pH.";

export type NalediAuthMode = "session-token" | "widget";

export type NalediPublicConfig = {
  enabled: false;
} | {
  enabled: true;
  authMode: NalediAuthMode;
  personaId: string;
};

export type CurrentModuleContext = {
  learnerId: string;
  moduleId: number;
  moduleTitle: string;
  content: {
    text: string;
    moduleType: string;
    courseId: number;
    courseTitle: string;
  };
  contentVersion: string;
  instruction: typeof NALEDI_INSTRUCTION;
};

type WorkspaceModule = {
  id: number;
  title: string;
  moduleType: string;
  body: string | null;
  position: number;
  isRequired: number;
  completedAt: Date | null;
};

export function isNalediFlagOn(): boolean {
  const raw = (ENV.nalediEnabled ?? "").toString().trim().toLowerCase();
  return raw === "true" || raw === "1";
}

export function getNalediPublicConfig(): NalediPublicConfig {
  const personaId = (ENV.anamPersonaId ?? "").trim();
  if (!isNalediFlagOn() || !personaId) {
    return { enabled: false };
  }
  const hasKey = Boolean((ENV.anamApiKey ?? "").trim());
  return {
    enabled: true,
    authMode: hasKey ? "session-token" : "widget",
    personaId,
  };
}

export function learnerSafeId(userId: number): string {
  return createHash("sha256")
    .update(`maximed-learner:${userId}`)
    .digest("hex")
    .slice(0, 16);
}

export function contentVersionFor(module: {
  id: number;
  updatedAt?: Date | null;
  body?: string | null;
  title?: string | null;
}): string {
  const updated = module.updatedAt instanceof Date ? module.updatedAt.toISOString() : "";
  return createHash("sha256")
    .update(`${module.id}|${updated}|${module.title ?? ""}|${module.body ?? ""}`)
    .digest("hex")
    .slice(0, 16);
}

export function pickCurrentModule<T extends { id: number; position: number; completedAt: Date | null }>(
  modules: T[],
  requestedModuleId?: number
): T | null {
  if (!modules.length) return null;
  const ordered = [...modules].sort((a, b) => a.position - b.position || a.id - b.id);
  if (requestedModuleId && Number.isInteger(requestedModuleId) && requestedModuleId > 0) {
    const requested = ordered.find((module) => module.id === requestedModuleId);
    if (requested) return requested;
  }
  return ordered.find((module) => !module.completedAt) ?? ordered[0] ?? null;
}

export function briefingFor(context: CurrentModuleContext): string {
  const rules = context.instruction.rules.map((rule) => `- ${rule}`).join("\n");
  return [
    `You are ${context.instruction.character}, ${context.instruction.role} at Maximed.`,
    "You are a teaching aid. Maximed owns this content. Do not treat Anam as source of truth.",
    "Rules:",
    rules,
    `Module: ${context.moduleTitle} (contentVersion ${context.contentVersion}).`,
    `Course: ${context.content.courseTitle}.`,
    "Approved training text:",
    context.content.text.trim() || "(No approved body text is on this module yet. Do not invent content. Stick to the title and refer the learner to the written course steps.)",
  ].join("\n");
}

export function logNalediFailure(
  event: "session-start" | "context-fetch",
  detail: { reason: string; status?: number }
): void {
  const status = detail.status ? ` status=${detail.status}` : "";
  console.error(`[Naledi] ${event} failed reason=${detail.reason}${status}`);
}

export async function getCurrentModuleContext(
  user: User,
  courseId: number,
  requestedModuleId?: number
): Promise<CurrentModuleContext | null> {
  await db.ensureActiveAccess(user.id);
  const workspace = await db.getCourseWorkspace(courseId, user.id);
  if (!workspace || workspace.course.status !== "published") return null;

  const chosen = pickCurrentModule(workspace.modules as WorkspaceModule[], requestedModuleId);
  if (!chosen) return null;

  const full = workspace.modules.find((module) => module.id === chosen.id);
  if (!full) return null;

  return {
    learnerId: learnerSafeId(user.id),
    moduleId: full.id,
    moduleTitle: full.title,
    content: {
      text: full.body ?? "",
      moduleType: full.moduleType,
      courseId: workspace.course.id,
      courseTitle: workspace.course.title,
    },
    contentVersion: contentVersionFor({
      id: full.id,
      updatedAt: workspace.course.updatedAt,
      body: full.body,
      title: full.title,
    }),
    instruction: NALEDI_INSTRUCTION,
  };
}

export type AnamSessionMintResult =
  | { ok: true; sessionToken: string }
  | { ok: false; status: number; fallback?: "widget"; error: string };

export async function mintAnamSessionToken(): Promise<AnamSessionMintResult> {
  const config = getNalediPublicConfig();
  if (!config.enabled) {
    return { ok: false, status: 404, error: "Naledi is not available." };
  }

  const apiKey = (ENV.anamApiKey ?? "").trim();
  if (!apiKey) {
    return {
      ok: false,
      status: 503,
      fallback: "widget",
      error: "Session token minting is not configured. Widget fallback may be used.",
    };
  }

  let response: Response;
  try {
    response = await fetch("https://api.anam.ai/v1/auth/session-token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        personaConfig: { personaId: config.personaId },
      }),
    });
  } catch {
    logNalediFailure("session-start", { reason: "anam-unreachable" });
    return { ok: false, status: 502, error: "Naledi is temporarily unavailable." };
  }

  if (!response.ok) {
    logNalediFailure("session-start", { reason: "anam-rejected", status: response.status });
    return { ok: false, status: 502, error: "Naledi is temporarily unavailable." };
  }

  let payload: { sessionToken?: unknown };
  try {
    payload = (await response.json()) as { sessionToken?: unknown };
  } catch {
    logNalediFailure("session-start", { reason: "anam-invalid-json" });
    return { ok: false, status: 502, error: "Naledi is temporarily unavailable." };
  }

  if (typeof payload.sessionToken !== "string" || !payload.sessionToken) {
    logNalediFailure("session-start", { reason: "anam-missing-token" });
    return { ok: false, status: 502, error: "Naledi is temporarily unavailable." };
  }

  return { ok: true, sessionToken: payload.sessionToken };
}
