import "server-only";
import { randomUUID } from "node:crypto";
import { index, pgTable, primaryKey, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./identity.ts";
import { products } from "./catalog.ts";

export const wishlists = pgTable("wishlists", {
  id: uuid("id").primaryKey().$defaultFn(randomUUID), userId: uuid("user_id").notNull().unique().references(() => user.id, { onDelete: "restrict" }),
});
export const wishlistItems = pgTable("wishlist_items", {
  wishlistId: uuid("wishlist_id").notNull().references(() => wishlists.id, { onDelete: "restrict" }), productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "restrict" }), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.wishlistId, t.productId] }), index("wishlist_items_product_idx").on(t.productId), index("wishlist_items_history_idx").on(t.wishlistId, t.createdAt, t.productId)]);
