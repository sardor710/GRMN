import { useLocalizeHref } from "@/i18n/useLocalizeHref";
const LINK = "/c/wearables-smartwatches";

/** "This feature is only supported by certain watches…" disclaimer text. */
export function Disclaimer({ kind }: { kind: "see-more" | "find-watch" }) {
  const localize = useLocalizeHref();
  return (
    <>
      This feature is only supported by certain watches.{" "}
      <a href={localize(LINK)}>Click here</a>{" "}
      {kind === "find-watch" ? "to find your watch" : "to see more options"}
    </>
  );
}
