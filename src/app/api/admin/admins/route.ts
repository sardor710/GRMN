import { NextResponse } from "next/server";
import { getAdmins, saveAdmin, deleteAdmin } from "@/lib/cms/store";

export async function GET() {
  const admins = getAdmins().map((admin) => {
    const safe = { ...admin };
    delete safe.password;
    return safe;
  });
  return NextResponse.json({ admins });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.name || !body.email) {
      return NextResponse.json(
        { error: "Admin name and email are required" },
        { status: 400 }
      );
    }
    const admin = saveAdmin(body);
    const safeAdmin = { ...admin };
    delete safeAdmin.password;
    return NextResponse.json({ success: true, admin: safeAdmin });
  } catch (err) {
    console.error("Save admin error:", err);
    return NextResponse.json({ error: "Failed to save admin" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Admin ID is required" }, { status: 400 });
    }
    const success = deleteAdmin(id);
    return NextResponse.json({ success });
  } catch (err) {
    console.error("Delete admin error:", err);
    return NextResponse.json({ error: "Failed to delete admin" }, { status: 500 });
  }
}
