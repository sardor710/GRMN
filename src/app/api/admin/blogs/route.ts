import { NextResponse } from "next/server";
import { getBlogs, saveBlog, deleteBlog } from "@/lib/cms/store";
import { getCurrentAdmin } from "@/lib/cms/auth";
import { sanitizeBlogInput } from "@/lib/cms/content-input";
import type { CMSBlog } from "@/lib/cms/types";

const unauthorized = () => NextResponse.json({ error: "Not signed in" }, { status: 401 });

export async function GET() {
  const blogs = getBlogs();
  return NextResponse.json({ blogs });
}

export async function POST(request: Request) {
  if (!(await getCurrentAdmin())) return unauthorized();
  try {
    const raw = (await request.json()) as Partial<CMSBlog>;
    if (!raw || typeof raw !== "object") {
      return NextResponse.json({ error: "Blog title and content are required" }, { status: 400 });
    }
    // Field limits, sanitized content (base and ru/kk), translations merged per locale with the stored blog.
    const existing = typeof raw.id === "string" ? getBlogs().find((b) => b.id === raw.id) : undefined;
    const checked = sanitizeBlogInput(raw, existing);
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
    const body = checked.blog;
    if (!body.title || !body.content) {
      return NextResponse.json(
        { error: "Blog title and content are required" },
        { status: 400 }
      );
    }
    const blog = saveBlog({ ...body, title: body.title, content: body.content });
    return NextResponse.json({ success: true, blog });
  } catch (err) {
    console.error("Save blog error:", err);
    return NextResponse.json({ error: "Failed to save blog" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!(await getCurrentAdmin())) return unauthorized();
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
