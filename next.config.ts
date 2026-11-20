import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  /* config options here */
  output: "standalone",
  // Visual QA only: NEXT_DEV_INDICATORS=0 hides the dev-mode "N" badge so diff captures are clean. No effect on builds.
  ...(process.env.NEXT_DEV_INDICATORS === "0" ? { devIndicators: false as const } : {}),
};

export default withNextIntl(nextConfig);
