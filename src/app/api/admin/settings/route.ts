import { NextResponse } from "next/server";
import { getSettings, saveSettings } from "@/lib/cms/store";
import { getCurrentAdmin } from "@/lib/cms/auth";
import { sanitizeSettingsInput } from "@/lib/cms/content-input";
import type { StoreSettings } from "@/lib/cms/types";

export async function GET() {
  const settings = getSettings();
  return NextResponse.json({ settings });
}

export async function POST(request: Request) {
  if (!(await getCurrentAdmin())) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    const raw = (await request.json()) as Partial<StoreSettings>;
    if (!raw || typeof raw !== "object") {
      return NextResponse.json({ error: "Settings must be an object" }, { status: 400 });
    }
    // Field limits and ru/kk SEO translations merged per locale with the stored settings.
    const checked = sanitizeSettingsInput(raw, getSettings());
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
    const settings = saveSettings(checked.settings);
    return NextResponse.json({ success: true, settings });
  } catch (err) {
    console.error("Save settings error:", err);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
