import { NextResponse } from "next/server";
import { getOrders, saveOrder } from "@/lib/cms/store";

export async function GET() {
  const orders = getOrders();
  return NextResponse.json({ orders });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.clientName || body.total === undefined) {
      return NextResponse.json(
        { error: "Client name and total amount are required" },
        { status: 400 }
      );
    }
    const order = saveOrder(body);
    return NextResponse.json({ success: true, order });
  } catch (err) {
    console.error("Save order error:", err);
    return NextResponse.json({ error: "Failed to save order" }, { status: 500 });
  }
}
