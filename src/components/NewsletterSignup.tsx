"use client";

import { useState } from "react";

const interests = [
  "Smartwatches & Wearables",
  "Running & Fitness",
  "Outdoor Recreation",
  "Cycling",
  "Golf",
  "Marine",
  "Aviation",
  "Automotive & Home",
  "Health & Wellness",
  "Deals & Promotions",
];

export function NewsletterSignup() {
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
        <h1 className="g-heading text-[30px] text-black">You&apos;re subscribed!</h1>
        <p className="mt-3 text-neutral-600">
          Thanks for signing up{email ? `, ${email}` : ""}. Look out for Garmin news
          {selected.size > 0 ? ` on ${selected.size} topic${selected.size > 1 ? "s" : ""}` : ""} in your inbox.
        </p>
        <button onClick={() => setSubmitted(false)} className="g-btn g-btn--outline-dark mt-8">
          Update Preferences
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[720px] px-4 py-14">
      <div className="text-center">
        <h1 className="g-heading text-[36px] text-black">Sign Up for News</h1>
        <p className="mt-3 text-[16px] text-neutral-600">
          Get product news and promotions based on your preferences, devices and services.
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
          Email address <span className="text-red-600">*</span>
        </label>
        <input
          id="nl-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="john@example.com"
          className="mt-2 h-12 w-full border border-neutral-300 px-3 text-[15px] outline-none focus:border-neutral-600"
        />

        <fieldset className="mt-8">
          <legend className="text-[14px] font-medium text-black">
            What are you interested in?
          </legend>
          <p className="mt-1 text-[13px] text-neutral-500">Choose the topics you&apos;d like to hear about.</p>
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
                {i}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="mt-6 flex items-start gap-3 text-[13px] text-neutral-600">
          <input type="checkbox" required className="mt-0.5 h-4 w-4 accent-black" />
          <span>
            I agree to receive marketing emails from Garmin and understand I can unsubscribe at any time.
            Read about <a href="#" className="underline">email privacy</a>.
          </span>
        </label>

        <button type="submit" className="g-btn g-btn--solid mt-8 w-full sm:w-auto">
          Subscribe
        </button>
      </form>
    </div>
  );
}
