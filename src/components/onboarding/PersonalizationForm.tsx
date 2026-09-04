"use client";

import { useState } from "react";
import type { CreditCard, F1RosterEntry, Personalization } from "@/lib/types";
import { F1_TEAM_COLORS } from "@/lib/personalization";
import { SECTION_META, SECTION_ORDER } from "@/lib/sections";

type Sport = "f1" | "football" | "tennis";

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
  children,
}: {
  numeral: string;
  title: string;
  effect: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t-2 border-ink pt-4 mt-8 first:mt-0 first:border-t-0 first:pt-0">
      <div className="flex items-baseline gap-3 mb-1">
        <span className="font-headline text-xl text-masthead-red leading-none">{numeral}</span>
        <h2 className="font-label text-sm">{title}</h2>
      </div>
      <p className="text-[13px] text-ink-soft italic mb-4">{effect}</p>
      <div className="space-y-4">{children}</div>
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
  "w-full border hairline rounded-sm px-2.5 py-2 bg-transparent text-sm outline-none focus:border-masthead-red/60 transition-colors";

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
      className={`text-xs px-2.5 py-1.5 border hairline rounded-sm transition-colors ${
        active
          ? "bg-masthead-red text-paper border-masthead-red"
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
      <div className="min-h-[42px] border hairline rounded-sm px-2 py-1.5 flex flex-wrap gap-1.5 items-center bg-transparent focus-within:border-masthead-red/60 transition-colors">
        {value.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1 text-xs bg-card-bg border hairline rounded-sm px-1.5 py-0.5"
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
          <span className="text-masthead-red">{invalidHint}</span>
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

function SuggestionInput({
  label,
  value,
  onChange,
  suggestions,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
  placeholder?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onChange(value === s ? "" : s)}
            className={`text-xs px-2 py-1 border hairline rounded-sm transition-colors ${
              value === s
                ? "bg-masthead-red text-paper border-masthead-red"
                : "hover:bg-card-bg"
            }`}
          >
            {s}
          </button>
        ))}
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
        placeholder={placeholder}
      />
      {hint && <Hint>{hint}</Hint>}
    </label>
  );
}

export default function PersonalizationForm({
  value,
  onChange,
  creditCards,
  f1Roster,
  redditPanel,
}: {
  value: Personalization;
  onChange: (next: Personalization) => void;
  creditCards: CreditCard[];
  f1Roster: F1RosterEntry[];
  /** Rendered inside the Grapevine chapter (Settings passes the Reddit
   *  connect panel; onboarding shows a pointer to Settings instead). */
  redditPanel?: React.ReactNode;
}) {
  const toggleSport = (sport: Sport) => {
    const next = value.sports.includes(sport)
      ? value.sports.filter((s) => s !== sport)
      : [...value.sports, sport];
    onChange({ ...value, sports: next });
  };

  const toggleSection = (key: (typeof SECTION_ORDER)[number]) => {
    onChange({
      ...value,
      sectionOrder: value.sectionOrder.includes(key)
        ? value.sectionOrder.filter((s) => s !== key)
        : [...value.sectionOrder, key],
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
      <Chapter
        numeral="I."
        title="The Basics"
        effect="Your city sets the weather page and boosts local stories; your card runs the Plastic & Points section."
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

        <div>
          <FieldLabel>Credit card you follow</FieldLabel>
          <div className="divide-y hairline border-y hairline">
            <label className="flex items-baseline gap-3 py-2 cursor-pointer">
              <input
                type="radio"
                name="card-following"
                checked={value.cardFollowing === ""}
                onChange={() => onChange({ ...value, cardFollowing: "" })}
                className="accent-[#a6291d]"
              />
              <span className="text-sm italic text-ink-soft">No card — general card news only</span>
            </label>
            {creditCards.map((c) => (
              <label key={c.id} className="flex items-baseline gap-3 py-2 cursor-pointer">
                <input
                  type="radio"
                  name="card-following"
                  checked={value.cardFollowing === c.id}
                  onChange={() => onChange({ ...value, cardFollowing: c.id })}
                  className="accent-[#a6291d] shrink-0 translate-y-[1px]"
                />
                <span className="min-w-0">
                  <span className="font-headline text-[15px] font-semibold leading-tight block">
                    {c.name}
                  </span>
                  <span className="font-mono text-[11px] text-ink-soft block">
                    {c.issuer} · {c.network} · {c.annualFee} fee
                  </span>
                </span>
              </label>
            ))}
          </div>
          <Hint>
            Stories mentioning your card&rsquo;s issuer lead the section, and its fact file prints
            at the top.
          </Hint>
        </div>
      </Chapter>

      {/* II. Sports Desk */}
      <Chapter
        numeral="II."
        title="Sports Desk"
        effect="Which sports get a section, whose stories lead it — and whose bad days you enjoy reading about."
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
          {value.sports.length > 1 && (
            <Hint>Multiple sports — each gets its top stories, plus its own sidebar.</Hint>
          )}
          {value.sports.length === 0 && (
            <Hint>
              <span className="text-masthead-red">
                No sports selected — the sports section won&rsquo;t print.
              </span>
            </Hint>
          )}
        </div>

        {value.sports.includes("f1") && (
          <div className="pl-3 border-l-2 border-masthead-red/30 space-y-4">
            <div className="font-label text-[10px] text-masthead-red">Formula 1</div>
            <label className="block">
              <FieldLabel>Your team</FieldLabel>
              <select
                value={value.favoriteF1Team}
                onChange={(e) =>
                  onChange({ ...value, favoriteF1Team: e.target.value })
                }
                className={inputCls}
              >
                <option value="">No preference</option>
                {Object.keys(F1_TEAM_COLORS).map((team) => (
                  <option key={team} value={team}>
                    {team}
                  </option>
                ))}
              </select>
            </label>

            <div>
              <FieldLabel>
                Your drivers{" "}
                <span className="normal-case font-body italic tracking-normal text-ink-soft">
                  — pick up to 2
                </span>
              </FieldLabel>
              {f1Roster.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {f1Roster.map((d) => {
                    const selected = value.favoriteF1Drivers.includes(d.id);
                    const maxed =
                      value.favoriteF1Drivers.length >= 2 && !selected;
                    return (
                      <Chip
                        key={d.id}
                        active={selected}
                        disabled={maxed}
                        onClick={() =>
                          onChange({
                            ...value,
                            favoriteF1Drivers: selected
                              ? value.favoriteF1Drivers.filter((id) => id !== d.id)
                              : [...value.favoriteF1Drivers, d.id],
                          })
                        }
                      >
                        {d.code} — {d.team}
                      </Chip>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[11px] text-ink-soft italic">
                  Driver list unavailable right now.
                </p>
              )}
              <Hint>Their stories lead the F1 column and can make the front page.</Hint>
            </div>

            <label className="block">
              <FieldLabel>Schadenfreude — a rival to follow</FieldLabel>
              <input
                type="text"
                value={value.hateWatchF1}
                onChange={(e) =>
                  onChange({ ...value, hateWatchF1: e.target.value })
                }
                className={inputCls}
                placeholder="e.g. Red Bull, Verstappen"
              />
              <Hint>A rival team or driver — we&rsquo;ll find their bad days.</Hint>
            </label>
          </div>
        )}

        {value.sports.includes("football") && (
          <div className="pl-3 border-l-2 border-masthead-red/30 space-y-4">
            <div className="font-label text-[10px] text-masthead-red">Football</div>
            <SuggestionInput
              label="Your player"
              value={value.favoriteFootballPlayer}
              onChange={(v) => onChange({ ...value, favoriteFootballPlayer: v })}
              suggestions={FOOTBALL_PLAYERS}
              placeholder="or type any player…"
            />
            <SuggestionInput
              label="Your club"
              value={value.favoriteFootballClub}
              onChange={(v) => onChange({ ...value, favoriteFootballClub: v })}
              suggestions={FOOTBALL_CLUBS}
              placeholder="or type any club…"
            />
            <SuggestionInput
              label="Your national team"
              value={value.favoriteFootballNationalTeam}
              onChange={(v) =>
                onChange({ ...value, favoriteFootballNationalTeam: v })
              }
              suggestions={FOOTBALL_NATIONAL_TEAMS}
              placeholder="or type any country…"
            />
            <label className="block">
              <FieldLabel>Schadenfreude — a rival to follow</FieldLabel>
              <input
                type="text"
                value={value.hateWatchFootball}
                onChange={(e) =>
                  onChange({ ...value, hateWatchFootball: e.target.value })
                }
                className={inputCls}
                placeholder="e.g. Man City, Ronaldo, Brazil"
              />
              <Hint>A rival club, country, or player — we&rsquo;ll find their bad days.</Hint>
            </label>
          </div>
        )}

        {value.sports.includes("tennis") && (
          <div className="pl-3 border-l-2 border-masthead-red/30 space-y-4">
            <div className="font-label text-[10px] text-masthead-red">Tennis</div>
            <SuggestionInput
              label="Your player"
              value={value.favoriteTennisPlayer}
              onChange={(v) => onChange({ ...value, favoriteTennisPlayer: v })}
              suggestions={TENNIS_PLAYERS}
              placeholder="or type any player…"
            />
            <label className="block">
              <FieldLabel>Schadenfreude — a rival to follow</FieldLabel>
              <input
                type="text"
                value={value.hateWatchTennis}
                onChange={(e) =>
                  onChange({ ...value, hateWatchTennis: e.target.value })
                }
                className={inputCls}
                placeholder="e.g. Kyrgios, Djokovic"
              />
              <Hint>A rival player — we&rsquo;ll find their bad days.</Hint>
            </label>
          </div>
        )}
      </Chapter>

      {/* III. The Grapevine */}
      <Chapter
        numeral="III."
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
                className="text-[11px] px-2 py-0.5 border hairline rounded-sm text-ink-soft hover:bg-card-bg transition-colors"
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

      {/* IV. Topics to watch */}
      <Chapter
        numeral="IV."
        title="Topics to watch"
        effect="Any story mentioning these words jumps to the top of its section — and can lead the paper."
      >
        <div>
          <TagInput
            value={value.topics}
            onChange={(topics) => onChange({ ...value, topics })}
            max={10}
            placeholder="e.g. RBI, monsoon, ISRO"
          />
          <Hint>
            People, places, institutions, beats — “RBI”, “elections” aside (politics stays out),
            “monsoon”, “startups”. Matched stories get a “For you” tag so you know why they lead.
          </Hint>
        </div>
      </Chapter>

      {/* V. Page order */}
      <Chapter
        numeral="V."
        title="Page order"
        effect="What prints, and in what order — top of the list prints first."
      >
        <ol className="divide-y hairline border-y hairline">
          {SECTION_ORDER.map((key) => {
            const active = value.sectionOrder.includes(key);
            const idx = value.sectionOrder.indexOf(key);
            return (
              <li key={key} className="flex items-center gap-3 py-2">
                <span
                  className={`font-mono text-xs w-5 tabular-nums ${active ? "" : "text-ink-soft/50"}`}
                >
                  {active ? `${idx + 1}.` : "–"}
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
                      className="font-mono text-xs px-1.5 py-0.5 border hairline rounded-sm disabled:opacity-30 hover:bg-card-bg"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${SECTION_META[key].kicker} down`}
                      disabled={idx === value.sectionOrder.length - 1}
                      onClick={() => moveSection(key, 1)}
                      className="font-mono text-xs px-1.5 py-0.5 border hairline rounded-sm disabled:opacity-30 hover:bg-card-bg"
                    >
                      ↓
                    </button>
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => toggleSection(key)}
                  aria-pressed={active}
                  className={`font-label text-[10px] px-2.5 py-1 border hairline rounded-sm transition-colors ${
                    active ? "bg-masthead-red text-paper border-masthead-red" : "hover:bg-card-bg"
                  }`}
                >
                  {active ? "Shown" : "Hidden"}
                </button>
              </li>
            );
          })}
        </ol>
      </Chapter>
    </div>
  );
}
