import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Link } from "@/i18n/navigation";

export default function LocaleNotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader />
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center">
        <h1 className="g-heading text-[32px] text-black">Page not found</h1>
        <p className="mt-4 text-[15px] text-[#5b5b5b]">The page you are looking for does not exist.</p>
        <Link href="/" className="g-btn g-btn--solid mt-8">
          Go to homepage
        </Link>
      </main>
      <SiteFooter />
    </div>
  );
}
