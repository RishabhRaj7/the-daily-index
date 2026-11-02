"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { F1RosterEntry, Personalization } from "@/lib/types";
import {
  DEFAULT_PERSONALIZATION,
  loadPersonalization,
  PERSONALIZATION_CHANGED_EVENT,
  savePersonalization,
} from "@/lib/personalization";
import { loadDigestPreferences, PREFERENCES_CHANGED_EVENT, saveDigestPreferences } from "@/lib/preferences/storage";
import type { DigestPreferences } from "@/lib/preferences/types";
import { withSportsSettings } from "@/lib/preferences/paper";
import { requestEdition } from "@/lib/edition-client";
import PersonalizationForm from "@/components/onboarding/PersonalizationForm";
import DigestPreferencesEditor from "@/components/settings/DigestPreferencesEditor";
import SyncCard from "@/components/settings/SyncCard";
import { loadSync } from "@/lib/sync";
import Link from "next/link";
import TopBar from "@/components/chrome/TopBar";
import { RisingWords } from "@/components/story/SectionHeader";
import { clearMemory, loadMemory } from "@/lib/reader-memory";
import { SETTINGS_RETURN_KEY } from "@/components/chrome/SettingsLink";

// Football / tennis favourites chosen under Sports also steer any news
// section that feeds the sports page, so the reader sets them once.
// Four short tabs, one question each; one Save covers all of them:
//   News      where you are and what the editor reads for you, and how it writes
//   Sections  what prints, in what order, and what fills each section
//   Sports    the sports pages
//   Devices   sync, and what this browser remembers
const TABS = [
  { key: "news", label: "News", blurb: "Where you are, what the AI editor prioritises everywhere, and how it writes." },
  { key: "sections", label: "Sections", blurb: "What prints, in what order, and what fills each section. Edit opens a section's settings." },
  { key: "sports", label: "Sports", blurb: "Which sports get a page, whose stories lead it, and your rivals." },
  { key: "devices", label: "Devices", blurb: "The same paper on every device you read on, and what this one remembers." },
] as const;
/** Tabs that were merged into others still open from old links. */
const MOVED: Record<string, TabKey> = { page: "sections" };
type TabKey = (typeof TABS)[number]["key"];

export default function SettingsPageClient({ f1Roster }: { f1Roster: F1RosterEntry[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Personalization>(DEFAULT_PERSONALIZATION);
  const [news, setNews] = useState<DigestPreferences | null>(null);
  const [baseline, setBaseline] = useState({ paper: "", news: "" });
  const [saved, setSaved] = useState(false);
  const [memoryCount, setMemoryCount] = useState<number>(0);
  const [forgot, setForgot] = useState(false);
  const [tab, setTab] = useState<TabKey>("news");
  const [syncOn, setSyncOn] = useState(false);

  useEffect(() => {
    const paper = loadPersonalization();
    const prefs = loadDigestPreferences();
    // Hydrate the client form from browser-local settings on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(paper);
    setNews(prefs);
    setBaseline({ paper: JSON.stringify(paper), news: JSON.stringify(prefs) });
    setMemoryCount(loadMemory().visits.length);
    setSyncOn(!!loadSync());
    // Deep links like /settings#sections open that tab.
    const fromHash = window.location.hash.slice(1);
    if (TABS.some((t) => t.key === fromHash)) setTab(fromHash as TabKey);
    else if (MOVED[fromHash]) setTab(MOVED[fromHash]);
    if (fromHash.startsWith("sync=")) setTab("devices");
  }, []);

  const selectTab = (key: TabKey) => {
    setTab(key);
    window.history.replaceState(null, "", `#${key}`);
  };
  const active = TABS.find((t) => t.key === tab) ?? TABS[0];

  const paperDirty = useMemo(
    () => baseline.paper !== "" && JSON.stringify(draft) !== baseline.paper,
    [draft, baseline.paper],
  );
  const newsDirty = useMemo(
    () => news !== null && baseline.news !== "" && JSON.stringify(news) !== baseline.news,
    [news, baseline.news],
  );
  const dirty = paperDirty || newsDirty;

  useEffect(() => {
    const fresh = () => {
      if (dirty || saved) return;
      const paper = loadPersonalization();
      const prefs = loadDigestPreferences();
      setDraft(paper);
      setNews(prefs);
      setBaseline({ paper: JSON.stringify(paper), news: JSON.stringify(prefs) });
    };
    window.addEventListener(PERSONALIZATION_CHANGED_EVENT, fresh);
    window.addEventListener(PREFERENCES_CHANGED_EVENT, fresh);
    return () => {
      window.removeEventListener(PERSONALIZATION_CHANGED_EVENT, fresh);
      window.removeEventListener(PREFERENCES_CHANGED_EVENT, fresh);
    };
  }, [dirty, saved]);

  // Discard the draft and close settings. Going *back* restores the paper
  // from the router's cache instantly; pushing "/" would re-run the whole
  // server render (fetching every feed again), which reads like a reload.
  const handleClose = () => {
    let cameFromPaper = false;
    try {
      cameFromPaper = sessionStorage.getItem(SETTINGS_RETURN_KEY) === "back";
      sessionStorage.removeItem(SETTINGS_RETURN_KEY);
    } catch {}
    if (cameFromPaper && window.history.length > 1) router.back();
    else router.push("/");
  };

  const handleSave = () => {
    // Only the fields edited here, laid over the settings as they are now: a
    // device that synced while this page was open keeps what arrived.
    const was = JSON.parse(baseline.paper || "{}") as Record<string, unknown>;
    const edited = Object.fromEntries(
      Object.entries(draft).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(was[k])),
    ) as Partial<Personalization>;
    const paper = { ...loadPersonalization(), ...edited, onboarded: true };
    if (paperDirty) savePersonalization(paper);
    if (news && (newsDirty || paperDirty)) {
      saveDigestPreferences(withSportsSettings(news, paper));
      // Start the server build now so it is already cooking while the
      // reader walks back to the paper; the front page's request joins it.
      void requestEdition(loadDigestPreferences(), { keepalive: true }).catch(() => {});
    }
    setSaved(true);
    // Full navigation so the server re-reads the freshly written cookies.
    // router.push("/") uses the RSC router cache and would return stale data.
    setTimeout(() => {
      window.location.href = "/";
    }, 600);
  };

  return (
    <>
    <TopBar sections={[]} alwaysShowLogo />
    <main className="flex-1 max-w-2xl mx-auto px-4 pt-12 pb-32 w-full">
      <div className="font-label text-[11px] text-accent mb-3">Settings</div>
      <h1 className="font-display font-extrabold text-[clamp(3.2rem,11vw,6rem)] leading-[0.84]">
        <span data-reveal="fade" className="block">
          <RisingWords text="Make it yours" />
        </span>
      </h1>
      <p className="font-headline italic text-ink-soft mt-4 mb-8 text-lg">
        {syncOn ? "Saved on this device, and synced to your others when you save." : "Saved on this device. Nothing leaves it until you save."}
      </p>

      <div
        role="tablist"
        aria-label="Settings"
        className="sticky top-[5.6rem] md:top-[4.1rem] z-30 glass rounded-full border hairline p-1 flex gap-1 mb-8 overflow-x-auto overflow-y-hidden [scrollbar-width:none]"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => selectTab(t.key)}
            className={`flex-1 font-sans font-semibold text-[13px] px-4 py-2 rounded-full whitespace-nowrap transition-colors duration-300 ${
              tab === t.key ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="font-body text-sm text-ink-soft mb-6">{active.blurb}</p>

      {/* News opens with where the reader is; Sections with what prints and in what order. */}
      {(tab === "news" || tab === "sections") && (
        <div className="mb-8">
          <PersonalizationForm
            parts={tab === "news" ? ["basics"] : ["order"]}
            value={draft}
            onChange={(next) => {
              setDraft(next);
              setSaved(false);
            }}
            f1Roster={f1Roster}
            news={tab === "sections" ? news : undefined}
            onNewsChange={(next) => {
              setNews(next);
              setSaved(false);
            }}
          />
        </div>
      )}

      {(tab === "news" || tab === "sections") &&
        (news ? (
          <DigestPreferencesEditor
            view={tab === "news" ? "general" : "sections"}
            value={news}
            onChange={(next) => {
              setNews(next);
              setSaved(false);
            }}
          />
        ) : (
          <p className="font-body text-sm text-ink-soft">Loading…</p>
        ))}

      {tab === "news" && (
        <label className="mt-8 module flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.showWhy}
            onChange={(e) => {
              setDraft({ ...draft, showWhy: e.target.checked });
              setSaved(false);
            }}
            className="accent-[var(--accent)] w-4 h-4 mt-0.5 shrink-0"
          />
          <span>
            <span className="font-label text-[10px] block">Show &ldquo;Why it matters&rdquo;</span>
            <span className="font-body text-sm text-ink-soft">
              A one-line note under each summary on what the story means for you. Off keeps the page shorter.
            </span>
          </span>
        </label>
      )}

      {tab === "sports" && (
        <PersonalizationForm
          parts={["sports"]}
          value={draft}
          onChange={(next) => {
            setDraft(next);
            setSaved(false);
          }}
          f1Roster={f1Roster}
        />
      )}

      {tab === "devices" && <SyncCard />}

      {tab === "devices" && (
      <section className="mt-10 module">
        <div className="font-label text-[10px] text-accent mb-1">What the paper remembers</div>
        <p className="font-body text-sm text-ink-soft leading-relaxed">
          Your reading streak, which editions you opened, and which stories you unfolded are kept in
          this browser{syncOn ? ", and shared with your other devices through sync" : " only — never uploaded"}. They power the Editor&rsquo;s Desk note, the gentle
          story re-ranking, and{" "}
          <Link href="/archive" className="text-accent underline underline-offset-2">
            the Archive
          </Link>
          .
        </p>
        <div className="flex items-center gap-4 mt-3">
          <span className="font-mono text-xs text-ink-soft">
            {forgot ? "Memory cleared." : `${memoryCount} issue${memoryCount === 1 ? "" : "s"} on record`}
          </span>
          {!forgot && memoryCount > 0 && (
            <button
              type="button"
              onClick={() => {
                clearMemory();
                setForgot(true);
                setMemoryCount(0);
              }}
              className="font-label text-[10px] text-accent underline"
            >
              Forget me
            </button>
          )}
        </div>
      </section>
      )}

      <div className="fixed bottom-0 inset-x-0 z-40 border-t hairline glass">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <button type="button" onClick={handleClose} className="chip">
            ← {dirty ? "Discard changes" : "Back to the paper"}
          </button>
          <span className="font-mono text-[11px] text-ink-soft hidden sm:block">
            {saved ? "Saved — reprinting…" : dirty ? "Unsaved changes" : "Everything saved"}
          </span>
          <button
            onClick={handleSave}
            disabled={!dirty || saved}
            className="chip chip-signal h-10 px-5 disabled:opacity-40"
          >
            {saved ? "Saved ✓" : "Save & reprint →"}
          </button>
        </div>
      </div>
    </main>
    </>
  );
}
