import { NextResponse } from "next/server";
import { getBlogs, saveBlog, deleteBlog } from "@/lib/cms/store";

export async function GET() {
  const blogs = getBlogs();
  return NextResponse.json({ blogs });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.title || !body.content) {
      return NextResponse.json(
        { error: "Blog title and content are required" },
        { status: 400 }
      );
    }
    const blog = saveBlog(body);
    return NextResponse.json({ success: true, blog });
  } catch (err) {
    console.error("Save blog error:", err);
    return NextResponse.json({ error: "Failed to save blog" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Blog ID is required" }, { status: 400 });
    }
    const success = deleteBlog(id);
    return NextResponse.json({ success });
  } catch (err) {
    console.error("Delete blog error:", err);
    return NextResponse.json({ error: "Failed to delete blog" }, { status: 500 });
  }
}
