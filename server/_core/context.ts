import { COOKIE_NAME } from "@shared/const";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { parse as parseCookieHeader } from "cookie";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { verifyFirstPartySession } from "./session";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    const cookies = parseCookieHeader(opts.req.headers.cookie ?? "");
    const session = await verifyFirstPartySession(cookies[COOKIE_NAME]);
    if (session) {
      // Load the user fresh on each request so role/accessStatus changes bind
      // immediately (no per-request upsert, no Manus portal round-trip).
      user = (await db.getUserById(session.userId)) ?? null;
    }
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  return { req: opts.req, res: opts.res, user };
}
