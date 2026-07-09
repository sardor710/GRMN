// Black cog/starburst seal used on featured cards (NEW / SALE).
function starburstPath(points: number, outer: number, inner: number, cx = 50, cy = 50) {
  const step = Math.PI / points;
  let d = "";
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = i * step - Math.PI / 2;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    d += `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)} `;
  }
  return d + "Z";
}

export function StarburstBadge({ label, className }: { label: string; className?: string }) {
  return (
    <div className={`relative grid place-items-center ${className ?? ""}`}>
      <svg viewBox="0 0 100 100" className="h-full w-full drop-shadow-sm">
        <path d={starburstPath(14, 50, 43)} fill="#000" />
      </svg>
      <span className="g-heading absolute text-[13px] tracking-[0.06em] text-white">
        {label}
      </span>
    </div>
  );
}
