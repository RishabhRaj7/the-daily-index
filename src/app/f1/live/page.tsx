import TopBar from "@/components/chrome/TopBar";
import LiveCentre from "@/components/f1/LiveCentre";
import { getF1Schedule } from "@/lib/live/f1";

export const dynamic = "force-dynamic";
export const metadata = { title: "Live centre — The Daily Index" };

// The Pit wall's live centre: everything live that the F1 section keeps off
// the page — full timing with sectors, strategy, race control, team radio,
// the projected title fight and the weather. Reached from the live timing
// card; between sessions it says when the next one starts.

export default async function LivePage() {
  const schedule = await getF1Schedule().catch(() => null);
  return (
    <>
      <TopBar sections={[]} alwaysShowLogo />
      <main className="flex-1 page-scale page-wrap px-4 sm:px-6 pt-8 pb-28 w-full" style={{ ["--section-hue" as string]: "var(--hue-f1)" }}>
        <LiveCentre race={schedule?.nextRace ?? null} />
      </main>
    </>
  );
}
