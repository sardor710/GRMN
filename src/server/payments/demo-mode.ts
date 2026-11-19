import "server-only";
import type { PoolClient } from "pg";

// Task 3.1 (owner decision 2026-11-19): the "Demo checkout" store setting. It is
// store_settings.payment_mode='demo', on by default and on every environment (production included)
// until launch. DEMO_CHECKOUT_DISABLED=1 forces it off whatever the setting says. While demo is on,
// checkout offers only the simulated demo method and refuses the real-money manual method; while it
// is off, checkout offers only manual. The two are never offered together.

type Queryable = Pick<PoolClient, "query">;
type Env = Readonly<Record<string, string | undefined>>;

export type CheckoutPaymentMethod = "demo" | "manual";

/** True when DEMO_CHECKOUT_DISABLED=1 forces demo checkout off. */
export function demoCheckoutForcedOff(env: Env = process.env): boolean {
  return env.DEMO_CHECKOUT_DISABLED === "1";
}

/** Whether checkout runs in demo mode: the store setting is 'demo' and the environment does not force it off. */
export async function demoCheckoutEnabled(db: Queryable, env: Env = process.env): Promise<boolean> {
  if (demoCheckoutForcedOff(env)) return false;
  const row = (await db.query<{ payment_mode: string }>("SELECT payment_mode FROM store_settings WHERE id=1")).rows[0];
  return row?.payment_mode === "demo";
}

/** The payment methods checkout offers now: only demo while demo checkout is on, otherwise only manual. */
export async function availablePaymentMethods(db: Queryable, env: Env = process.env): Promise<CheckoutPaymentMethod[]> {
  return (await demoCheckoutEnabled(db, env)) ? ["demo"] : ["manual"];
}
