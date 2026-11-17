import { NextResponse } from "next/server";
import { getBanners, saveBanner, deleteBanner } from "@/lib/cms/store";
import { getCurrentAdmin } from "@/lib/cms/auth";
import { sanitizeBannerInput } from "@/lib/cms/content-input";
import type { Banner } from "@/lib/cms/types";

const unauthorized = () => NextResponse.json({ error: "Not signed in" }, { status: 401 });

export async function GET() {
  const banners = getBanners();
  return NextResponse.json({ banners });
}

export async function POST(request: Request) {
  if (!(await getCurrentAdmin())) return unauthorized();
  try {
    const raw = (await request.json()) as Partial<Banner>;
    if (!raw || typeof raw !== "object" || !raw.title) {
      return NextResponse.json(
        { error: "Banner title is required" },
        { status: 400 }
      );
    }
    // Field limits and ru/kk translations merged per locale with the stored banner.
    const existing = typeof raw.id === "string" ? getBanners().find((b) => b.id === raw.id) : undefined;
    const checked = sanitizeBannerInput(raw, existing);
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
    const banner = saveBanner({ ...checked.banner, title: raw.title });
    return NextResponse.json({ success: true, banner });
  } catch (err) {
    console.error("Save banner error:", err);
    return NextResponse.json({ error: "Failed to save banner" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!(await getCurrentAdmin())) return unauthorized();
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Banner ID is required" }, { status: 400 });
    }
    const success = deleteBanner(id);
    return NextResponse.json({ success });
  } catch (err) {
    console.error("Delete banner error:", err);
    return NextResponse.json({ error: "Failed to delete banner" }, { status: 500 });
  }
}
