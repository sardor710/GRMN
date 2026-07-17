const LINK = "/c/wearables-smartwatches";

/** "This feature is only supported by certain watches…" disclaimer text. */
export function Disclaimer({ kind }: { kind: "see-more" | "find-watch" }) {
  return (
    <>
      This feature is only supported by certain watches.{" "}
      <a href={LINK}>Click here</a>{" "}
      {kind === "find-watch" ? "to find your watch" : "to see more options"}
    </>
  );
}
