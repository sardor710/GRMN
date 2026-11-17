"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import styles from "./HomeSignup.module.css";

export function HomeSignup() {
  const [email, setEmail] = useState("");
  const router = useRouter();
  return (
    <section className={styles.section} data-home="signup" aria-labelledby="home-signup-heading">
      <h2 id="home-signup-heading" className={styles.heading}>Sign up for News</h2>
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          router.push(`/newsletter${email ? `?email=${encodeURIComponent(email)}` : ""}`);
        }}
      >
        <label htmlFor="home-email" className={styles.label}>
          Sign up for News<span aria-hidden="true">*</span>
        </label>
        <div className={styles.inputRow}>
          <input
            id="home-email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="john@example.com"
          />
          <button type="submit" aria-label="Submit">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 11.2 18.1" aria-hidden="true">
              <path d="M11.2 9l-9.1 9.1L0 16l6.9-7L0 2.1 2.1 0l9.1 9z" />
            </svg>
          </button>
        </div>
      </form>
      <p className={styles.copy}>Get product news and promotions based on your preferences, devices and services.</p>
      <p className={styles.copy}>
        <a href="https://www.garmin.com/en-US/privacy/global/">Learn about email privacy.</a>
      </p>
    </section>
  );
}
