// Owner 2026-11-25: tells the page-view tracker which product this page shows (by product id, so the same
// product under /p/<key>, /ru/p/… and /kk/p/… counts as one in Admin ▸ Traffic ▸ Top products).
export function ProductViewMarker({ productId }: { productId: string }) {
  return <span hidden data-grmn-product={productId} />;
}
