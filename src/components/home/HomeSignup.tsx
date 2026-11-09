"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRightIcon } from "@/components/icons";
import styles from "./HomeSignup.module.css";

export function HomeSignup() {
  const [email, setEmail] = useState("");
  const router = useRouter();
  return (
    <section className={styles.section} aria-labelledby="home-signup-heading">
      <h2 id="home-signup-heading">SIGN UP FOR NEWS</h2>
      <form onSubmit={(event) => {
        event.preventDefault();
        router.push(`/newsletter${email ? `?email=${encodeURIComponent(email)}` : ""}`);
      }}>
        <label htmlFor="home-email">Sign up for News*</label>
        <div className={styles.inputRow}>
          <input id="home-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="john@example.com" />
          <button type="submit" aria-label="Sign up for news"><ChevronRightIcon className="h-5 w-5" /></button>
        </div>
      </form>
      <p>Get product news and promotions based on your preferences, devices and services.</p>
      <a href="/newsletter">Learn about email privacy.</a>
    </section>
  );
}
