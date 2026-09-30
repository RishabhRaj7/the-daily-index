// A live figure its source didn't answer for this time: the last good
// reading is shown, and this says when it was taken.
export default function StaleTag({ asOf }: { asOf?: string }) {
  const d = asOf ? new Date(asOf) : null;
  const label =
    d && !Number.isNaN(d.getTime())
      ? `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}, ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
      : "earlier";
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[10px] text-ink-faint" title="The source didn't answer; this is its last good reading">
      <span className="w-1.5 h-1.5 rounded-full bg-ink-faint" aria-hidden="true" />
      as of {label}
    </span>
  );
}
