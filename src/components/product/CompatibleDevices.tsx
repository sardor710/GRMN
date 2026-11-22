"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { CompatibleDeviceDTO } from "@/contracts/catalog-browse";

/** garmin.com accessory PDP "Compatible Devices" tab: a flat alphabetical grid of device cards. */
export function CompatibleDevices({ devices }: { devices: readonly CompatibleDeviceDTO[] }) {
  const t = useTranslations("ProductTabs");
  return (
    <div>
      <h2 className="sr-only">{t("tabs.compatible")}</h2>
      <ul className="m-0 grid list-none p-0 grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
        {devices.map(device => (
          <li key={device.label}>
            <Link href={`/p/${encodeURIComponent(device.publicKey)}${device.sku ? `?sku=${encodeURIComponent(device.sku)}` : ""}`}
              className="group flex h-full flex-col items-center bg-white p-4 text-center shadow-garmin-card">
              <div className="relative h-[110px] w-[110px]">
                {device.image && <Image src={device.image.url} alt={device.image.alt || device.label} fill sizes="110px" className="object-contain" />}
              </div>
              <span className="mt-3 text-[16px] leading-[24px] text-black group-hover:underline">{device.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
