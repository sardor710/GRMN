import { NextResponse } from "next/server";
import { getSettings, saveSettings } from "@/lib/cms/store";

export async function GET() {
  const settings = getSettings();
  return NextResponse.json({ settings });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const settings = saveSettings(body);
    return NextResponse.json({ success: true, settings });
  } catch (err) {
    console.error("Save settings error:", err);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
