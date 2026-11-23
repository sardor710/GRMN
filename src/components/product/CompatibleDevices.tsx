"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { productPath } from "@/lib/catalog/product-url";
import type { CompatibleDeviceDTO } from "@/contracts/catalog-browse";

/**
 * garmin.com accessory PDP "Compatible Devices" tab (re-measured on QuickFit 22, /p/553030/, 2026-11-22): a flat
 * alphabetical grid of device cards — 4 columns at 1440, 1 at 390; card shadow, padding 16/28/18, 130px image,
 * name Oswald 20/25 with .8px tracking (16px on phones), centred.
 */
export function CompatibleDevices({ devices }: { devices: readonly CompatibleDeviceDTO[] }) {
  const t = useTranslations("ProductTabs");
  return (
    <div>
      <h2 className="sr-only">{t("tabs.compatible")}</h2>
      <ul className="m-0 grid list-none grid-cols-1 gap-5 p-0 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {devices.map(device => (
          <li key={device.label}>
            <Link href={productPath(device.productCode, device.sku)}
              className="group flex h-full flex-col items-center bg-white px-7 pb-[18px] pt-4 text-center shadow-garmin-raised hover:shadow-garmin-raised-hover">
              <div className="relative h-[130px] w-[130px]">
                {device.image && <Image src={device.image.url} alt={device.image.alt || device.label} fill sizes="130px" className="object-contain" />}
              </div>
              <span className="g-heading mt-4 text-[16px] leading-[20px] tracking-[0.8px] text-black group-hover:underline sm:text-[20px] sm:leading-[25px]">{device.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
