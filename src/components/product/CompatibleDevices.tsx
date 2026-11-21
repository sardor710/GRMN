import Image from "next/image";
import Link from "next/link";
import type { CompatibleDeviceDTO } from "@/contracts/catalog-browse";

/** garmin.com accessory PDP "Compatible Devices" tab: a flat alphabetical grid of device cards. */
export function CompatibleDevices({ devices }: { devices: readonly CompatibleDeviceDTO[] }) {
  return (
    <div>
      <h2 className="g-heading text-[32px] uppercase tracking-wide text-black md:text-[38px]">Compatible Devices</h2>
      <ul className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
        {devices.map(device => (
          <li key={device.label}>
            <Link href={`/p/${encodeURIComponent(device.publicKey)}${device.sku ? `?sku=${encodeURIComponent(device.sku)}` : ""}`}
              className="group flex h-full flex-col items-center border border-neutral-200 bg-white p-4 text-center transition-shadow hover:shadow-lg">
              <div className="relative h-[110px] w-[110px]">
                {device.image && <Image src={device.image.url} alt={device.image.alt || device.label} fill sizes="110px" className="object-contain" />}
              </div>
              <span className="mt-3 text-[15px] leading-snug text-black group-hover:underline">{device.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
