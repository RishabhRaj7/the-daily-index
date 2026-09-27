"use client";

import { useState } from "react";
import type { F1RosterEntry, Personalization } from "@/lib/types";
import { F1_TEAM_COLORS } from "@/lib/personalization";
import { SECTION_META, SECTION_ORDER } from "@/lib/sections";

type Sport = "f1" | "football" | "tennis";
export type FormPart = "basics" | "sports" | "grapevine" | "order";

const SPORT_LABELS: Record<Sport, string> = {
  f1: "Formula 1",
  football: "Football",
  tennis: "Tennis",
};

const MAX_SUBS = 8;

// Top-10 suggestion lists — quick picks shown as chips above each free-fill input.
const FOOTBALL_CLUBS = [
  "Real Madrid", "Barcelona", "Man United", "Arsenal",
  "Liverpool", "Man City", "Chelsea", "PSG", "Bayern Munich", "Juventus",
];
const FOOTBALL_NATIONAL_TEAMS = [
  "Brazil", "France", "England", "Argentina",
  "Spain", "Germany", "Italy", "Portugal", "Netherlands", "Japan",
];
const FOOTBALL_PLAYERS = [
  "Mbappé", "Haaland", "Vinícius Jr", "Bellingham",
  "Salah", "De Bruyne", "Pedri", "Lamine Yamal", "Lewandowski", "Alisson",
];
const TENNIS_PLAYERS = [
  "Sinner", "Alcaraz", "Djokovic", "Zverev",
  "Swiatek", "Sabalenka", "Gauff", "Rybakina", "Medvedev", "Fritz",
];
const SUBREDDIT_SUGGESTIONS = [
  "formula1", "soccer", "tennis", "cricket", "india",
  "personalfinanceindia", "IndiaInvestments", "technology", "gadgets", "science",
];

// A numbered chapter: one decision per chapter, with a plain-language line
// explaining what it changes in tomorrow's paper.
function Chapter({
  numeral,
  title,
  effect,
  bare = false,
  children,
}: {
  numeral?: string;
  title: string;
  effect: string;
  /** Hide the heading when the page around it already names the step. */
  bare?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t hairline pt-6 mt-10 first:mt-0 first:border-t-0 first:pt-0">
      {!bare && (
        <>
          <div className="flex items-baseline gap-3 mb-1">
            {numeral && <span className="font-mono text-[11px] text-accent">{numeral}</span>}
            <h2 className="font-display font-extrabold text-[1.9rem] leading-none">{title}</h2>
          </div>
          <p className="font-headline italic text-[15px] text-ink-soft mb-5">{effect}</p>
        </>
      )}
      <div className="space-y-5">{children}</div>
    </section>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-label text-[11px] text-ink-soft block mb-1.5">{children}</span>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <span className="block text-[11px] text-ink-soft mt-1.5 leading-relaxed">{children}</span>;
}

const inputCls =
  "w-full border hairline rounded-lg px-2.5 py-2 bg-transparent text-sm outline-none focus:border-accent/60 transition-colors";

function Chip({
  active,
  onClick,
  children,
  disabled = false,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`text-xs px-2.5 py-1.5 border hairline rounded-full transition-colors ${
        active
          ? "bg-accent text-accent-ink border-accent"
          : "hover:bg-card-bg disabled:opacity-30 disabled:cursor-not-allowed"
      }`}
    >
      {children}
    </button>
  );
}

// Generic comma/Enter tag input. `format` normalizes entries (subreddits get
// lowercased + validated); topics are kept as typed.
function TagInput({
  value,
  onChange,
  max,
  placeholder,
  prefix,
  validate,
  invalidHint,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  max: number;
  placeholder: string;
  prefix?: string;
  validate?: (tag: string) => string | null;
  invalidHint?: string;
}) {
  const [inputVal, setInputVal] = useState("");
  const [rejected, setRejected] = useState(false);

  const addTag = (raw: string) => {
    const cleaned = validate ? validate(raw) : raw.trim();
    if (!cleaned) {
      setInputVal("");
      return;
    }
    if (!value.includes(cleaned) && value.length < max) {
      onChange([...value, cleaned]);
      setRejected(false);
    }
    setInputVal("");
  };

  const removeTag = (tag: string) => onChange(value.filter((t) => t !== tag));

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "Tab" || e.key === ",") {
      e.preventDefault();
      if (validate && inputVal.trim() && !validate(inputVal)) {
        setRejected(true);
        return;
      }
      addTag(inputVal);
    }
    if (e.key === "Backspace" && !inputVal && value.length > 0) {
      removeTag(value[value.length - 1]);
    }
  };

  return (
    <div>
      <div className="min-h-[42px] border hairline rounded-lg px-2 py-1.5 flex flex-wrap gap-1.5 items-center bg-transparent focus-within:border-accent/60 transition-colors">
        {value.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1 text-xs bg-card-bg border hairline rounded-full px-1.5 py-0.5"
          >
            {prefix}
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="text-ink-soft hover:text-ink leading-none"
              aria-label={`Remove ${prefix}${tag}`}
            >
              ×
            </button>
          </span>
        ))}
        {value.length < max && (
          <input
            type="text"
            value={inputVal}
            onChange={(e) => {
              setInputVal(e.target.value);
              setRejected(false);
            }}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              if (inputVal.trim()) addTag(inputVal);
            }}
            placeholder={value.length === 0 ? placeholder : "add more…"}
            className="flex-1 min-w-[120px] bg-transparent text-sm outline-none"
          />
        )}
      </div>
      <span className="block text-[11px] text-ink-soft mt-1.5">
        {rejected && invalidHint ? (
          <span className="text-accent">{invalidHint}</span>
        ) : value.length === 0 ? (
          "None yet."
        ) : (
          `${max - value.length} slot${max - value.length !== 1 ? "s" : ""} left — Enter or , to add.`
        )}
      </span>
    </div>
  );
}

function cleanSubreddit(raw: string): string | null {
  const cleaned = raw.replace(/^r\//i, "").trim().toLowerCase().replace(/\s+/g, "");
  return /^[a-z0-9_]{3,21}$/.test(cleaned) ? cleaned : null;
}

/** One followed sport: its name, then its few fields in a compact grid. */
function SportCard({ name, accent, children }: { name: string; accent?: string; children: React.ReactNode }) {
  return (
    <div className="module">
      <div className="flex items-center gap-2 mb-4">
        <span className="w-2 h-2 rounded-full" style={{ background: accent ?? "var(--accent)" }} />
        <span className="font-display font-bold text-[1.35rem] leading-none">{name}</span>
      </div>
      <div className="grid sm:grid-cols-2 gap-x-4 gap-y-4">{children}</div>
    </div>
  );
}

/** A text field with the usual answers offered as the reader types. */
function ListInput({
  label,
  value,
  onChange,
  suggestions,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
  placeholder?: string;
}) {
  const id = `list-${label.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      <input
        type="text"
        list={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
        placeholder={placeholder}
      />
      <datalist id={id}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </label>
  );
}

function RivalInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="block">
      <FieldLabel>Rival</FieldLabel>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} placeholder={placeholder} />
    </label>
  );
}

export default function PersonalizationForm({
  value,
  onChange,
  f1Roster,
  redditPanel,
  parts,
  bare = false,
}: {
  value: Personalization;
  onChange: (next: Personalization) => void;
  f1Roster: F1RosterEntry[];
  /** Rendered inside the Grapevine chapter (Settings passes the Reddit
   *  connect panel; onboarding shows a pointer to Settings instead). */
  redditPanel?: React.ReactNode;
  /** Render only these chapters (Settings splits them across tabs); all
   *  chapters, numbered, when omitted (onboarding). */
  parts?: FormPart[];
  /** Chapters without their own headings (the onboarding steps name them). */
  bare?: boolean;
}) {
  const show = (part: FormPart) => !parts || parts.includes(part);
  const num = (n: string) => (parts ? undefined : n);
  const toggleSport = (sport: Sport) => {
    const next = value.sports.includes(sport)
      ? value.sports.filter((s) => s !== sport)
      : [...value.sports, sport];
    onChange({ ...value, sports: next });
  };

  const toggleSection = (key: (typeof SECTION_ORDER)[number]) => {
    // Hiding keeps the section's place in the order, so showing it again
    // puts it back where it was.
    onChange({
      ...value,
      hiddenSections: value.hiddenSections.includes(key)
        ? value.hiddenSections.filter((s) => s !== key)
        : [...value.hiddenSections, key],
    });
  };

  const moveSection = (key: (typeof SECTION_ORDER)[number], dir: -1 | 1) => {
    const order = [...value.sectionOrder];
    const i = order.indexOf(key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    onChange({ ...value, sectionOrder: order });
  };

  return (
    <div>
      {/* I. The Basics */}
      {show("basics") && (
      <Chapter
        bare={bare}
        numeral={num("I.")}
        title="The Basics"
        effect="Your city sets the weather page and boosts local stories."
      >
        <label className="block">
          <FieldLabel>Home city</FieldLabel>
          <input
            type="text"
            value={value.homeCity}
            onChange={(e) => onChange({ ...value, homeCity: e.target.value })}
            className={inputCls}
            placeholder="Bengaluru"
          />
        </label>
      </Chapter>
      )}

      {/* II. Sports Desk */}
      {show("sports") && (
      <Chapter
        bare={bare}
        numeral={num("II.")}
        title="Sports Desk"
        effect="Pick your sports, then who you follow in each."
      >
        <div>
          <FieldLabel>Sports you follow</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {(["f1", "football", "tennis"] as Sport[]).map((s) => (
              <Chip
                key={s}
                active={value.sports.includes(s)}
                onClick={() => toggleSport(s)}
              >
                {SPORT_LABELS[s]}
              </Chip>
            ))}
          </div>
          {value.sports.length === 0 && (
            <Hint>
              <span className="text-accent">
                No sports selected — the sports section won&rsquo;t print.
              </span>
            </Hint>
          )}
        </div>

        {value.sports.includes("f1") && (
          <SportCard name="Formula 1" accent={value.favoriteF1Team ? F1_TEAM_COLORS[value.favoriteF1Team] : undefined}>
            <label className="block">
              <FieldLabel>Team</FieldLabel>
              <select
                value={value.favoriteF1Team}
                onChange={(e) => onChange({ ...value, favoriteF1Team: e.target.value })}
                className={inputCls}
              >
                <option value="">No team</option>
                {Object.keys(F1_TEAM_COLORS).map((team) => (
                  <option key={team} value={team}>
                    {team}
                  </option>
                ))}
              </select>
            </label>
            {[0, 1].map((slot) => (
              <label key={slot} className="block">
                <FieldLabel>{slot === 0 ? "Driver" : "Second driver"}</FieldLabel>
                <select
                  value={value.favoriteF1Drivers[slot] ?? ""}
                  disabled={f1Roster.length === 0 || (slot === 1 && !value.favoriteF1Drivers[0])}
                  onChange={(e) => {
                    const next = [...value.favoriteF1Drivers];
                    if (e.target.value) next[slot] = e.target.value;
                    else next.splice(slot, 1);
                    onChange({ ...value, favoriteF1Drivers: next.filter(Boolean).slice(0, 2) });
                  }}
                  className={`${inputCls} disabled:opacity-50`}
                >
                  <option value="">{f1Roster.length === 0 ? "Driver list unavailable" : "None"}</option>
                  {f1Roster
                    .filter((d) => d.id !== value.favoriteF1Drivers[slot === 0 ? 1 : 0])
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} · {d.team}
                      </option>
                    ))}
                </select>
              </label>
            ))}
            <RivalInput
              value={value.hateWatchF1}
              onChange={(v) => onChange({ ...value, hateWatchF1: v })}
              placeholder="e.g. Red Bull or Verstappen"
            />
          </SportCard>
        )}

        {value.sports.includes("football") && (
          <SportCard name="Football">
            <ListInput
              label="Club"
              value={value.favoriteFootballClub}
              onChange={(v) => onChange({ ...value, favoriteFootballClub: v })}
              suggestions={FOOTBALL_CLUBS}
              placeholder="e.g. Arsenal"
            />
            <ListInput
              label="Player"
              value={value.favoriteFootballPlayer}
              onChange={(v) => onChange({ ...value, favoriteFootballPlayer: v })}
              suggestions={FOOTBALL_PLAYERS}
              placeholder="e.g. Saka"
            />
            <ListInput
              label="National team"
              value={value.favoriteFootballNationalTeam}
              onChange={(v) => onChange({ ...value, favoriteFootballNationalTeam: v })}
              suggestions={FOOTBALL_NATIONAL_TEAMS}
              placeholder="e.g. India"
            />
            <RivalInput
              value={value.hateWatchFootball}
              onChange={(v) => onChange({ ...value, hateWatchFootball: v })}
              placeholder="e.g. Man City"
            />
          </SportCard>
        )}

        {value.sports.includes("tennis") && (
          <SportCard name="Tennis">
            <ListInput
              label="Player"
              value={value.favoriteTennisPlayer}
              onChange={(v) => onChange({ ...value, favoriteTennisPlayer: v })}
              suggestions={TENNIS_PLAYERS}
              placeholder="e.g. Alcaraz"
            />
            <RivalInput
              value={value.hateWatchTennis}
              onChange={(v) => onChange({ ...value, hateWatchTennis: v })}
              placeholder="e.g. Djokovic"
            />
          </SportCard>
        )}

        {value.sports.length > 0 && (
          <Hint>
            Your team, drivers and players lead the sports pages. A rival&rsquo;s genuinely bad day runs under
            Schadenfreude; leave it empty to skip that.
          </Hint>
        )}
      </Chapter>
      )}

      {/* III. The Grapevine */}
      {show("grapevine") && (
      <Chapter
        bare={bare}
        numeral={num("III.")}
        title="The Grapevine"
        effect="Who fills the Reddit column: your actual subscriptions, a hand-picked list — or both."
      >
        <div>
          {redditPanel ?? (
            <Hint>
              You can connect your Reddit account later, in Settings — the list below works on
              its own.
            </Hint>
          )}
        </div>
        <div>
          <FieldLabel>Subreddits, by hand {value.subreddits.length > 0 && `(${value.subreddits.length})`}</FieldLabel>
          <TagInput
            value={value.subreddits}
            onChange={(subs) => onChange({ ...value, subreddits: subs })}
            max={MAX_SUBS}
            placeholder="e.g. technology"
            prefix="r/"
            validate={cleanSubreddit}
            invalidHint="Use 3–21 lowercase letters, numbers or underscores."
          />
          <div className="flex flex-wrap gap-1.5 mt-2">
            {SUBREDDIT_SUGGESTIONS.filter((s) => !value.subreddits.includes(s)).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() =>
                  value.subreddits.length < MAX_SUBS &&
                  onChange({ ...value, subreddits: [...value.subreddits, s] })
                }
                className="text-[11px] px-2 py-0.5 border hairline rounded-full text-ink-soft hover:bg-card-bg transition-colors"
              >
                + r/{s}
              </button>
            ))}
          </div>
          <Hint>
            {value.subreddits.length === 0
              ? "Empty — the column reads globally trending posts, matched to your sports."
              : "Your picks print first; connected subscriptions fill the rest."}
          </Hint>
        </div>
      </Chapter>
      )}

      {/* IV. Page order */}
      {show("order") && (
      <Chapter
        bare={bare}
        numeral={num("IV.")}
        title="Page order"
        effect="What prints, and in what order — top of the list prints first."
      >
        <ol className="divide-y hairline border-y hairline">
          {value.sectionOrder.map((key, idx) => {
            const active = !value.hiddenSections.includes(key);
            const position = value.sectionOrder.slice(0, idx + 1).filter((k) => !value.hiddenSections.includes(k)).length;
            return (
              <li key={key} className="flex items-center gap-3 py-2">
                <span
                  className={`font-mono text-xs w-5 tabular-nums ${active ? "" : "text-ink-soft/50"}`}
                >
                  {active ? `${position}.` : "–"}
                </span>
                <span
                  className={`font-headline text-[15px] flex-1 ${active ? "font-semibold" : "text-ink-soft italic"}`}
                >
                  {SECTION_META[key].kicker}
                </span>
                {active && (
                  <span className="flex gap-1">
                    <button
                      type="button"
                      aria-label={`Move ${SECTION_META[key].kicker} up`}
                      disabled={idx === 0}
                      onClick={() => moveSection(key, -1)}
                      className="font-mono text-xs px-1.5 py-0.5 border hairline rounded-full disabled:opacity-30 hover:bg-card-bg"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${SECTION_META[key].kicker} down`}
                      disabled={idx === value.sectionOrder.length - 1}
                      onClick={() => moveSection(key, 1)}
                      className="font-mono text-xs px-1.5 py-0.5 border hairline rounded-full disabled:opacity-30 hover:bg-card-bg"
                    >
                      ↓
                    </button>
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => toggleSection(key)}
                  aria-pressed={active}
                  className={`font-label text-[10px] px-2.5 py-1 border hairline rounded-full transition-colors ${
                    active ? "bg-accent text-accent-ink border-accent" : "hover:bg-card-bg"
                  }`}
                >
                  {active ? "Shown" : "Hidden"}
                </button>
              </li>
            );
          })}
        </ol>
      </Chapter>
      )}
    </div>
  );
}
