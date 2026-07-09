export function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="g-heading text-center text-[26px] tracking-[0.04em] text-black">
      {children}
    </h2>
  );
}
