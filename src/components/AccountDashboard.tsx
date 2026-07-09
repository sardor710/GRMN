"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AccountIcon } from "@/components/icons";

const TABS = ["Overview", "Orders", "Devices", "Addresses", "Subscriptions"] as const;
type Tab = (typeof TABS)[number];

const user = { name: "Alex Rivera", email: "alex.rivera@example.com", member: "Member since 2021" };

const orders = [
  { id: "GAR-100482", date: "July 3, 2026", status: "Delivered", total: "$1,099.99", items: "fēnix® 8 – 47 mm, AMOLED" },
  { id: "GAR-098211", date: "May 18, 2026", status: "Delivered", total: "$249.99", items: "Instinct® 3" },
  { id: "GAR-091775", date: "Feb 2, 2026", status: "Delivered", total: "$299.99", items: "vívoactive® 6" },
];

const devices = [
  { name: "fēnix® 8 – 47 mm", serial: "6J2004921", registered: "July 5, 2026", image: "/images/products/fenix8-cf.jpg" },
  { name: "Instinct® 3", serial: "7A1188342", registered: "May 20, 2026", image: "/images/products/1316397.jpg" },
];

const subscriptions = [
  { name: "Outdoor Maps+", plan: "Annual", renews: "July 8, 2027", price: "$49.99/yr", active: true },
  { name: "inReach® Standard", plan: "Monthly", renews: "Aug 1, 2026", price: "$34.99/mo", active: true },
];

function Card({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="border border-neutral-200 bg-white p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="g-heading text-[18px] text-black">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

export function AccountDashboard() {
  const [tab, setTab] = useState<Tab>("Overview");

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-10">
      <div className="flex items-center gap-4">
        <div className="grid h-16 w-16 place-items-center rounded-full bg-neutral-100 text-neutral-500">
          <AccountIcon className="h-8 w-8" />
        </div>
        <div>
          <h1 className="g-heading text-[28px] text-black">{user.name}</h1>
          <p className="text-[14px] text-neutral-500">{user.email} · {user.member}</p>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[220px_1fr]">
        {/* Sidebar */}
        <nav className="lg:border-r lg:border-neutral-200">
          <ul className="flex gap-2 overflow-x-auto lg:flex-col lg:gap-1 lg:pr-4">
            {TABS.map((t) => (
              <li key={t}>
                <button
                  onClick={() => setTab(t)}
                  className={`w-full whitespace-nowrap px-4 py-2.5 text-left text-[14px] transition-colors ${
                    tab === t ? "bg-black text-white lg:bg-neutral-100 lg:text-black lg:font-medium lg:border-l-2 lg:border-black" : "text-neutral-600 hover:text-black"
                  }`}
                >
                  {t}
                </button>
              </li>
            ))}
            <li>
              <button className="w-full px-4 py-2.5 text-left text-[14px] text-neutral-400 hover:text-black">
                Sign Out
              </button>
            </li>
          </ul>
        </nav>

        {/* Content */}
        <div className="space-y-6">
          {tab === "Overview" && (
            <>
              <Card title="Profile" action={<button className="text-[13px] text-[#007cc3] underline">Edit</button>}>
                <dl className="grid grid-cols-1 gap-3 text-[15px] sm:grid-cols-2">
                  <div><dt className="text-neutral-500">Name</dt><dd className="text-black">{user.name}</dd></div>
                  <div><dt className="text-neutral-500">Email</dt><dd className="text-black">{user.email}</dd></div>
                  <div><dt className="text-neutral-500">Password</dt><dd className="text-black">••••••••</dd></div>
                  <div><dt className="text-neutral-500">Country</dt><dd className="text-black">United States</dd></div>
                </dl>
              </Card>
              <Card title="Recent Order">
                <div className="flex items-center justify-between text-[15px]">
                  <div>
                    <p className="text-black">{orders[0].items}</p>
                    <p className="text-[13px] text-neutral-500">{orders[0].id} · {orders[0].date}</p>
                  </div>
                  <span className="text-[13px] font-medium text-green-700">{orders[0].status}</span>
                </div>
              </Card>
            </>
          )}

          {tab === "Orders" && (
            <Card title="Order History">
              <ul className="divide-y divide-neutral-200">
                {orders.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-4">
                    <div>
                      <p className="text-[15px] text-black">{o.items}</p>
                      <p className="text-[13px] text-neutral-500">{o.id} · {o.date}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[15px] font-medium text-black">{o.total}</p>
                      <p className="text-[12px] font-medium text-green-700">{o.status}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {tab === "Devices" && (
            <Card title="Registered Devices" action={<button className="text-[13px] text-[#007cc3] underline">Register a device</button>}>
              <ul className="divide-y divide-neutral-200">
                {devices.map((d) => (
                  <li key={d.serial} className="flex items-center gap-4 py-4">
                    <div className="relative h-14 w-14 shrink-0 border border-neutral-200">
                      <Image src={d.image} alt={d.name} fill sizes="56px" className="object-contain p-1" />
                    </div>
                    <div>
                      <p className="g-heading text-[16px] text-black">{d.name}</p>
                      <p className="text-[13px] text-neutral-500">Serial {d.serial} · Registered {d.registered}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {tab === "Addresses" && (
            <Card title="Shipping Address" action={<button className="text-[13px] text-[#007cc3] underline">Edit</button>}>
              <address className="text-[15px] not-italic leading-relaxed text-neutral-700">
                {user.name}<br />
                1200 East 151st Street<br />
                Olathe, KS 66062<br />
                United States
              </address>
            </Card>
          )}

          {tab === "Subscriptions" && (
            <Card title="Subscriptions & Plans">
              <ul className="divide-y divide-neutral-200">
                {subscriptions.map((s) => (
                  <li key={s.name} className="flex flex-wrap items-center justify-between gap-2 py-4">
                    <div>
                      <p className="g-heading text-[16px] text-black">{s.name}</p>
                      <p className="text-[13px] text-neutral-500">{s.plan} · Renews {s.renews}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[15px] font-medium text-black">{s.price}</p>
                      <span className="text-[12px] font-medium text-green-700">Active</span>
                    </div>
                  </li>
                ))}
              </ul>
              <Link href="/newsletter" className="mt-4 inline-block text-[13px] text-[#007cc3] underline">
                Manage email preferences
              </Link>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
