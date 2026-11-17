import { notFound } from "next/navigation";

/** Unmatched URLs under a locale render `[lang]/not-found.tsx` inside the storefront layout. */
export default function CatchAllNotFound() {
  notFound();
}
