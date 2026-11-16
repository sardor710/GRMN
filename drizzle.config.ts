import { defineConfig } from "drizzle-kit";
import { readMigrationDatabaseUrl } from "./src/server/config/env.ts";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema/*.ts",
  out: "./drizzle",
  dbCredentials: { url: readMigrationDatabaseUrl(process.env) },
  strict: true,
  verbose: false,
});
