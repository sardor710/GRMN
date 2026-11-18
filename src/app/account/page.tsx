import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { AccountDashboard } from "@/components/AccountDashboard";

// The dashboard reads only the signed-in session's records through /api/account/*; this page
// renders no customer data on the server and never touches shared CMS records.
export const metadata: Metadata = { title: "My Account | Garmin", robots: { index: false, follow: false } };
export default function AccountPage() {
  return <div className="flex min-h-screen flex-col bg-white">
    <SiteHeader />
    <main className="flex-1 bg-neutral-50">
      <AccountDashboard />
    </main>
    <SiteFooter />
  </div>;
}
