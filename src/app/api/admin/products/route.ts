import { NextResponse } from "next/server";
import { getProducts, saveProduct, deleteProduct } from "@/lib/cms/store";

export async function GET() {
  const products = getProducts();
  return NextResponse.json({ products });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.name || body.price === undefined) {
      return NextResponse.json(
        { error: "Product name and price are required" },
        { status: 400 }
      );
    }
    const product = saveProduct({
      ...body,
      price: Number(body.price),
      originalPrice: body.originalPrice ? Number(body.originalPrice) : undefined,
      stock: body.stock !== undefined ? Number(body.stock) : 50,
    });
    return NextResponse.json({ success: true, product });
  } catch (err) {
    console.error("Save product error:", err);
    return NextResponse.json({ error: "Failed to save product" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Product ID is required" }, { status: 400 });
    }
    const success = deleteProduct(id);
    return NextResponse.json({ success });
  } catch (err) {
    console.error("Delete product error:", err);
    return NextResponse.json({ error: "Failed to delete product" }, { status: 500 });
  }
}
