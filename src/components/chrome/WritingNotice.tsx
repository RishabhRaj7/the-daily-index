"use client";

import type { WritingStatus } from "@/lib/preferences/types";
import { EDITION_TIME_ZONE } from "@/lib/edition-date";

// The top of the page says when something went wrong behind the paper: Gemini
// failed on some summaries or on choosing the stories, a rebuild failed and an
// older edition stands, or the browser couldn't reach the server. It says how
// many stories, why, and whether a retry is coming, with "Try now" beside it.
// Nothing prints when all is well. Stories it can't write also carry their own
// label (story/CopyTag.tsx).

// A fixed time zone, so the server's HTML and the browser's agree.
const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: EDITION_TIME_ZONE });

export default function WritingNotice({
  writing,
  printedAt,
  pending,
  note,
  syncError,
  retrying,
  onRetry,
}: {
  writing?: WritingStatus;
  /** When the edition on the page was built (ISO). */
  printedAt?: string;
  /** Stories on the page still waiting for Gemini. */
  pending: number;
  /** A message from the server, such as today's build limit. */
  note: string | null;
  /** Why the last check with the server failed. */
  syncError: string | null;
  retrying: boolean;
  onRetry: () => void;
}) {
  const lines: string[] = [];
  if (writing?.disabled) {
    lines.push("AI writing is off on this server (no Gemini key), so keyword rules picked the stories and they carry the publisher's own text.");
  }
  if (writing?.selectionFailed) {
    lines.push(`Gemini failed while choosing today's stories: ${writing.selectionFailed}. Keyword rules picked them instead, so the mix may not be what you usually get.`);
  }
  if (pending > 0) {
    const of = writing?.stories ? ` of ${writing.stories}` : "";
    const which = pending === 1 ? "That story carries" : "Those stories carry";
    lines.push(`Gemini failed on ${pending}${of} ${pending === 1 && !of ? "summary" : "summaries"}: ${writing?.reason ?? "the call to it failed"}. ${which} the publisher's own text, marked "Summary pending".`);
  }
  if (writing?.rebuildFailed) {
    lines.push(`Gemini failed during the latest rebuild: ${writing.rebuildFailed.reason}. You're still reading the edition printed${printedAt ? ` at ${clock(printedAt)} IST` : " earlier"}.`);
  }
  if (syncError) lines.push(`Couldn't check for a newer edition: ${syncError}. This is the last copy that arrived.`);
  if (note) lines.push(note);
  if (lines.length === 0) return null;

  const problem = !writing?.disabled && (pending > 0 || writing?.selectionFailed || writing?.rebuildFailed);
  const canRetry = problem || syncError;
  const tone = "var(--mood-fear)";

  return (
    <div
      role="status"
      className="mt-6 rounded-xl border px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2"
      style={{ borderColor: tone, background: `color-mix(in srgb, ${tone} 9%, transparent)` }}
    >
      <div className="min-w-0 flex-1 basis-[28rem]">
        {/* Mixed toward the ink: the bare orange is too faint at this size on the light paper. */}
        <p className="font-label text-[10px] font-semibold mb-1" style={{ color: `color-mix(in srgb, ${tone} 70%, var(--ink))` }}>
          {writing?.disabled ? "AI writing is off" : problem ? "Gemini failed" : "This edition may be out of date"}
        </p>
        {lines.map((line) => (
          <p key={line} className="font-sans text-[13.5px] leading-snug text-ink">
            {line}
          </p>
        ))}
        {problem && writing && (
          <p className="font-mono text-[11px] text-ink-soft mt-1.5">
            {writing.gaveUp ? "Automatic retries have stopped for today." : "Trying again on its own."}
            {writing.triedAt ? ` Last tried at ${clock(writing.triedAt)} IST.` : ""}
          </p>
        )}
      </div>
      {canRetry && (
        <button type="button" onClick={onRetry} disabled={retrying} className="chip shrink-0">
          {retrying ? "Trying…" : "Try now"}
        </button>
      )}
    </div>
  );
}
