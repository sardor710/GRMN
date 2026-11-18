export function syntheticCMS() {
  return {
    products: [{ id: "p1", sku: "SYN-1", name: "Қазақша fēnix®", price: "1234.56", originalPrice: "1500", stock: 2, status: "active", createdAt: "2026-01-01T00:00:00Z", specs: [], features: [], inTheBox: [], seoTitle: "Synthetic SEO" }],
    clients: [{ id: "c1", name: "Synthetic customer", email: "SYNTHETIC@example.invalid", phone: "+77000000001", status: "active", createdAt: "2026-01-01T00:00:00Z" }],
    orders: [{ id: "o1", orderNumber: "OLD-9000007", clientName: "Synthetic customer", total: "2469.12", items: [{ productId: "p1", name: "Қазақша fēnix®", quantity: 2, price: "1234.56" }], paymentStatus: "paid", fulfillmentStatus: "delivered", createdAt: "2026-01-02T00:00:00Z", shippingAddress: { city: "Synthetic city" } }],
    blogs: [{ id: "b1", slug: "synthetic-blog", title: "Synthetic article", content: "<p>Synthetic body</p>", status: "published", createdAt: "2026-01-01T00:00:00Z" }],
    banners: [{ id: "bn1", title: "Synthetic banner", image: "/images/synthetic.svg", active: true }],
    discounts: [{ id: "d1", code: "SYNTHETIC", type: "percentage", value: 10, usageCount: 3, usageLimit: 10, applyType: "all", status: "active" }],
    activities: [{ id: "a1", adminName: "Synthetic staff", action: "edited", target: "Synthetic product", timestamp: "2026-01-01T00:00:00Z" }],
    admins: [{ id: "staff1", name: "Synthetic staff", password: "NEVER-STAGE-THIS", role: "superadmin" }],
    settings: { storeName: "Synthetic store" },
  };
}

export function sourceOptions(cms = syntheticCMS(), extra = {}) {
  return {
    namespace: "synthetic-task-06", classification: "synthetic", cmsMoney: "KZT-major",
    sources: [{ path: "src/lib/cms/data.json", contents: JSON.stringify(cms) }],
    assets: [{ path: "public/images/synthetic.svg", sha256: "a".repeat(64), bytes: 10 }],
    ...extra,
  };
}
