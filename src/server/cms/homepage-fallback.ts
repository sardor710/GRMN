import "server-only";
import type { HomepageConfig } from "../../lib/cms/types";

/**
 * Owner 2026-11-19: the homepage never crashes. A missing (unpublished) homepage or a read failure
 * falls back to the built-in template; a failed merchandising-collection lookup keeps the published
 * config unresolved. Each fallback is logged so the cause stays visible to operators.
 */
export async function homepageWithFallback(input: {
  read: () => Promise<HomepageConfig | undefined>;
  resolve?: (config: HomepageConfig) => Promise<HomepageConfig>;
  template: () => HomepageConfig;
  log?: (message: string) => void;
}): Promise<HomepageConfig> {
  const log = input.log ?? (message => console.error(message));
  let config: HomepageConfig | undefined;
  try { config = await input.read(); }
  catch (error) { log(`Homepage read failed; showing the default template: ${error instanceof Error ? error.message : String(error)}`); return input.template(); }
  if (!config) { log("No published homepage; showing the default template (publish the homepage in Admin → Homepage)"); return input.template(); }
  if (!input.resolve) return config;
  try { return await input.resolve(config); }
  catch (error) { log(`Homepage collections could not be resolved; showing them unresolved: ${error instanceof Error ? error.message : String(error)}`); return config; }
}
