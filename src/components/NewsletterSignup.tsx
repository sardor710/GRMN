"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

/** Interest ids; labels are `Newsletter.interests.<id>` messages. */
const interests = [
  "wearables",
  "running",
  "outdoor",
  "cycling",
  "golf",
  "marine",
  "aviation",
  "automotive",
  "health",
  "deals",
] as const;

export function NewsletterSignup() {
  const t = useTranslations("Newsletter");
  const [email, setEmail] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitted, setSubmitted] = useState(false);

  const toggle = (i: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  if (submitted) {
    return (
      <div className="mx-auto max-w-[560px] px-4 py-24 text-center">
        <h1 className="g-heading text-[30px] text-black">{t("subscribedHeading")}</h1>
        <p className="mt-3 text-neutral-600">
          {t("subscribedBody", { hasEmail: email ? "yes" : "no", email, count: selected.size })}
        </p>
        <button onClick={() => setSubmitted(false)} className="g-btn g-btn--outline-dark mt-8">
          {t("updatePreferences")}
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[720px] px-4 py-14">
      <div className="text-center">
        <h1 className="g-heading text-[36px] text-black">{t("heading")}</h1>
        <p className="mt-3 text-[16px] text-neutral-600">
          {t("intro")}
        </p>
      </div>

      <form
        className="mt-10"
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(true);
        }}
      >
        <label htmlFor="nl-email" className="block text-[14px] font-medium text-black">
          {t("emailLabel")} <span className="text-red-600">*</span>
        </label>
        <input
          id="nl-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("placeholder")}
          className="mt-2 h-12 w-full border border-neutral-300 px-3 text-[15px] outline-none focus:border-neutral-600"
        />

        <fieldset className="mt-8">
          <legend className="text-[14px] font-medium text-black">
            {t("interestsLegend")}
          </legend>
          <p className="mt-1 text-[13px] text-neutral-500">{t("interestsHint")}</p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {interests.map((i) => (
              <label
                key={i}
                className={`flex cursor-pointer items-center gap-3 border px-4 py-3 text-[14px] transition-colors ${
                  selected.has(i) ? "border-black bg-neutral-50" : "border-neutral-300 hover:border-neutral-500"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(i)}
                  onChange={() => toggle(i)}
                  className="h-4 w-4 accent-black"
                />
                {t(`interests.${i}`)}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="mt-6 flex items-start gap-3 text-[13px] text-neutral-600">
          <input type="checkbox" required className="mt-0.5 h-4 w-4 accent-black" />
          <span>
            {t.rich("consent", { link: (chunks) => <a href="#" className="underline">{chunks}</a> })}
          </span>
        </label>

        <button type="submit" className="g-btn g-btn--solid mt-8 w-full sm:w-auto">
          {t("subscribe")}
        </button>
      </form>
    </div>
  );
}
