import { NextResponse } from "next/server";
import { getOrders } from "@/lib/cms/store";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email");

    const allOrders = getOrders();
    const orders = email
      ? allOrders.filter((o) => o.clientEmail.toLowerCase() === email.toLowerCase())
      : allOrders;

    return NextResponse.json({ orders });
  } catch (err) {
    console.error("Account orders API error:", err);
    return NextResponse.json({ error: "Failed to fetch orders" }, { status: 500 });
  }
}
