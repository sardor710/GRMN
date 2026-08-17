import { NextResponse } from "next/server";
import { getDiscounts, saveDiscount, deleteDiscount } from "@/lib/cms/store";

export async function GET() {
  const discounts = getDiscounts();
  return NextResponse.json({ discounts });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.code || body.value === undefined) {
      return NextResponse.json(
        { error: "Discount code and value are required" },
        { status: 400 }
      );
    }
    const discount = saveDiscount({
      ...body,
      value: Number(body.value),
      minSpend: body.minSpend ? Number(body.minSpend) : undefined,
      usageLimit: body.usageLimit ? Number(body.usageLimit) : undefined,
      perCustomerLimit: body.perCustomerLimit ? Number(body.perCustomerLimit) : 1,
    });
    return NextResponse.json({ success: true, discount });
  } catch (err) {
    console.error("Save discount error:", err);
    return NextResponse.json({ error: "Failed to save discount" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Discount ID is required" }, { status: 400 });
    }
    const success = deleteDiscount(id);
    return NextResponse.json({ success });
  } catch (err) {
    console.error("Delete discount error:", err);
    return NextResponse.json({ error: "Failed to delete discount" }, { status: 500 });
  }
}
