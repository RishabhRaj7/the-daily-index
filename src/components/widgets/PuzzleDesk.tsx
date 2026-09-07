"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WORDLE_ANSWERS, WORDLE_GUESSES } from "@/lib/wordle-words";

// ---------------------------------------------------------------------------
// The Puzzle Desk — fills the "Overheard on Reddit" column whenever Reddit has
// nothing for us (blocked network, rate-limited, unconfigured). Instead of an
// error line, the reader gets something to fiddle with in exactly the same
// space:
//
//   1. Wordle — six guesses at today's five-letter word, with the classic
//      green/amber/gray feedback. The same seeded word for every reader, all
//      day; guesses must be real words.
//   2. Headline Scramble — unscramble a word lifted from *today's* real
//      Editor's Picks headlines (falls back to newsroom vocabulary).
//   3. Noughts & Crosses — a quick game against "the Editor" (who is decent
//      but beatable).
//
// Everything is client-side; scores persist in localStorage.
// ---------------------------------------------------------------------------

type Tab = "wordle" | "scramble" | "oxo";

const STOPWORDS = new Set([
  "about", "after", "again", "against", "ahead", "along", "among", "amid", "because", "before",
  "being", "below", "between", "could", "during", "every", "first", "their", "there", "these",
  "those", "through", "under", "until", "where", "which", "while", "would", "should", "still",
  "other", "since", "three", "today", "years", "world", "report", "says", "said", "over", "into",
  "with", "from", "have", "that", "this", "than", "them", "they", "will", "your", "more", "most",
  "just", "like", "week", "make", "after", "latest", "update", "live", "news",
]);

const NEWSROOM_WORDS = [
  "MASTHEAD", "BYLINE", "DEADLINE", "EDITORIAL", "COLUMN", "DATELINE", "BULLETIN", "HEADLINE",
  "TYPESET", "GAZETTE", "LEDGER", "DISPATCH", "PRESSROOM", "SCOOP", "KICKER", "FOLIO", "BROADSHEET",
  "TABLOID", "OBITUARY", "CLASSIFIED", "CAPTION", "STRINGER", "NEWSWIRE", "PAPERBOY", "INKWELL",
];

interface ScrambleItem {
  answer: string;
  scrambled: string;
  headline: string | null;
}

// Small seeded PRNG so "today's puzzle" is the same on every reload.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function shuffleWord(word: string, rnd: () => number): string {
  const letters = word.split("");
  for (let attempt = 0; attempt < 8; attempt++) {
    for (let i = letters.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [letters[i], letters[j]] = [letters[j], letters[i]];
    }
    const out = letters.join("");
    if (out !== word) return out;
  }
  return letters.reverse().join("");
}

function buildScrambles(headlines: string[], seedKey: string, count = 6): ScrambleItem[] {
  const rnd = mulberry32(hashString(seedKey));
  const candidates: { answer: string; headline: string }[] = [];
  const seen = new Set<string>();

  for (const h of headlines) {
    const words = h.match(/[A-Za-z]{5,10}/g) ?? [];
    for (const raw of words) {
      const lower = raw.toLowerCase();
      if (STOPWORDS.has(lower) || seen.has(lower)) continue;
      // Skip words that are all one repeated letter or otherwise dull.
      if (new Set(lower).size < 4) continue;
      seen.add(lower);
      candidates.push({ answer: raw.toUpperCase(), headline: h });
    }
  }

  // Shuffle candidates deterministically, take a handful.
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  const picked: ScrambleItem[] = candidates.slice(0, count).map((c) => ({
    answer: c.answer,
    scrambled: shuffleWord(c.answer, rnd),
    headline: c.headline,
  }));

  // Top up from the newsroom bank if the wire was thin.
  const bank = [...NEWSROOM_WORDS];
  while (picked.length < count && bank.length > 0) {
    const idx = Math.floor(rnd() * bank.length);
    const [w] = bank.splice(idx, 1);
    if (seen.has(w.toLowerCase())) continue;
    picked.push({ answer: w, scrambled: shuffleWord(w, rnd), headline: null });
  }
  return picked;
}

function maskWord(headline: string, answer: string): string {
  const re = new RegExp(`\\b${answer}\\b`, "i");
  return headline.replace(re, "_".repeat(answer.length));
}

// ---- persistence -----------------------------------------------------------

const LS_KEY = "daily-index:puzzle-desk";

type WordleStatus = "playing" | "won" | "lost";
interface WordleDay {
  key: string;
  guesses: string[];
  status: WordleStatus;
  /** Position of the letter the daily hint revealed (0–4), if the reader asked. */
  hintIndex?: number | null;
}
interface WordleStats {
  played: number;
  won: number;
  streak: number;
  bestStreak: number;
  /** Wins by guess count, index 0 = solved in 1 … index 5 = solved in 6. */
  dist: number[];
  /** Today's in-progress or finished game, keyed by the edition's dateKey. */
  day: WordleDay | null;
}

interface Saved {
  bestStreak: number;
  solvedTotal: number;
  oxo: { you: number; editor: number; draws: number };
  wordle: WordleStats;
}

const DEFAULT_SAVED: Saved = {
  bestStreak: 0,
  solvedTotal: 0,
  oxo: { you: 0, editor: 0, draws: 0 },
  wordle: { played: 0, won: 0, streak: 0, bestStreak: 0, dist: [0, 0, 0, 0, 0, 0], day: null },
};

function loadWordleStats(raw: Partial<WordleStats> | undefined): WordleStats {
  const d = DEFAULT_SAVED.wordle;
  if (!raw) return d;
  const day = raw.day;
  return {
    played: raw.played ?? 0,
    won: raw.won ?? 0,
    streak: raw.streak ?? 0,
    bestStreak: raw.bestStreak ?? 0,
    dist: Array.isArray(raw.dist) && raw.dist.length === 6 ? raw.dist : [...d.dist],
    day:
      day && typeof day === "object" && Array.isArray(day.guesses)
        ? {
            key: typeof day.key === "string" ? day.key : "",
            guesses: day.guesses.filter((g) => typeof g === "string"),
            status: day.status === "won" || day.status === "lost" ? day.status : "playing",
            hintIndex: typeof day.hintIndex === "number" ? day.hintIndex : null,
          }
        : null,
  };
}

function loadSaved(): Saved {
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT_SAVED;
    const parsed = JSON.parse(raw) as Partial<Saved>;
    return {
      bestStreak: parsed.bestStreak ?? 0,
      solvedTotal: parsed.solvedTotal ?? 0,
      oxo: { ...DEFAULT_SAVED.oxo, ...(parsed.oxo ?? {}) },
      wordle: loadWordleStats(parsed.wordle),
    };
  } catch {
    return DEFAULT_SAVED;
  }
}

function persist(s: Saved) {
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch {
    /* private mode etc. — scores just won't stick */
  }
}

// ---- Wordle -------------------------------------------------------------------

type Mark = "correct" | "present" | "absent";

// Classic Wordle scoring with correct duplicate-letter handling: exact
// matches are claimed first, then a yellow only consumes a letter the answer
// still has left over — so guessing "ROBOT" against an answer with one O
// never lights up both O's.
function scoreGuess(guess: string, answer: string): Mark[] {
  const marks: Mark[] = ["absent", "absent", "absent", "absent", "absent"];
  const remaining: Record<string, number> = {};
  for (let i = 0; i < 5; i++) {
    if (guess[i] === answer[i]) marks[i] = "correct";
    else remaining[answer[i]] = (remaining[answer[i]] ?? 0) + 1;
  }
  for (let i = 0; i < 5; i++) {
    if (marks[i] === "correct") continue;
    const ch = guess[i];
    if ((remaining[ch] ?? 0) > 0) {
      marks[i] = "present";
      remaining[ch] -= 1;
    }
  }
  return marks;
}

const WORDLE_WIN_LINES = [
  "On the first guess. The Editor suspects a leak in the composing room.",
  "Two tries. Word of it is already around the newsroom.",
  "Three tries — sharp as a fresh nib.",
  "Four tries. Sound, steady typesetting.",
  "Five tries. Filed just before the deadline.",
  "Sixth and final guess. Made the edition by a whisker.",
];

const ORDINALS = ["first", "second", "third", "fourth", "fifth"];

const WORDLE_KEYS = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["ENTER", "Z", "X", "C", "V", "B", "N", "M", "⌫"],
];

// Tiny self-contained styles for the tile flip/pop so this component needs
// nothing outside this file. Colors come from the paper's own palette
// (--up green, paper, ink) plus Wordle's familiar amber.
const WORDLE_CSS = `
  .wl-tile { transition: background-color .12s ease var(--wl-d, 0ms), color .12s ease var(--wl-d, 0ms), border-color .12s ease var(--wl-d, 0ms); }
  .wl-flip { animation: wl-flip .55s ease var(--wl-d, 0ms) both; backface-visibility: hidden; }
  @keyframes wl-flip { 0%, 100% { transform: rotateX(0); } 50% { transform: rotateX(-90deg); } }
  .wl-pop { animation: wl-pop .1s ease-in-out both; }
  @keyframes wl-pop { 0% { transform: scale(0.8); } 100% { transform: scale(1); } }
  .wl-mark { border-color: transparent; }
  .wl-correct { background-color: var(--up, #1e5f3e); color: var(--paper, #f7f3e9); }
  .wl-present { background-color: #c9b458; color: var(--paper, #f7f3e9); }
  .wl-absent { background-color: #787c7e; color: var(--paper, #f7f3e9); }
  @media (prefers-reduced-motion: reduce) {
    .wl-flip, .wl-pop { animation: none; }
  }
`;

function WordleGame({
  dateKey,
  saved,
  onSaved,
}: {
  dateKey: string;
  saved: Saved;
  onSaved: (next: Saved) => void;
}) {
  // Seeded off the edition's DATE alone — never the full dateKey, which in
  // the real app embeds story ids that change whenever the wire refreshes.
  // That keeps the word identical all day, on every reload, for every reader.
  // Falls back to the device's calendar date if the key carries no date.
  const dateMatch = dateKey.match(/\d{4}-\d{2}-\d{2}/);
  const dayKey = dateMatch ? dateMatch[0] : new Date().toLocaleDateString("en-CA");
  const { answer, hintSpot } = useMemo(() => {
    const rnd = mulberry32(hashString(`wordle:${dayKey}`));
    const word = WORDLE_ANSWERS[Math.floor(rnd() * WORDLE_ANSWERS.length)];
    // A second seeded draw picks which letter the daily hint reveals, so the
    // hint is the same for everyone who asks today.
    const spot = Math.floor(rnd() * 5);
    return { answer: word, hintSpot: spot };
  }, [dayKey]);

  const restored = saved.wordle.day && saved.wordle.day.key === dayKey ? saved.wordle.day : null;
  const [guesses, setGuesses] = useState<string[]>(restored?.guesses ?? []);
  const [status, setStatus] = useState<WordleStatus>(restored?.status ?? "playing");
  const [hintIndex, setHintIndex] = useState<number | null>(restored?.hintIndex ?? null);
  const [current, setCurrent] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [bump, setBump] = useState(false);
  const noteTimer = useRef<number | null>(null);

  const flash = useCallback((msg: string) => {
    setNote(msg);
    if (noteTimer.current) window.clearTimeout(noteTimer.current);
    noteTimer.current = window.setTimeout(() => setNote(null), 1800);
  }, []);

  useEffect(
    () => () => {
      if (noteTimer.current) window.clearTimeout(noteTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (!bump) return;
    const t = window.setTimeout(() => setBump(false), 350);
    return () => window.clearTimeout(t);
  }, [bump]);

  // Best mark earned by each letter so far — the keyboard never downgrades
  // a green to an amber or gray (mirrors the duplicate-letter rules).
  const keyMarks = useMemo(() => {
    const rank: Record<Mark, number> = { absent: 0, present: 1, correct: 2 };
    const best: Record<string, Mark> = {};
    for (const g of guesses) {
      const marks = scoreGuess(g, answer);
      g.split("").forEach((ch, i) => {
        const prev = best[ch];
        if (!prev || rank[marks[i]] > rank[prev]) best[ch] = marks[i];
      });
    }
    return best;
  }, [guesses, answer]);

  const submit = useCallback(() => {
    if (status !== "playing") return;
    if (current.length < 5) {
      setBump(true);
      flash("Not enough letters.");
      return;
    }
    if (!WORDLE_GUESSES.has(current)) {
      setBump(true);
      flash("Not in the word list.");
      return;
    }
    const nextGuesses = [...guesses, current];
    const won = current === answer;
    const nextStatus: WordleStatus = won ? "won" : nextGuesses.length >= 6 ? "lost" : "playing";
    setGuesses(nextGuesses);
    setCurrent("");
    setStatus(nextStatus);

    const w = saved.wordle;
    const dist = [...w.dist];
    if (won) dist[nextGuesses.length - 1] += 1;
    const streak = nextStatus === "playing" ? w.streak : won ? w.streak + 1 : 0;
    const wordle: WordleStats = {
      played: w.played + (nextStatus === "playing" ? 0 : 1),
      won: w.won + (won ? 1 : 0),
      streak,
      bestStreak: Math.max(w.bestStreak, streak),
      dist,
      day: { key: dayKey, guesses: nextGuesses, status: nextStatus, hintIndex },
    };
    onSaved({ ...saved, wordle });
  }, [answer, current, dayKey, flash, guesses, hintIndex, onSaved, saved, status]);

  // One hint per day: the desk reveals one position's letter (the same one
  // for every reader), and it stays revealed across reloads.
  const useHint = useCallback(() => {
    if (status !== "playing" || hintIndex !== null) return;
    setHintIndex(hintSpot);
    onSaved({
      ...saved,
      wordle: { ...saved.wordle, day: { key: dayKey, guesses, status, hintIndex: hintSpot } },
    });
  }, [dayKey, guesses, hintIndex, hintSpot, onSaved, saved, status]);

  const press = useCallback(
    (key: string) => {
      if (status !== "playing") return;
      if (key === "ENTER") {
        submit();
        return;
      }
      if (key === "⌫") {
        setCurrent((c) => c.slice(0, -1));
        return;
      }
      if (/^[A-Z]$/.test(key)) setCurrent((c) => (c.length < 5 ? c + key : c));
    },
    [status, submit],
  );

  // Physical keyboard works alongside the on-screen one — but never steals
  // keystrokes from a real input (e.g. the scramble's answer field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "Enter") press("ENTER");
      else if (e.key === "Backspace") press("⌫");
      else {
        const k = e.key.toUpperCase();
        if (/^[A-Z]$/.test(k)) press(k);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press]);

  const stats = saved.wordle;
  const persistent =
    status === "won"
      ? WORDLE_WIN_LINES[Math.max(0, guesses.length - 1)]
      : status === "lost"
        ? `The word was ${answer}. The presses roll again tomorrow.`
        : null;
  const hintLine =
    hintIndex !== null ? (
      <>
        The desk whispers: the {ORDINALS[hintIndex]} letter is{" "}
        <span className="not-italic font-semibold text-masthead-red">{answer[hintIndex]}</span>.
      </>
    ) : null;

  return (
    <div>
      <style>{WORDLE_CSS}</style>

      <div className="flex items-baseline justify-between font-mono text-[10px] text-ink-soft">
        <span>
          {status === "won"
            ? `Solved in ${guesses.length} of 6`
            : status === "lost"
              ? "Out of guesses"
              : `Guess ${Math.min(guesses.length + 1, 6)} of 6`}
        </span>
        <span>
          Won {stats.won} of {stats.played} · Streak {stats.streak}
        </span>
      </div>

      {/* The board: six rows of five tiles, type-slug style to match the desk. */}
      <div className="mt-3 grid grid-rows-6 gap-1 w-max" role="grid" aria-label="Wordle board">
        {Array.from({ length: 6 }, (_, row) => {
          const guess = guesses[row];
          const isActive = !guess && row === guesses.length && status === "playing";
          const marks = guess ? scoreGuess(guess, answer) : null;
          return (
            <div
              key={row}
              role="row"
              className={`grid grid-cols-5 gap-1 ${isActive && bump ? "animate-[shake_0.3s_ease-in-out]" : ""}`}
            >
              {Array.from({ length: 5 }, (_, col) => {
                const ch = guess ? guess[col] : isActive ? (current[col] ?? "") : "";
                const mark = marks?.[col];
                return (
                  <span
                    key={isActive ? `${col}-${ch || "e"}` : col}
                    role="gridcell"
                    aria-label={ch ? `Row ${row + 1}, letter ${ch}${mark ? `, ${mark}` : ""}` : `Row ${row + 1}, empty`}
                    style={{ "--wl-d": `${col * 90}ms` } as React.CSSProperties}
                    className={`wl-tile inline-grid place-items-center w-9 h-10 sm:w-10 sm:h-11 border hairline font-headline text-xl font-semibold leading-none select-none ${
                      mark ? `wl-flip wl-mark wl-${mark}` : ""
                    } ${isActive && ch ? "wl-pop" : ""}`}
                  >
                    {ch}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* On-screen keyboard; earned marks colour the keys and never downgrade. */}
      <div className="mt-3 flex flex-col gap-1 max-w-full" aria-label="On-screen keyboard">
        {WORDLE_KEYS.map((rowKeys, rowIdx) => (
          <div key={rowIdx} className="flex gap-1">
            {rowKeys.map((key) => {
              const mark = key.length === 1 ? keyMarks[key] : undefined;
              const wide = key.length > 1;
              return (
                <button
                  key={key}
                  type="button"
                  tabIndex={-1}
                  onClick={() => press(key)}
                  disabled={status !== "playing"}
                  aria-label={key === "⌫" ? "Delete letter" : key === "ENTER" ? "Submit guess" : `Letter ${key}`}
                  className={`h-8 ${wide ? "flex-[1.6] px-1" : "flex-1"} grid place-items-center border hairline font-label text-[9px] rounded-[2px] transition-colors ${
                    mark ? `wl-mark wl-${mark}` : "bg-card-bg"
                  } ${status === "playing" ? "hover:bg-card-bg cursor-pointer" : "opacity-70"} ${
                    mark && status === "playing" ? "hover:opacity-90" : ""
                  }`}
                >
                  {key === "ENTER" ? "Enter" : key}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <p className="font-body italic text-[13px] text-ink-soft mt-3 leading-relaxed min-h-[2.5rem]">
        {note ?? persistent ?? hintLine ?? (
          <>
            Six tries at today&rsquo;s five-letter word.{" "}
            <span className="text-up not-italic">Green</span> is the right letter in the right spot;{" "}
            <span className="wl-present not-italic px-1 pb-px">amber</span> is in the word but
            elsewhere. Real words only — the same word for every reader, all day.
          </>
        )}
      </p>

      {status === "playing" && (
        <div className="mt-1 flex gap-3 font-label text-[10px]">
          <button
            type="button"
            onClick={useHint}
            disabled={hintIndex !== null}
            className="text-masthead-red underline underline-offset-2 disabled:opacity-40 disabled:no-underline"
          >
            {hintIndex !== null ? "Hint used" : "Hint: reveal one letter"}
          </button>
        </div>
      )}
    </div>
  );
}

// ---- Headline Scramble -----------------------------------------------------

function HeadlineScramble({
  items,
  saved,
  onSaved,
}: {
  items: ScrambleItem[];
  saved: Saved;
  onSaved: (next: Saved) => void;
}) {
  const [index, setIndex] = useState(0);
  const [guess, setGuess] = useState("");
  const [streak, setStreak] = useState(0);
  const [hint, setHint] = useState(false);
  const [state, setState] = useState<"idle" | "wrong" | "right" | "revealed">("idle");
  const [solvedToday, setSolvedToday] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const item = items[index % items.length];
  const finished = index >= items.length;

  const advance = useCallback(() => {
    setIndex((i) => i + 1);
    setGuess("");
    setHint(false);
    setState("idle");
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  const submit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      if (state === "right" || state === "revealed") {
        advance();
        return;
      }
      const clean = guess.trim().toUpperCase();
      if (!clean) return;
      if (clean === item.answer) {
        const nextStreak = streak + 1;
        setStreak(nextStreak);
        setSolvedToday((n) => n + 1);
        setState("right");
        onSaved({
          ...saved,
          bestStreak: Math.max(saved.bestStreak, nextStreak),
          solvedTotal: saved.solvedTotal + 1,
        });
      } else {
        setStreak(0);
        setState("wrong");
      }
    },
    [advance, guess, item, onSaved, saved, state, streak],
  );

  const reveal = () => {
    setStreak(0);
    setState("revealed");
  };

  const restart = () => {
    setIndex(0);
    setGuess("");
    setHint(false);
    setState("idle");
    setSolvedToday(0);
  };

  if (finished) {
    return (
      <div className="py-2">
        <p className="font-headline text-2xl leading-tight">
          {solvedToday === items.length ? "Clean sweep." : `${solvedToday} of ${items.length} set.`}
        </p>
        <p className="font-body text-[13px] text-ink-soft mt-1 leading-relaxed">
          {solvedToday === items.length
            ? "The Editor is quietly impressed. Tomorrow's headlines bring fresh letters."
            : "Not bad for a morning. The same puzzle waits if you want another go."}
        </p>
        <div className="font-mono text-[10px] text-ink-soft mt-3">
          Best streak {saved.bestStreak} · {saved.solvedTotal} solved all-time
        </div>
        <button
          type="button"
          onClick={restart}
          className="mt-3 font-label text-[10px] px-3 py-1.5 border hairline rounded-sm hover:bg-card-bg transition-colors"
        >
          Set it again ↺
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-baseline justify-between font-mono text-[10px] text-ink-soft">
        <span>
          Word {index + 1} of {items.length}
        </span>
        <span>
          Streak {streak} · Best {saved.bestStreak}
        </span>
      </div>

      {/* Scrambled letters as little type slugs */}
      <div className="mt-3 flex flex-wrap gap-1" aria-label={`Scrambled letters: ${item.scrambled.split("").join(" ")}`}>
        {item.scrambled.split("").map((ch, i) => (
          <span
            key={`${index}-${i}`}
            className={`inline-grid place-items-center w-7 h-8 border hairline font-headline text-lg font-semibold transition-transform ${
              state === "right" ? "bg-card-bg" : ""
            } ${state === "wrong" ? "animate-[shake_0.3s_ease-in-out]" : ""}`}
          >
            {ch}
          </span>
        ))}
      </div>

      <p className="font-body italic text-[13px] text-ink-soft mt-3 leading-relaxed min-h-[2.5rem]">
        {state === "right" && (
          <>
            <span className="text-up not-italic font-semibold">Correct.</span>{" "}
            {item.headline ? <>It was in: &ldquo;{item.headline}&rdquo;</> : <>Newsroom vocabulary: {item.answer}.</>}
          </>
        )}
        {state === "revealed" && (
          <>
            <span className="text-masthead-red not-italic font-semibold">{item.answer}.</span>{" "}
            {item.headline ? <>From: &ldquo;{item.headline}&rdquo;</> : <>A word from the pressroom.</>}
          </>
        )}
        {(state === "idle" || state === "wrong") &&
          (hint
            ? item.headline
              ? <>Clue: &ldquo;{maskWord(item.headline, item.answer)}&rdquo;</>
              : <>Clue: a word you&rsquo;d hear in a newsroom, {item.answer.length} letters.</>
            : state === "wrong"
              ? "Not quite — the letters go back on the rack."
              : "Rearrange the slugs into a word from today's paper.")}
      </p>

      <form onSubmit={submit} className="mt-3 flex gap-2">
        <input
          ref={inputRef}
          value={guess}
          onChange={(e) => {
            setGuess(e.target.value);
            if (state === "wrong") setState("idle");
          }}
          disabled={state === "right" || state === "revealed"}
          placeholder="Your answer…"
          autoComplete="off"
          spellCheck={false}
          aria-label="Your answer"
          className="flex-1 min-w-0 bg-transparent border hairline px-2 py-1.5 font-mono text-sm uppercase tracking-wider placeholder:normal-case placeholder:tracking-normal placeholder:text-ink-soft/70 focus:outline-none focus:border-masthead-red disabled:opacity-60"
        />
        <button
          type="submit"
          className="font-label text-[10px] px-3 border hairline rounded-sm hover:bg-card-bg transition-colors whitespace-nowrap"
        >
          {state === "right" || state === "revealed" ? "Next →" : "Check"}
        </button>
      </form>

      {(state === "idle" || state === "wrong") && (
        <div className="mt-2 flex gap-3 font-label text-[10px]">
          <button
            type="button"
            onClick={() => setHint(true)}
            disabled={hint}
            className="text-masthead-red underline underline-offset-2 disabled:opacity-40 disabled:no-underline"
          >
            Hint
          </button>
          <button type="button" onClick={reveal} className="text-ink-soft underline underline-offset-2">
            Reveal
          </button>
        </div>
      )}
    </div>
  );
}

// ---- Noughts & Crosses -----------------------------------------------------

type Cell = "X" | "O" | null;
const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function winnerOf(b: Cell[]): { who: Cell; line: number[] } | null {
  for (const line of LINES) {
    const [a, c, d] = line;
    if (b[a] && b[a] === b[c] && b[a] === b[d]) return { who: b[a], line };
  }
  return null;
}

// The Editor: wins if possible, blocks if needed, otherwise prefers the centre,
// then corners — but with a small chance of a lazy move so readers can win.
function editorMove(b: Cell[]): number {
  const empties = b.map((c, i) => (c === null ? i : -1)).filter((i) => i >= 0);
  const tryLine = (mark: Cell) => {
    for (const i of empties) {
      const copy = [...b];
      copy[i] = mark;
      if (winnerOf(copy)?.who === mark) return i;
    }
    return -1;
  };
  const win = tryLine("O");
  if (win >= 0) return win;
  const block = tryLine("X");
  if (block >= 0 && Math.random() > 0.15) return block;
  if (b[4] === null && Math.random() > 0.2) return 4;
  const corners = [0, 2, 6, 8].filter((i) => b[i] === null);
  if (corners.length && Math.random() > 0.25) return corners[Math.floor(Math.random() * corners.length)];
  return empties[Math.floor(Math.random() * empties.length)];
}

function NoughtsAndCrosses({ saved, onSaved }: { saved: Saved; onSaved: (next: Saved) => void }) {
  const [board, setBoard] = useState<Cell[]>(Array(9).fill(null));
  const [turn, setTurn] = useState<"you" | "editor">("you");
  const [thinking, setThinking] = useState(false);
  const result = useMemo(() => winnerOf(board), [board]);
  const full = board.every(Boolean);
  const over = Boolean(result) || full;
  const scoredRef = useRef(false);

  // Editor's turn, with a beat of "thinking" so it feels like a person.
  useEffect(() => {
    if (turn !== "editor" || over) return;
    setThinking(true);
    const t = setTimeout(() => {
      setBoard((b) => {
        if (winnerOf(b) || b.every(Boolean)) return b;
        const i = editorMove(b);
        const next = [...b];
        next[i] = "O";
        return next;
      });
      setTurn("you");
      setThinking(false);
    }, 450);
    return () => clearTimeout(t);
  }, [turn, over]);

  // Tally once per finished game.
  useEffect(() => {
    if (!over || scoredRef.current) return;
    scoredRef.current = true;
    const oxo = { ...saved.oxo };
    if (result?.who === "X") oxo.you += 1;
    else if (result?.who === "O") oxo.editor += 1;
    else oxo.draws += 1;
    onSaved({ ...saved, oxo });
  }, [over, result, saved, onSaved]);

  const play = (i: number) => {
    if (board[i] || over || turn !== "you") return;
    const next = [...board];
    next[i] = "X";
    setBoard(next);
    if (!winnerOf(next) && !next.every(Boolean)) setTurn("editor");
  };

  const reset = (editorStarts: boolean) => {
    scoredRef.current = false;
    setBoard(Array(9).fill(null));
    setTurn(editorStarts ? "editor" : "you");
  };

  const headline = result
    ? result.who === "X"
      ? "Reader stuns Editor in three moves."
      : "Editor holds the line; reader files complaint."
    : full
      ? "Stalemate declared; both parties claim victory."
      : thinking
        ? "The Editor is thinking…"
        : "Your move. You are X.";

  return (
    <div>
      <div className="flex items-baseline justify-between font-mono text-[10px] text-ink-soft">
        <span>You {saved.oxo.you} · Editor {saved.oxo.editor} · Draws {saved.oxo.draws}</span>
        <button
          type="button"
          onClick={() => reset(Math.random() < 0.5)}
          className="font-label text-[10px] text-masthead-red underline underline-offset-2"
        >
          New game
        </button>
      </div>

      <div className="mt-3 grid grid-cols-[auto_1fr] gap-4 items-start">
        <div
          className="grid grid-cols-3 w-[8.25rem] border hairline"
          role="grid"
          aria-label="Noughts and crosses board"
        >
          {board.map((cell, i) => {
            const inLine = result?.line.includes(i);
            return (
              <button
                key={i}
                type="button"
                role="gridcell"
                aria-label={cell ? `Cell ${i + 1}: ${cell}` : `Cell ${i + 1}: empty`}
                onClick={() => play(i)}
                disabled={Boolean(cell) || over || turn !== "you"}
                className={`h-11 border hairline font-headline text-2xl font-semibold leading-none transition-colors ${
                  inLine ? "bg-card-bg text-masthead-red" : cell === "O" ? "text-ink-soft" : "text-ink"
                } ${!cell && !over && turn === "you" ? "hover:bg-card-bg cursor-pointer" : ""}`}
              >
                {cell ?? ""}
              </button>
            );
          })}
        </div>

        <div className="min-w-0">
          <p className="font-headline text-[15px] sm:text-base font-semibold leading-snug">{headline}</p>
          <p className="font-body italic text-[13px] text-ink-soft mt-1 leading-relaxed">
            {over
              ? "A rematch is customary. Loser buys the coffee."
              : "The Editor plays a solid game but has been known to daydream about tomorrow's front page."}
          </p>
          {over && (
            <div className="mt-2 flex gap-3 font-label text-[10px]">
              <button type="button" onClick={() => reset(false)} className="text-masthead-red underline underline-offset-2">
                You start
              </button>
              <button type="button" onClick={() => reset(true)} className="text-ink-soft underline underline-offset-2">
                Editor starts
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Shell -----------------------------------------------------------------

export default function PuzzleDesk({
  headlines,
  dateKey,
  note,
}: {
  /** Real headlines from today's edition; words are lifted from these. */
  headlines: string[];
  /** Stable per-edition key so the daily puzzle is reproducible. */
  dateKey: string;
  /** Optional one-line reason the column is on puzzle duty. */
  note?: string | null;
}) {
  const [tab, setTab] = useState<Tab>("wordle");
  const [saved, setSaved] = useState<Saved>(DEFAULT_SAVED);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSaved(loadSaved());
    setMounted(true);
  }, []);

  const handleSaved = useCallback((next: Saved) => {
    setSaved(next);
    persist(next);
  }, []);

  const items = useMemo(() => buildScrambles(headlines, dateKey), [headlines, dateKey]);

  return (
    <div className="relative">
      {/* Tab strip in the classic "section tab" style */}
      <div className="flex items-center gap-4 border-b hairline -mt-1 mb-3" role="tablist" aria-label="Puzzle Desk games">
        {(
          [
            { key: "wordle", label: "Wordle" },
            { key: "scramble", label: "Headline Scramble" },
            { key: "oxo", label: "Noughts & Crosses" },
          ] as { key: Tab; label: string }[]
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`font-label text-[10px] pb-1.5 -mb-px border-b-2 transition-colors ${
              tab === t.key
                ? "border-masthead-red text-ink"
                : "border-transparent text-ink-soft hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!mounted ? (
        <p className="font-body italic text-sm text-ink-soft py-4">Setting the type…</p>
      ) : tab === "wordle" ? (
        <WordleGame key={dateKey} dateKey={dateKey} saved={saved} onSaved={handleSaved} />
      ) : tab === "scramble" ? (
        <HeadlineScramble key={dateKey} items={items} saved={saved} onSaved={handleSaved} />
      ) : (
        <NoughtsAndCrosses saved={saved} onSaved={handleSaved} />
      )}

      {note && (
        <p className="font-body italic text-[11px] leading-relaxed text-ink-soft mt-4 pt-2 border-t hairline">
          {note}
        </p>
      )}
    </div>
  );
}
