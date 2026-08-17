import { NextResponse } from "next/server";
import { getBanners, saveBanner, deleteBanner } from "@/lib/cms/store";

export async function GET() {
  const banners = getBanners();
  return NextResponse.json({ banners });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.title) {
      return NextResponse.json(
        { error: "Banner title is required" },
        { status: 400 }
      );
    }
    const banner = saveBanner(body);
    return NextResponse.json({ success: true, banner });
  } catch (err) {
    console.error("Save banner error:", err);
    return NextResponse.json({ error: "Failed to save banner" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
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
