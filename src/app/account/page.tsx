import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = { title: "My Account | Garmin" };
export default function AccountPage() {
  return <div className="flex min-h-screen flex-col bg-white">
    <SiteHeader />
    <main className="flex-1 bg-neutral-50 px-6 py-20 text-center">
      <h1 className="text-3xl font-semibold text-black">My account</h1>
      <p className="mx-auto mt-4 max-w-xl text-neutral-600">Account access and order history are not available yet.</p>
    </main>
    <SiteFooter />
  </div>;
}
