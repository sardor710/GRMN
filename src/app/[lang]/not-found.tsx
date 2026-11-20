import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export default function LocaleNotFound() {
  const t = useTranslations("NotFound");
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader />
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center">
        <h1 className="g-heading text-[32px] text-black">{t("heading")}</h1>
        <p className="mt-4 text-[15px] text-[#5b5b5b]">{t("body")}</p>
        <Link href="/" className="g-btn g-btn--black mt-8">
          {t("home")}
        </Link>
      </main>
      <SiteFooter />
    </div>
  );
}
