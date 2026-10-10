// Who said it: driver or engineer, line by line, in a team radio transcript.
//
// The model that writes the transcript labels each turn as it hears it (the
// cockpit is loud — engine, wind, breathing, a clipped, shouted voice; the
// pit wall is a clean, calm close mic) and may say it is unsure. Its labels
// are then read against the words, because the two sides talk differently:
//
//   the driver   says how the car feels ("no grip", "my tyres"), complains
//                about others ("he pushed me off"), asks for information
//                ("what's the gap?", "are we boxing?"), thanks the team
//                ("thank you guys"), and is the one who gets bleeped
//   the engineer gives instructions ("box box", "stay out", "plan B",
//                "lift and coast"), numbers ("gap is 1.2", "5 laps to go",
//                "you're P4"), passes on race control ("five-second
//                penalty", "safety car"), asks about the car ("how are the
//                tyres?"), addresses the driver by name ("Lando, …"), and
//                runs the after-race routine ("cool-down lap", "stop the car")
//
// Each line scores for both sides. A clear lead (two points or more) wins
// over the model's label; a narrow one only settles a line the model was
// unsure of. A line after a question, given to the same voice, is the answer
// (the model only starts a turn when it hears the voice change), and a bare
// "copy" or "yeah" goes to whoever didn't speak last (it answers them). Lines left unsure stay unsure rather than being guessed, and
// neighbouring lines from the same side are joined.
//
// Runs where the transcript is written (lib/live/f1-radio.ts) and again on
// every read (/api/f1/radio), so transcripts kept before a rule existed get it
// too — the rules cost nothing, only the listening costs model calls.

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

type Rule = [RegExp, number, string];

const DRIVER: Rule[] = [
  [/\[bleep\]/i, 2, "bleeped"],
  [/\b(i('ve| have)?( got)? no (grip|power|rears?|fronts?|traction|brakes?|downforce|balance|drs|radio)|i can'?t (see|turn|stop|push|get|keep|hold|breathe|hear|follow|overtake|do)|i('m| am) (losing|struggling|sliding|stuck|stopping|out|done|so slow|nowhere)|i (lost|locked|spun|hit|touched|missed|went)|my (tyres?|tires?|car|engine|brakes?|seat|drink|steering|wheel|mirrors?|fronts?|rears?|front wing|floor|gearbox|hands?|neck|back|visor)|the car (is|feels|was)|car feels|it'?s (undriveable|so slippery|sliding|bouncing|vibrating)|understeer|oversteer|snaps?|bottoming|porpois|vibration|lost (the )?(power|rear|front|car|drive)|no (grip|power|drive) (at all|anywhere))/i, 2, "about the car"],
  [/\b(he (hit|pushed|forced|ran|turned in|moved|cut|blocked|braked|chopped|squeezed|crashed|didn'?t (leave|give))|pushed me|hit me|forced me|ran me|squeezed me|off the track|cut the chicane|that'?s (dangerous|unbelievable|a joke|ridiculous)|unbelievable|ridiculous|are you (kidding|serious)|what (the \[bleep\]|is he doing|was that|are we doing|happened there))\b/i, 2, "about another driver"],
  [/\b(what'?s the (gap|plan|delta|pace|situation)|gap (to|behind|ahead)( him)?\?|how many laps|are we (boxing|pitting|stopping|going|staying)|should (i|we) (box|pit|stay|push|let)|(where|what position) am i|is he (pitting|boxing|on|in)|what tyres? (is|are|has)|can i (push|go|attack|use)|do (i|we) (box|stop|need)|why (are|did|didn'?t) (we|you))\b/i, 2, "asking"],
  [/\b(thank(s| you),? (guys|team|everyone|all|so much)|(well done|good job|great job|amazing job|good work|great work),? (guys|team|everyone|boys|all)|love you guys|what a (team|job))\b/i, 2, "thanking the team"],
  [/\b(the )?(fronts?|rears?|tyres?|tires?|brakes?)( are| is|'re)? (a bit |quite |really |so |completely )?(hot|cold|gone|dead|done|finished|graining|blistering|overheating|sliding|locking|on fire)\b/i, 1.5, "how the tyres feel"],
  [/\b(radio check|can you hear me|drink(s)? (isn'?t|not|bottle)|my drink)\b/i, 1, "about the radio or drink"],
  [/(!.*){2,}|\b(yes+!|wo+h?o+|yee?ha+|let'?s go+!)/i, 0.5, "shouting"],
];

const ENGINEER: Rule[] = [
  [/\b(box,? box|box (this|next) lap|box now|in this lap|stay out|push( now|,? push| flat| hard)|plan [a-f]\b|strat(egy)? (mode|\d)|mode (\w+ )?\d|mode (push|slow|safe|overtake|hot|race|max)|switch (to|on)|lift and coast|lico|manage (the )?(tyres?|gap|pace|temps?|brakes?|battery|fuel)|bring it home|keep (it )?(clean|going|pushing|it up)|hold (your )?position|give (the |him )?(place|position)|let (him|them) (by|through|past)|stay with|attack|defend|go for it|you can (push|race|attack)|free to race|multi-?function)\b/i, 2, "an instruction"],
  [/\b(gap( is| to| behind| ahead)?( is)? (now )?\d|\d+(\.\d+)? ?(seconds?|tenths?|s\b)|delta|(plus|minus) \d|lap time|target|p\d{1,2}\b|position \d|laps? (to go|remaining|left)|\d+ laps?\b|(you'?re|you are)( now)? (p\d|in p|plus|minus|clear|free|catching|gaining|faster|slower|quickest|the fastest)|he'?s (pitting|boxing|on (the )?(hards?|mediums?|softs?|inters?)|catching|in the pits|\d)|tyres? (are|look) (good|fine|ok|okay|cold|hot)|temps?|sector \d|deg(radation)?)\b/i, 1.5, "numbers"],
  [/\b(penalty|five[- ]second|ten[- ]second|drive[- ]through|investigat|no further action|noted|track limits|black and white|warning|safety car|vsc|virtual|red flag|double yellow|yellow flag|blue flags?|stewards)\b/i, 1, "race control"],
  [/\b(how (are|is) (the )?(tyres?|car|rears?|fronts?|balance|grip|brakes?|it feeling)|how('s| is) it( feeling)?|any (issues|damage|problems)|can you (confirm|give|tell|try|push|manage|make)|are you ok(ay)?|you ok\b|everything ok)/i, 2, "asking about the car"],
  [/\b(cool[- ]?down|stop the car|park (the car|it)|pit ?lane entry|weigh(bridge)?|turn (the car )?off|switch (it )?off|engine off|chequered flag|that'?s (p\d|the win|a win|pole|the championship))\b/i, 2, "after the flag"],
  [/^(well done,? |good job,? |great job,? )?(mate|buddy|my friend)\b|,? (mate|buddy)[.!]?$/i, 1, "calling him mate"],
];

const ACK = /^(\{\{)?(copy( that)?|understood|roger|ok(ay)?|yeah|yep|yes|got it|thanks|thank you|fine|sure|no|negative|affirm(ative)?|cheers)[.!]?(\}\})?$/i;

function score(said: string, first: string | null): { driver: number; engineer: number } {
  const text = said.replace(/\{\{|\}\}/g, "");
  let driver = 0;
  let engineer = 0;
  for (const [re, w] of DRIVER) if (re.test(text)) driver += w;
  for (const [re, w] of ENGINEER) if (re.test(text)) engineer += w;
  // Spoken to the driver by name: the pit wall.
  if (first && new RegExp(`(^|[.!?]\\s*|,\\s*)${esc(first)}\\b[,.!]?`, "i").test(text)) engineer += new RegExp(`^${esc(first)}\\b`, "i").test(text) ? 2 : 1.5;
  return { driver, engineer };
}

/** Settle each turn's speaker: the model's ear, checked against the words and the flow. */
export function settle(turns: Turn[], first: string | null = null): Turn[] {
  const out: Turn[] = turns.map((t) => {
    const s = score(t.said, first);
    const lead = s.driver - s.engineer;
    if (Math.abs(lead) >= 2) return { ...t, who: lead > 0 ? "driver" : "engineer" };
    if (t.who === "unsure" && Math.abs(lead) >= 1) return { ...t, who: lead > 0 ? "driver" : "engineer" };
    return t;
  });
  // A question and then a line the model also gave the asker: it heard a new
  // turn (it starts one only when the voice changes), so it is the answer —
  // unless the words plainly belong to the asker.
  for (let i = 1; i < out.length; i++) {
    const q = out[i - 1];
    if (q.who === "unsure" || out[i].who !== q.who || !/\?\s*(\}\})?$/.test(q.said)) continue;
    const s = score(out[i].said, first);
    const mine = q.who === "driver" ? s.driver - s.engineer : s.engineer - s.driver;
    if (mine < 2) out[i] = { ...out[i], who: q.who === "driver" ? "engineer" : "driver" };
  }
  // A bare acknowledgement answers the other side.
  for (let i = 0; i < out.length; i++) {
    if (!ACK.test(out[i].said.trim())) continue;
    const before = out.slice(0, i).reverse().find((t) => t.who !== "unsure");
    const after = out.slice(i + 1).find((t) => t.who !== "unsure");
    const other = (t: Turn | undefined): Speaker | null => (t ? (t.who === "driver" ? "engineer" : "driver") : null);
    // The model heard the voice; only overrule it when the turn before says otherwise.
    const want = other(before) ?? (out[i].who === "unsure" ? other(after) : null);
    if (want) out[i] = { ...out[i], who: want };
  }
  // Neighbours from the same side are one turn.
  return out.reduce<Turn[]>((acc, t) => {
    const last = acc.at(-1);
    if (last && last.who === t.who) last.said = `${last.said} ${t.said}`;
    else acc.push({ ...t });
    return acc;
  }, []);
}

/** A labelled transcript, its speakers settled (text in, text out). */
export function settleText(text: string, code: string, first: string | null = null): string {
  const turns = readTurns(text, code);
  return turns.length ? writeTurns(settle(turns, first), code) : text;
}
