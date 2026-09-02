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

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs px-2 py-1 border hairline rounded-sm transition-colors ${
        active ? "bg-masthead-red text-paper border-masthead-red" : "hover:bg-card-bg"
      }`}
    >
      {children}
    </button>
  );
}

function SubredditTagInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [inputVal, setInputVal] = useState("");

  const addTag = (raw: string) => {
    const cleaned = raw
      .replace(/^r\//, "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "");
    if (!cleaned || value.includes(cleaned) || value.length >= 5) return;
    onChange([...value, cleaned]);
    setInputVal("");
  };

  const removeTag = (tag: string) => onChange(value.filter((t) => t !== tag));

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      addTag(inputVal);
    }
    if (e.key === ",") {
      e.preventDefault();
      addTag(inputVal);
    }
    if (e.key === "Backspace" && !inputVal && value.length > 0) {
      removeTag(value[value.length - 1]);
    }
  };

  return (
    <div className="mt-1">
      <div className="min-h-[38px] border hairline rounded-sm px-2 py-1.5 flex flex-wrap gap-1.5 items-center bg-transparent focus-within:ring-1 focus-within:ring-masthead-red/40">
        {value.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1 text-xs bg-card-bg border hairline rounded-sm px-1.5 py-0.5"
          >
            r/{tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="text-ink-soft hover:text-ink leading-none"
              aria-label={`Remove r/${tag}`}
            >
              ×
            </button>
          </span>
        ))}
        {value.length < 5 && (
          <input
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              if (inputVal.trim()) addTag(inputVal);
            }}
            placeholder={value.length === 0 ? "e.g. technology" : "add more…"}
            className="flex-1 min-w-[120px] bg-transparent text-sm outline-none"
          />
        )}
      </div>
      <span className="block text-[11px] text-ink-soft mt-1">
        {value.length === 0
          ? "Leave empty — we'll show globally trending Reddit posts."
          : `${5 - value.length} slot${5 - value.length !== 1 ? "s" : ""} remaining. Press Enter or , to add.`}
      </span>
    </div>
  );
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
      <span className="font-label text-[11px] text-ink-soft">{label}</span>
      <div className="mt-1 flex flex-wrap gap-1.5 mb-1.5">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onChange(value === s ? "" : s)}
            className={`text-xs px-2 py-0.5 border hairline rounded-sm transition-colors ${
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
        className="w-full border hairline rounded-sm px-2 py-1.5 bg-transparent text-sm"
        placeholder={placeholder}
      />
      {hint && (
        <span className="block text-[11px] text-ink-soft mt-1">{hint}</span>
      )}
    </label>
  );
}

export default function PersonalizationForm({
  value,
  onChange,
  creditCards,
  f1Roster,
}: {
  value: Personalization;
  onChange: (next: Personalization) => void;
  creditCards: CreditCard[];
  f1Roster: F1RosterEntry[];
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

  return (
    <div>
      {/* Home city */}
      <label className="block mb-4">
        <span className="font-label text-[11px] text-ink-soft">Home city</span>
        <input
          type="text"
          value={value.homeCity}
          onChange={(e) => onChange({ ...value, homeCity: e.target.value })}
          className="mt-1 w-full border hairline rounded-sm px-2 py-1.5 bg-transparent text-sm"
          placeholder="Bengaluru"
        />
      </label>

      {/* Credit card to follow — single selection */}
      <div className="mb-4">
        <span className="font-label text-[11px] text-ink-soft">
          Credit card to follow
        </span>
        <div className="mt-1 flex flex-wrap gap-2">
          {creditCards.map((c) => (
            <Chip
              key={c.id}
              active={value.cardFollowing === c.id}
              onClick={() =>
                onChange({
                  ...value,
                  cardFollowing: value.cardFollowing === c.id ? "" : c.id,
                })
              }
            >
              {c.name}
            </Chip>
          ))}
        </div>
        <span className="block text-[11px] text-ink-soft mt-1">
          News and comparisons for this card will be surfaced in Plastic &amp; Points.
        </span>
      </div>

      {/* Sports to follow */}
      <div className="mb-3">
        <span className="font-label text-[11px] text-ink-soft">Sports to follow</span>
        <div className="mt-1 flex gap-2">
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
          <span className="block text-[11px] text-ink-soft mt-1">
            Multiple sports — you&rsquo;ll see 2 top stories per sport.
          </span>
        )}
      </div>

      {/* F1 preferences */}
      {value.sports.includes("f1") && (
        <div className="mb-4 pl-3 border-l-2 border-masthead-red/30 space-y-3">
          <label className="block">
            <span className="font-label text-[11px] text-ink-soft">
              Favourite F1 team
            </span>
            <select
              value={value.favoriteF1Team}
              onChange={(e) =>
                onChange({ ...value, favoriteF1Team: e.target.value })
              }
              className="mt-1 w-full border hairline rounded-sm px-2 py-1.5 bg-transparent text-sm"
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
            <span className="font-label text-[11px] text-ink-soft">
              Favourite F1 drivers
            </span>
            <span className="ml-2 text-[11px] text-ink-soft italic">
              pick up to 2
            </span>
            {f1Roster.length > 0 ? (
              <div className="mt-1 flex flex-wrap gap-1.5">
                {f1Roster.map((d) => {
                  const selected = value.favoriteF1Drivers.includes(d.id);
                  const maxed =
                    value.favoriteF1Drivers.length >= 2 && !selected;
                  return (
                    <button
                      key={d.id}
                      type="button"
                      disabled={maxed}
                      onClick={() =>
                        onChange({
                          ...value,
                          favoriteF1Drivers: selected
                            ? value.favoriteF1Drivers.filter((id) => id !== d.id)
                            : [...value.favoriteF1Drivers, d.id],
                        })
                      }
                      className={`text-xs px-2 py-1 border hairline rounded-sm transition-colors ${
                        selected
                          ? "bg-masthead-red text-paper border-masthead-red"
                          : maxed
                          ? "opacity-30 cursor-not-allowed"
                          : "hover:bg-card-bg"
                      }`}
                    >
                      {d.code} — {d.team}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-[11px] text-ink-soft italic mt-1">
                Driver list unavailable right now.
              </p>
            )}
          </div>

          <label className="block">
            <span className="font-label text-[11px] text-ink-soft">
              Schadenfreude
            </span>
            <input
              type="text"
              value={value.hateWatchF1}
              onChange={(e) =>
                onChange({ ...value, hateWatchF1: e.target.value })
              }
              className="mt-1 w-full border hairline rounded-sm px-2 py-1.5 bg-transparent text-sm"
              placeholder="e.g. Red Bull, Verstappen"
            />
            <span className="block text-[11px] text-ink-soft mt-1">
              A rival team or driver — we&rsquo;ll find their bad days.
            </span>
          </label>
        </div>
      )}

      {/* Football preferences */}
      {value.sports.includes("football") && (
        <div className="mb-4 pl-3 border-l-2 border-masthead-red/30 space-y-3">
          <SuggestionInput
            label="Favourite player"
            value={value.favoriteFootballPlayer}
            onChange={(v) => onChange({ ...value, favoriteFootballPlayer: v })}
            suggestions={FOOTBALL_PLAYERS}
            placeholder="or type any player…"
          />
          <SuggestionInput
            label="Favourite club"
            value={value.favoriteFootballClub}
            onChange={(v) => onChange({ ...value, favoriteFootballClub: v })}
            suggestions={FOOTBALL_CLUBS}
            placeholder="or type any club…"
          />
          <SuggestionInput
            label="Favourite national team"
            value={value.favoriteFootballNationalTeam}
            onChange={(v) =>
              onChange({ ...value, favoriteFootballNationalTeam: v })
            }
            suggestions={FOOTBALL_NATIONAL_TEAMS}
            placeholder="or type any country…"
          />
          <label className="block">
            <span className="font-label text-[11px] text-ink-soft">
              Schadenfreude
            </span>
            <input
              type="text"
              value={value.hateWatchFootball}
              onChange={(e) =>
                onChange({ ...value, hateWatchFootball: e.target.value })
              }
              className="mt-1 w-full border hairline rounded-sm px-2 py-1.5 bg-transparent text-sm"
              placeholder="e.g. Man City, Ronaldo, Brazil"
            />
            <span className="block text-[11px] text-ink-soft mt-1">
              A rival club, country, or player — we&rsquo;ll find their bad days.
            </span>
          </label>
        </div>
      )}

      {/* Tennis preferences */}
      {value.sports.includes("tennis") && (
        <div className="mb-4 pl-3 border-l-2 border-masthead-red/30 space-y-3">
          <SuggestionInput
            label="Favourite player"
            value={value.favoriteTennisPlayer}
            onChange={(v) => onChange({ ...value, favoriteTennisPlayer: v })}
            suggestions={TENNIS_PLAYERS}
            placeholder="or type any player…"
          />
          <label className="block">
            <span className="font-label text-[11px] text-ink-soft">
              Schadenfreude
            </span>
            <input
              type="text"
              value={value.hateWatchTennis}
              onChange={(e) =>
                onChange({ ...value, hateWatchTennis: e.target.value })
              }
              className="mt-1 w-full border hairline rounded-sm px-2 py-1.5 bg-transparent text-sm"
              placeholder="e.g. Kyrgios, Djokovic"
            />
            <span className="block text-[11px] text-ink-soft mt-1">
              A rival player — we&rsquo;ll find their bad days.
            </span>
          </label>
        </div>
      )}

      {/* Subreddits */}
      <div className="mb-4">
        <span className="font-label text-[11px] text-ink-soft">
          Subreddits to follow
        </span>
        <SubredditTagInput
          value={value.subreddits}
          onChange={(subs) => onChange({ ...value, subreddits: subs })}
        />
      </div>

      {/* Sections to show */}
      <div className="mb-2">
        <span className="font-label text-[11px] text-ink-soft">
          Sections to show
        </span>
        <div className="mt-1 flex flex-wrap gap-2">
          {SECTION_ORDER.map((key) => (
            <Chip
              key={key}
              active={value.sectionOrder.includes(key)}
              onClick={() => toggleSection(key)}
            >
              {SECTION_META[key].kicker}
            </Chip>
          ))}
        </div>
      </div>
    </div>
  );
}
