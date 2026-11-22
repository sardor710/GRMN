import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "FusionCMS/**",
    "temp/**", // Private generated fixtures, browser profiles and receipts.
    ".claude/**", // Agent tooling: local skills (third-party assets) and temporary agent worktrees.
    "storage/**", // Local dev database and uploads.
  ]),
]);

export default eslintConfig;
