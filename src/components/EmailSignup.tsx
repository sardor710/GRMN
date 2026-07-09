"use client";

import { ChevronRightIcon } from "@/components/icons";

export function EmailSignup() {
  return (
    <section className="bg-white py-12">
      <div className="mx-auto max-w-[560px] px-4 text-center">
        <h2 className="g-heading text-[26px] tracking-[0.04em] text-black">Sign Up for News</h2>
        <form
          className="mt-6 flex items-stretch justify-center"
          onSubmit={(e) => e.preventDefault()}
        >
          <label htmlFor="email-signup" className="sr-only">
            Email address
          </label>
          <input
            id="email-signup"
            type="email"
            placeholder="john@example.com"
            className="h-11 w-full max-w-[320px] border border-neutral-300 border-r-0 px-3 text-[15px] text-black outline-none placeholder:text-neutral-400 focus:border-neutral-500"
          />
          <button
            type="submit"
            aria-label="Sign up"
            className="grid h-11 w-11 shrink-0 place-items-center bg-black text-white transition-colors hover:bg-neutral-800"
          >
            <ChevronRightIcon className="h-5 w-5" />
          </button>
        </form>
        <p className="mt-4 text-[13px] text-[#5b5b5b]">
          Get product news and promotions based on your preferences, devices and services.
        </p>
        <a href="#" className="mt-1 inline-block text-[13px] text-[#5b5b5b] underline">
          Learn about email privacy.
        </a>
      </div>
    </section>
  );
}
