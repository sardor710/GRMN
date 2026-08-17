import { NextResponse } from "next/server";
import { getAdminByEmail, logActivity } from "@/lib/cms/store";
import { createSessionToken, ADMIN_COOKIE_NAME } from "@/lib/cms/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const admin = getAdminByEmail(email);

    if (!admin) {
      return NextResponse.json(
        { error: "Invalid email or credentials" },
        { status: 401 }
      );
    }

    if (admin.status === "inactive") {
      return NextResponse.json(
        { error: "This administrator account has been deactivated" },
        { status: 403 }
      );
    }

    // Check password (supports default admin123 or stored password)
    if (admin.password && admin.password !== password) {
      return NextResponse.json(
        { error: "Invalid password" },
        { status: 401 }
      );
    }

    // Update last login
    admin.lastLogin = new Date().toISOString();
    logActivity(admin.name, "Admin logged into CMS", "Admin Portal");

    const token = createSessionToken(admin);

    const response = NextResponse.json({
      success: true,
      user: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        avatar: admin.avatar,
      },
    });

    response.cookies.set(ADMIN_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return response;
  } catch (err) {
    console.error("Login API error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
