import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { ProductCard } from "@/components/ProductCard";
import { products } from "@/lib/products";

export const metadata: Metadata = {
  title: "Garmin Pay™ | A Contactless Payment Solution",
  description:
    "No wallet? No phone? No problem. Make contactless payments on the go with your compatible Garmin smartwatch or bike computer.",
};

const iconStrip = [
  {
    Icon: CardIcon,
    text: "Garmin Pay works with multiple major card networks, including Visa®, Discover® and Mastercard®.",
  },
  {
    Icon: SwapIcon,
    text: "We protect your information by swapping your real card number with a virtual number.",
  },
  {
    Icon: TapIcon,
    text: "Just enter your passcode and tap your device to pay in seconds.",
  },
  {
    Icon: WaveIcon,
    text: "You can use Garmin Pay wherever contactless payments are accepted, including on select transit systems.",
  },
];

const details = [
  {
    title: "QUICK AND SIMPLE",
    body: "After adding your cards to the Garmin Wallet™ payment holder in the Garmin Connect™ app, you can pay on the go in seconds. Just enter your passcode on your smartwatch or bike computer, select a card, and hold it near the contactless reader.",
  },
  {
    title: "WIDE ACCEPTANCE",
    body: "Whether you want a beverage after your run or a bite to eat mid-ride, use Garmin Pay wherever contactless payments are accepted and with select major transit systems. Check our list of compatible issuers and cards — more are added all the time.",
  },
  {
    title: "SECURE PAYMENTS",
    body: "Your cards are secured by a 4-digit passcode, and all physical card numbers are swapped with virtual card numbers. Your physical card number is never saved on your device, on our servers or passed to merchants during payment.",
  },
  {
    title: "EASY CONNECT IQ™ STORE PURCHASES",
    body: "Once you've added cards in Garmin Wallet, you can use them for future purchases for premium watch faces, apps and more in the Connect IQ™ Store.",
  },
];

const compatibleIds = ["1228429", "1614061", "1462801", "1463821", "1510465", "1316397", "1800201", "1828641", "851039"];

export default function GarminPayPage() {
  const compatible = compatibleIds.map((id) => products.find((p) => p.id === id)).filter((p) => p !== undefined);

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader />
      <main className="flex-1 bg-white">
        {/* Hero — white, centered */}
        <section className="mx-auto max-w-[900px] px-4 pt-12 pb-2 text-center">
          <h1 className="g-heading text-[28px] leading-tight text-black sm:text-[32px]">
            Garmin Pay™ Contactless Payments
          </h1>
          <p className="mx-auto mt-4 max-w-[620px] text-[16px] leading-relaxed text-neutral-700">
            No wallet? No phone? No problem. With Garmin Pay, all you need is your compatible
            smartwatch or bike computer to make purchases on the go.<sup>1</sup>
          </p>
          <a href="#compatible" className="g-btn g-btn--outline-dark mt-6">Shop</a>
        </section>

        {/* Icon strip — 4 columns */}
        <section className="mx-auto max-w-[960px] px-4 py-10">
          <div className="grid grid-cols-1 gap-8 text-center sm:grid-cols-2 lg:grid-cols-4">
            {iconStrip.map((item, i) => (
              <div key={i} className="flex flex-col items-center">
                <item.Icon className="h-[50px] w-[50px] text-black" />
                <p className="mt-4 text-[14px] leading-relaxed text-neutral-700">{item.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Feature details — light gray, stacked full width */}
        <section className="bg-[#eeeeee]">
          <div className="mx-auto max-w-[1200px] divide-y divide-neutral-300 px-4 py-6">
            {details.map((d) => (
              <div key={d.title} className="py-8">
                <h2 className="g-heading text-[24px] text-black">{d.title}</h2>
                <p className="mt-3 max-w-[820px] text-[16px] leading-relaxed text-neutral-700">{d.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Tips for card issuers */}
        <section className="mx-auto max-w-[820px] px-4 py-14 text-center">
          <h2 className="g-heading text-[24px] text-black">Tips for Card Issuers</h2>
          <p className="mt-4 text-[16px] leading-relaxed text-neutral-700">
            Do you want to offer Garmin Pay contactless payments to your customers? Contact your Visa
            or Mastercard representative to begin the enablement process. If you have questions or would
            like to discuss Garmin Pay, contact us at{" "}
            <a href="mailto:eng.busdev@garmin.com" className="text-[#007cc3] underline">
              eng.busdev@garmin.com
            </a>
            .
          </p>
        </section>

        {/* Compatible devices */}
        <section id="compatible" className="mx-auto max-w-[1280px] px-4 pb-16">
          <h2 className="g-heading text-center text-[26px] text-black">Shop the Latest Compatible Devices</h2>
          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {compatible.map((p) => (
              <ProductCard key={p!.id} product={p!} />
            ))}
          </div>
        </section>

        <p className="mx-auto max-w-[1200px] px-4 pb-12 text-[12px] text-neutral-400">
          1. Garmin Pay is available on compatible devices with participating banks and payment networks.
          Contactless payment availability may vary by region.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}

/* --- 50x50 line icons in Garmin's stroke style --- */
const svgBase = {
  viewBox: "0 0 50 50",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function CardIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...svgBase} {...p}>
      <rect x="4" y="12" width="42" height="26" rx="3" />
      <rect x="8" y="18" width="9" height="7" rx="1.2" />
      <path d="M9.5 21.5h4M11.5 18v7" />
      <path d="M28 32h13M22 32h3" />
    </svg>
  );
}

function SwapIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...svgBase} {...p}>
      <rect x="6" y="9" width="26" height="17" rx="2.5" />
      <path d="M6 14h26" />
      <rect x="18" y="24" width="26" height="17" rx="2.5" />
      <path d="M18 29h26" />
      <path d="M39 20l3-3-3-3M11 30l-3 3 3 3" />
    </svg>
  );
}

function TapIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...svgBase} {...p}>
      <rect x="16" y="8" width="18" height="34" rx="4" />
      <path d="M22 8l1.5 3h3L28 8M22 42l1.5-3h3l1.5 3" />
      <circle cx="25" cy="25" r="4.5" />
      <path d="M31 21c1.4 1.1 2.2 2.6 2.2 4s-.8 2.9-2.2 4" />
    </svg>
  );
}

function WaveIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...svgBase} {...p}>
      <path d="M18 14a16 16 0 0 1 0 22" />
      <path d="M24 18a10 10 0 0 1 0 14" />
      <path d="M30 22a4.5 4.5 0 0 1 0 6" />
    </svg>
  );
}
