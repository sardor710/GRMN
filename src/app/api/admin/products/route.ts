import { NextResponse } from "next/server";
import { getProducts, saveProduct, deleteProduct } from "@/lib/cms/store";
import { getCurrentAdmin } from "@/lib/cms/auth";
import { findSkuConflicts } from "@/lib/cms/product-variants";
import { sanitizeProductInput } from "@/lib/cms/product-input";
import type { ProductVariant } from "@/lib/cms/types";

const unauthorized = () => NextResponse.json({ error: "Not signed in" }, { status: 401 });

function normalizeVariants(variants: unknown): ProductVariant[] | undefined {
  if (!Array.isArray(variants)) return undefined;
  return (variants as ProductVariant[]).map((v) => ({
    ...v,
    sku: String(v.sku || "").trim(),
    price: Number(v.price) || 0,
    originalPrice: v.originalPrice ? Number(v.originalPrice) : undefined,
    stock: Number(v.stock) || 0,
    imageIds: Array.isArray(v.imageIds) ? v.imageIds : [],
  }));
}

export async function GET() {
  if (!(await getCurrentAdmin())) return unauthorized();
  const products = getProducts();
  return NextResponse.json({ products });
}

export async function POST(request: Request) {
  if (!(await getCurrentAdmin())) return unauthorized();
  try {
    const raw = await request.json();
    if (!raw || typeof raw !== "object" || !raw.name || raw.price === undefined) {
      return NextResponse.json(
        { error: "Product name and price are required" },
        { status: 400 }
      );
    }
    // Always-string sanitized overview, allowlisted image/swatch URLs, hex swatch colors, field limits,
    // and ru/kk translations merged per locale with the stored product (the other locale is preserved).
    const existing = typeof raw.id === "string" ? getProducts().find((p) => p.id === raw.id) : undefined;
    const checked = sanitizeProductInput(raw as Record<string, unknown>, existing);
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
    const body = checked.product as typeof raw;
    const variants = normalizeVariants(body.variants);
    if (variants?.some((v) => !v.sku)) {
      return NextResponse.json({ error: "Every variant needs a SKU" }, { status: 400 });
    }
    const conflicts = findSkuConflicts({ id: body.id, sku: body.sku, variants }, getProducts());
    if (conflicts.length) {
      return NextResponse.json(
        { error: `SKU already in use: ${conflicts.join(", ")}`, conflicts },
        { status: 409 }
      );
    }
    const product = saveProduct({
      ...body,
      ...(variants ? { variants } : {}),
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
  if (!(await getCurrentAdmin())) return unauthorized();
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
