import { NextResponse } from "next/server";
import { getHomepageConfig, saveHomepageConfig } from "@/lib/cms/store";
import { getCurrentAdmin } from "@/lib/cms/auth";
import { sanitizeHomepageInput } from "@/lib/cms/content-input";
import {
  IMAGE_DIMENSION_SPECS,
  createDefaultHomepageConfig
} from "@/lib/cms/homepage-schema";

const unauthorized = () => NextResponse.json({ error: "Not signed in" }, { status: 401 });

export async function GET() {
  try {
    const config = getHomepageConfig();
    return NextResponse.json({
      config,
      dimensionSpecs: IMAGE_DIMENSION_SPECS
    });
  } catch (err) {
    console.error("Error loading homepage config:", err);
    return NextResponse.json(
      { error: "Failed to load homepage configuration" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  if (!(await getCurrentAdmin())) return unauthorized();
  try {
    const body = await request.json();
    const config = body.config || body;

    // Structure check, field limits, and the root `translations` overlay merged per locale with the
    // stored config (a body without `translations` keeps the stored overlay).
    const checked = sanitizeHomepageInput(config, getHomepageConfig());
    if (!checked.ok) {
      return NextResponse.json(
        { error: checked.error, details: checked.details ?? [checked.error] },
        { status: 400 }
      );
    }

    const saved = saveHomepageConfig(checked.config);
    return NextResponse.json({
      success: true,
      config: saved
    });
  } catch (err) {
    console.error("Error saving homepage config:", err);
    return NextResponse.json(
      { error: "Failed to save homepage configuration" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  if (!(await getCurrentAdmin())) return unauthorized();
  try {
    const body = await request.json().catch(() => ({}));
    if (body.action === "reset") {
      // Reset restores the English blocks; ru/kk overlays are keyed by block id and kept.
      const { translations } = getHomepageConfig();
      const defaultConfig = { ...createDefaultHomepageConfig(), ...(translations ? { translations } : {}) };
      const saved = saveHomepageConfig(defaultConfig);
      return NextResponse.json({
        success: true,
        message: "Homepage reset to default configuration",
        config: saved
      });
    }

    return NextResponse.json(
      { error: "Unknown action. Supported: reset" },
      { status: 400 }
    );
  } catch (err) {
    console.error("Error resetting homepage config:", err);
    return NextResponse.json(
      { error: "Failed to reset homepage configuration" },
      { status: 500 }
    );
  }
}
