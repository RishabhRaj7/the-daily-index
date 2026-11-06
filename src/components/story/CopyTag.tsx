import type { Story } from "@/lib/types";

// The small label on a story whose paragraph isn't Gemini's: its failure shows
// where it happened, not only in the notice at the top of the page
// (chrome/WritingNotice.tsx). Nothing prints on a story Gemini wrote.

export default function CopyTag({ copy }: { copy: Story["copy"] }) {
  if (copy === "pending") {
    return (
      <span
        className="font-label text-[11px] font-semibold shrink-0"
        // Mixed toward the ink: the bare orange is too faint at this size on the light paper.
        style={{ color: "color-mix(in srgb, var(--mood-fear) 70%, var(--ink))" }}
        title="Gemini couldn't write this one yet. This is the publisher's own text, and it's being retried."
      >
        Summary pending
      </span>
    );
  }
  if (copy === "wire") {
    return (
      <span className="font-label text-[11px] text-ink-soft shrink-0" title="This comes straight from the publisher's feed. Gemini hasn't touched it.">
        Publisher&rsquo;s text
      </span>
    );
  }
  return null;
}
