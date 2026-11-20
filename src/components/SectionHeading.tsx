/** Garmin section heading: Oswald 400, .8px tracking, authored case. size "h1" = 40/50 (32/40 below 1024), "h2" = 32/40. */
export function SectionHeading({ children, size = "h2" }: { children: React.ReactNode; size?: "h1" | "h2" }) {
  return <h2 className={`g-heading ${size === "h1" ? "g-h1" : "g-h2"} m-0 text-center text-black`}>{children}</h2>;
}
