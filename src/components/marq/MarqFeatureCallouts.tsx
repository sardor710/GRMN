/** Section 10 — two short feature callouts (Sapphire crystal · AMOLED). */
export function MarqFeatureCallouts() {
  const callouts = [
    { title: "DOMED SAPPHIRE CRYSTAL LENS", subtitle: "Premium Scratch Resistance" },
    { title: "AMOLED", subtitle: "Stunning display" },
  ];
  return (
    <section className="flex w-full items-center justify-center gap-16 bg-black py-20 md:gap-28">
      {callouts.map((c) => (
        <div key={c.title} className="text-center">
          <h3 className="marq-display text-[18px] tracking-[0.02em] md:text-[24px]">{c.title}</h3>
          <span className="mx-auto mt-3 block h-px w-[40px] bg-white/50" />
          <p className="mt-3 text-[14px] font-light text-white/80 md:text-[16px]">{c.subtitle}</p>
        </div>
      ))}
    </section>
  );
}
