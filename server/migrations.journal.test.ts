import path from "node:path";
import { describe, expect, it } from "vitest";
import { readMigrationFiles } from "drizzle-orm/migrator";

// Exercises the exact code path that runs at boot: drizzle's mysql2 migrator
// requires drizzle/meta/_journal.json and one .sql file per journal entry.
// This is the second crash that would have hit Railway after the dirname fix.
describe("migration journal", () => {
  it("parses the committed journal and all three SQL files", () => {
    const migrationsFolder = path.join(process.cwd(), "drizzle");
    const migrations = readMigrationFiles({ migrationsFolder });

    expect(migrations).toHaveLength(3);
    expect(migrations.map((migration) => migration.folderMillis)).toEqual([
      1756000000000, 1756000000001, 1756000000002,
    ]);

    for (const migration of migrations) {
      expect(migration.sql.length).toBeGreaterThan(0);
      expect(migration.sql.every((statement) => typeof statement === "string")).toBe(true);
      expect(migration.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(migration.bps).toBe(true);
    }
  });
});
