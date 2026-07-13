import Image from "next/image";

/**
 * Section 1 — Hero KV. Layered composition:
 * base kv-bg.jpg · clouds (cloud.jpg) · mountains (kv-mountain.png) ·
 * title slogan (product-name.png) · 3-watch lineup (marq-collection.png).
 */
export function MarqHero() {
  return (
    <section
      id="introduction"
      className="relative h-[848px] w-full overflow-hidden bg-black bg-cover bg-center"
      style={{ backgroundImage: "url(/marq/images/kv-bg.jpg)" }}
    >
      {/* clouds */}
      <div
        className="absolute inset-x-0 top-0 z-[1] h-[600px] bg-cover bg-center"
        style={{ backgroundImage: "url(/marq/images/cloud.jpg)" }}
      />
      {/* mountains */}
      <div
        className="absolute inset-x-0 top-[25%] z-[5] h-[900px] bg-cover bg-center"
        style={{ backgroundImage: "url(/marq/images/kv-mountain.png)" }}
      />
      {/* gradient fade to black at bottom */}
      <div className="absolute inset-x-0 bottom-0 z-[8] h-[240px] bg-gradient-to-b from-transparent to-black" />

      {/* title slogan */}
      <div className="absolute inset-x-0 top-[7%] z-[20] flex justify-center px-4">
        <Image
          src="/marq/images/product-name.png"
          alt="MARQ Collection — The Second Generation. Fused Carbon Fiber | Damascus Steel | Grade-5 Titanium"
          width={1148}
          height={600}
          priority
          className="h-auto w-[500px] max-w-[80%]"
        />
      </div>

      {/* 3-watch lineup */}
      <div className="absolute bottom-0 left-1/2 z-[15] w-[61%] max-w-[1160px] -translate-x-1/2">
        <Image
          src="/marq/images/marq-collection.png"
          alt="MARQ Collection watch lineup"
          width={1600}
          height={542}
          priority
          className="h-auto w-full"
        />
      </div>
    </section>
  );
}
