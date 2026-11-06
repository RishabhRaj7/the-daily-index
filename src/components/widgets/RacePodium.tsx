"use client";

import { useState } from "react";
import type { F1GridResult, F1LastRace, F1LiveResult } from "@/lib/types";
import { driverPhotoByCode, teamLogo } from "@/lib/f1-assets";
import { isLightTeamColor, teamColor } from "@/lib/personalization";

// The race's top three, P2 · P1 · P3 with the winner raised: each driver standing
// on a slanted panel in their team's colour, above a black name plate with their
// three-letter code, team logo and time. The plate is black on both papers, so its
// type always reads, and the number takes dark or light from the team's colour. A
// driver with no portrait (a reserve standing in) gets their team's logo instead.

type Row = F1GridResult | F1LiveResult | F1LastRace["results"][number];

/** "2h 20m 28.772s" → "2:20:28.772", how a race time is written on a timing screen. */
function raceTime(time: string): string {
  const m = time.match(/^(\d+)h (\d+)m ([\d.]+)s$/);
  if (!m) return time;
  const [whole, part] = m[3].split(".");
  return `${m[1]}:${m[2].padStart(2, "0")}:${whole.padStart(2, "0")}${part ? `.${part}` : ""}`;
}

function Face({ row, light }: { row: Row; light: boolean }) {
  const [failed, setFailed] = useState(false);
  const photo = row.code && row.team ? driverPhotoByCode(row.code, row.team, 240) : null;
  const logo = row.team ? teamLogo(row.team) : null;
  if (photo && !failed) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="podium-face" src={photo} alt={row.driver} loading="lazy" onError={() => setFailed(true)} />;
  }
  if (!logo) return null;
  // The logos are white: a light team colour needs them dark.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="podium-mark" src={logo} alt={row.team} style={light ? { filter: "brightness(0)" } : undefined} />;
}

export default function RacePodium({ rows }: { rows: Row[] }) {
  const order = [2, 1, 3].map((n) => rows.find((r) => r.position === n));
  if (order.some((r) => !r)) return null;
  return (
    <div className="podium">
      {order.map((r) => {
        const row = r!;
        const colour = teamColor(row.team) ?? "#6b6b74";
        const light = isLightTeamColor(colour);
        const logo = row.team ? teamLogo(row.team) : null;
        // The winner's race time; the others' gap to the winner.
        const time = ("interval" in row ? row.interval : row.time) || "—";
        return (
          <div
            key={row.code || row.driver}
            className={`podium-step podium-p${row.position}`}
            style={{ ["--team" as string]: colour, ["--on-team" as string]: light ? "#111113" : "#ffffff" }}
          >
            <div className="podium-art">
              <b className="podium-num">{row.position}</b>
              <Face row={row} light={light} />
            </div>
            <div className="podium-plate" title={`${row.driver}${row.team ? `, ${row.team}` : ""}`}>
              <div className="podium-code">
                <span>{row.code || row.driver.split(" ").at(-1)}</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {logo && <img src={logo} alt={row.team} width={18} height={18} />}
              </div>
              <div className="podium-time">{raceTime(time)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
