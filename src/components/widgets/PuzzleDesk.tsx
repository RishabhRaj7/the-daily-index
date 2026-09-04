"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// The Puzzle Desk — fills the "Overheard on Reddit" column whenever Reddit has
// nothing for us (blocked network, rate-limited, unconfigured). Instead of an
// error line, the reader gets something to fiddle with in exactly the same
// space:
//
//   1. Headline Scramble — unscramble a word lifted from *today's* real
//      Editor's Picks headlines (falls back to newsroom vocabulary).
//   2. Noughts & Crosses — a quick game against "the Editor" (who is decent
//      but beatable).
//
// Everything is client-side; scores persist in localStorage.
// ---------------------------------------------------------------------------

type Tab = "scramble" | "oxo";

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
interface Saved {
  bestStreak: number;
  solvedTotal: number;
  oxo: { you: number; editor: number; draws: number };
}
const DEFAULT_SAVED: Saved = { bestStreak: 0, solvedTotal: 0, oxo: { you: 0, editor: 0, draws: 0 } };

function loadSaved(): Saved {
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT_SAVED;
    const parsed = JSON.parse(raw) as Partial<Saved>;
    return {
      bestStreak: parsed.bestStreak ?? 0,
      solvedTotal: parsed.solvedTotal ?? 0,
      oxo: { ...DEFAULT_SAVED.oxo, ...(parsed.oxo ?? {}) },
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
            : item.headline
              ? "This word appears in one of today's Editor's Picks."
              : "A word from the pressroom.")}
        {state === "wrong" && <span className="text-masthead-red not-italic"> Not quite — try again.</span>}
      </p>

      <form onSubmit={submit} className="mt-2 flex items-stretch gap-2">
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
  const [tab, setTab] = useState<Tab>("scramble");
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
