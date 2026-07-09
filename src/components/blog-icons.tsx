import type { SVGProps } from "react";

const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  viewBox: "0 0 24 24",
};

export function CarIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...p}>
      <path d="M3 13l2-5.5A2 2 0 0 1 6.9 6h10.2a2 2 0 0 1 1.9 1.5L21 13v5a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H6v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
      <circle cx="7.5" cy="16" r="1" /><circle cx="16.5" cy="16" r="1" /><path d="M4 13h16" />
    </svg>
  );
}
export function PlaneIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...p}>
      <path d="M21 15.5l-8-2.5V6a1.5 1.5 0 0 0-3 0v7l-8 2.5V17l8-1v3.5l-2 1.5V22l3.5-1 3.5 1v-1l-2-1.5V16l8 1z" />
    </svg>
  );
}
export function RunIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...p}>
      <circle cx="15" cy="5" r="1.6" />
      <path d="M13 8l-3 2 1 4-3 4M11 12l3 1 1 4M10 10l-3 1-1 3" />
    </svg>
  );
}
export function FishIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...p}>
      <path d="M3 12c3-4 8-5 12-4 2 .5 4 2 6 4-2 2-4 3.5-6 4-4 1-9 0-12-4z" />
      <path d="M17 10.5v3M6 12l-2-2m-0 4l2-2" /><circle cx="15" cy="10.8" r=".5" fill="currentColor" />
    </svg>
  );
}
export function BoatIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...p}>
      <path d="M4 15h16l-2 4a2 2 0 0 1-1.8 1H7.8A2 2 0 0 1 6 19z" />
      <path d="M12 13V4l6 9M12 6L6 13" />
    </svg>
  );
}
export function MountainIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...p}>
      <path d="M3 19l6-11 4 7 2-3 6 7z" />
    </svg>
  );
}
export function HeartPulseIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...p}>
      <path d="M12 20s-7-4.5-9-9a4.5 4.5 0 0 1 8-3 4.5 4.5 0 0 1 8 3 9 9 0 0 1-1.2 2.5" />
      <path d="M9 12h2l1.5-3 1.5 5 1-2h3" />
    </svg>
  );
}
export function AlertIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...p}>
      <path d="M10.3 4.3L2.5 18a1.5 1.5 0 0 0 1.3 2.3h16.4A1.5 1.5 0 0 0 21.5 18L13.7 4.3a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4" /><circle cx="12" cy="16.5" r=".5" fill="currentColor" />
    </svg>
  );
}

export const categoryIcons: Record<string, (p: SVGProps<SVGSVGElement>) => React.ReactElement> = {
  automotive: CarIcon,
  aviation: PlaneIcon,
  fitness: RunIcon,
  "fish-and-hunt": FishIcon,
  marine: BoatIcon,
  outdoor: MountainIcon,
  health: HeartPulseIcon,
  "saved-by-garmin": AlertIcon,
};
