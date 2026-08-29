import "dotenv/config";
import express from "express";
import { createServer } from "http";
import path from "path";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { migrate } from "drizzle-orm/mysql2/migrator";
import * as db from "../db";
import { appRouter } from "../routers";
import { registerAuthRoutes } from "./auth";
import { createContext } from "./context";
import { ENV } from "./env";
import { registerStorageProxy } from "./storageProxy";
import { serveStatic, setupVite } from "./vite";

// Fail-closed boot (Javin, 29 Aug): refuse to listen without a session secret
// or a database URL. Runs at module load, after dotenv/config has populated
// process.env.
for (const name of ["JWT_SECRET", "DATABASE_URL"]) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    console.error(`[Boot] Refusing to start: ${name} is not set.`);
    process.exit(1);
  }
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Railway (and any reverse proxy) sets X-Forwarded-*. Required so
  // getSessionCookieOptions() can see HTTPS via x-forwarded-proto.
  app.set("trust proxy", 1);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Liveness only (no DB). Railway healthcheckPath. Not a readiness probe.
  app.get("/health", (_req, res) => {
    res.status(200).json({ ok: true });
  });

  registerStorageProxy(app);
  // First-party auth (OTP login + invite redemption). The Manus OAuth callback
  // route is no longer registered: it cannot work off-platform and the
  // OWNER_OPEN_ID admin path is gone.
  registerAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Apply committed migrations before serving traffic. Fails closed: a missing
  // database or a migration error prevents listen.
  const database = await db.getDb();
  if (!database) {
    console.error("[Boot] Database unavailable: cannot apply migrations.");
    process.exit(1);
  }
  await migrate(database, {
    migrationsFolder: path.join(process.cwd(), "drizzle"),
  });
  console.log("[Boot] Migrations applied.");

  if (ENV.bootstrapAdminEmail) {
    const created = await db.bootstrapAdmin(ENV.bootstrapAdminEmail);
    console.log(
      created
        ? "[Boot] Bootstrap admin activated."
        : "[Boot] Admin already exists; bootstrap skipped."
    );
  } else {
    console.warn("[Boot] BOOTSTRAP_ADMIN_EMAIL not set; bootstrap admin skipped.");
  }

  const rawPort = process.env.PORT;
  const port = rawPort ? Number(rawPort) : 3000;
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid PORT: ${rawPort}`);
  }

  server.listen(port, "0.0.0.0", () => {
    console.log(`Server listening on 0.0.0.0:${port}`);
  });
}

startServer().catch((error) => {
  console.error("[Boot] Failed to start", error);
  process.exit(1);
});
