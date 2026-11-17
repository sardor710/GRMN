import { NextResponse } from "next/server";
import { getHomepageConfig, saveHomepageConfig } from "@/lib/cms/store";
import {
  IMAGE_DIMENSION_SPECS,
  validateHomepageConfig,
  createDefaultHomepageConfig
} from "@/lib/cms/homepage-schema";

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
  try {
    const body = await request.json();
    const config = body.config || body;

    const validation = validateHomepageConfig(config);
    if (!validation.isValid) {
      return NextResponse.json(
        { error: "Invalid homepage configuration", details: validation.errors },
        { status: 400 }
      );
    }

    const saved = saveHomepageConfig(config);
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
  try {
    const body = await request.json().catch(() => ({}));
    if (body.action === "reset") {
      const defaultConfig = createDefaultHomepageConfig();
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
