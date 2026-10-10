// Who said it: driver or engineer, line by line, in a team radio transcript.
//
// The model that writes the transcript decides, by ear and by sense, under
// the instructions in lib/live/f1-radio.ts (SPEAKERS): what each side sounds
// like, what each tends to say, how a conversation runs. It hears the audio
// and the whole exchange, which no rule over the written words can, and may
// say it is unsure rather than guess. This file only reads and writes the
// labelled form ("NOR: …", "Engineer: …", "Unsure: …").

export type Speaker = "driver" | "engineer" | "unsure";
export interface Turn {
  who: Speaker;
  said: string;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Turns from a labelled transcript ("NOR: …", "Engineer: …", "Unsure: …", or a line with no label). */
export function readTurns(text: string, code: string): Turn[] {
  const labels = `Engineer|Driver|Unsure|Unknown|${esc(code)}`;
  return text
    .split(new RegExp(`(?:^|\\s+|\\n+)(?=(?:\\{\\{)?(?:${labels}):\\s)`, "i"))
    .map((t) => t.trim())
    .filter(Boolean)
    .map((line) => {
      const m = new RegExp(`^(?:\\{\\{)?(${labels}):\\s*([\\s\\S]*)$`, "i").exec(line);
      if (!m) return { who: "unsure" as Speaker, said: line };
      const label = m[1].toLowerCase();
      // A label caught inside an unsure mark ("{{NOR: word}}") keeps its word unsure.
      const said = line.startsWith("{{") ? `{{${m[2]}` : m[2];
      return { who: (label === "engineer" ? "engineer" : label === "unsure" || label === "unknown" ? "unsure" : "driver") as Speaker, said: said.trim() };
    })
    .filter((t) => t.said.replace(/[{}\s]/g, ""));
}

export function writeTurns(turns: Turn[], code: string): string {
  return turns.map((t) => `${t.who === "driver" ? code : t.who === "engineer" ? "Engineer" : "Unsure"}: ${t.said}`).join("\n");
}

/** Neighbouring turns from the same side are one turn. */
export function joinTurns(turns: Turn[]): Turn[] {
  return turns.reduce<Turn[]>((acc, t) => {
    const last = acc.at(-1);
    if (last && last.who === t.who) last.said = `${last.said} ${t.said}`;
    else acc.push({ ...t });
    return acc;
  }, []);
}
