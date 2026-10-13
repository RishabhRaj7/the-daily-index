"use client";

import { useEffect, useRef, useState } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import type { TrackGeo, TrackModel } from "@/lib/f1-live-types";
import { findCover, type Structure } from "@/lib/f1-cover";

// The circuit in 3D, among the city around it: Mapbox's Standard map at
// night (its buildings and landmarks in 3D), tilted, with the track laid on
// the ground where it really runs (lib/live/f1-geo.ts places each circuit by
// fitting its outline to its GPS racing line). The track is drawn as map
// lines, so a building in front hides it as it would; the cars and badges are
// small markers above everything, so they stay readable. The cars move as on
// the basic map: TrackMap's frame loop places them, and this reads where.
//
// Bridges and tunnels: the map knows which roads are bridges or tunnels, not
// how high they stand (lib/f1-cover.ts). The roads that cross over the track
// are drawn again above it, and a car under one — or in a tunnel the track
// runs through — is dimmed until it comes out the other side. So is a car the
// map draws a building over (a raised walkway mapped as a building, or a
// tower between the camera and the track).
//
// Height: the ground is raised from Mapbox's terrain (a little exaggerated,
// so a circuit's climbs show), and the track, the lane and the cars sit on
// it. Under the map, the lap's profile — its height from the line round to
// the line — with the followed car on it; hidden where a circuit is flat.
// Loaded only when the reader picks 3D (and a token is set).

export const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

const M = 111_320;

/** A point in the model's box as [longitude, latitude]. */
export function toLngLat(g: TrackGeo, x: number, y: number): [number, number] {
  const yy = g.m * y;
  const e = g.s * (Math.cos(g.a) * x - Math.sin(g.a) * yy) + g.tx;
  const n = g.s * (Math.sin(g.a) * x + Math.cos(g.a) * yy) + g.ty;
  return [g.lon0 + e / (Math.cos((g.lat0 * Math.PI) / 180) * M), g.lat0 + n / M];
}

export interface CityCar {
  code: string;
  colour: string;
  fill: string;
  ring: string;
  mine: boolean;
  label: boolean;
  /** In the pits: its place in the lane (else the frame loop's place). */
  pit?: [number, number];
}

export interface CityBadge {
  key: string;
  x: number;
  y: number;
  text: string;
  colour: string;
  ink: string;
  round: boolean;
}

export interface CityApi {
  zoomBy: (factor: number) => void;
  reset: () => void;
  /** Close in on a car (to follow it). */
  closeIn: (code: string) => void;
  /** Turn the map a step: 1 clockwise, −1 anticlockwise. */
  rotate: (dir: 1 | -1) => void;
}

const line = (g: TrackGeo, pts: [number, number][]) => ({
  type: "Feature" as const,
  properties: {},
  geometry: { type: "LineString" as const, coordinates: pts.map(([x, y]) => toLngLat(g, x, y)) },
});

export default function City3D({
  model,
  geo,
  cars,
  spots,
  badges,
  edges,
  follow,
  onFocus,
  onLeaveFollow,
  api,
  big,
  turn,
}: {
  model: TrackModel;
  geo: TrackGeo;
  cars: CityCar[];
  /** Where each running car is now — the model's box, and its share of the lap (written every frame by TrackMap). */
  spots: React.RefObject<Map<string, [number, number, number]>>;
  badges: CityBadge[];
  /** Each sector's stretch, for the coloured edges (null: off). */
  edges: { pts: [number, number][]; colour: string }[] | null;
  /** The car the camera rides with. */
  follow: React.RefObject<string | null>;
  onFocus?: (code: string) => void;
  onLeaveFollow: () => void;
  api: React.RefObject<CityApi | null>;
  big: boolean;
  /** The basic map's turn (degrees clockwise), for the first view. */
  turn: number;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("mapbox-gl").Map | null>(null);
  const libRef = useRef<typeof import("mapbox-gl").default | null>(null);
  const markers = useRef(new Map<string, { m: import("mapbox-gl").Marker; el: HTMLDivElement; html: string; op: string }>());
  const badgeMarks = useRef<import("mapbox-gl").Marker[]>([]);
  const carsRef = useRef(cars);
  const focusRef = useRef(onFocus);
  const leaveRef = useRef(onLeaveFollow);
  const turnRef = useRef(turn);
  /** The track's points under a bridge or in a tunnel. */
  const coverRef = useRef<Uint8Array | null>(null);
  const [ready, setReady] = useState(false);
  /** The lap's height, metres, sampled along it (null until read, or a flat circuit). */
  const [profile, setProfile] = useState<{ f: number[]; h: number[] } | null>(null);

  useEffect(() => {
    carsRef.current = cars;
    focusRef.current = onFocus;
    leaveRef.current = onLeaveFollow;
  });

  // The map, once per circuit.
  useEffect(() => {
    const el = box.current;
    const outer = frame.current;
    if (!el || !outer || !MAPBOX_TOKEN) return;
    let gone = false;
    let map: import("mapbox-gl").Map | null = null;
    // Kept fitted to its box until the reader moves the camera.
    let moved = false;
    // The page is zoomed on big screens (.page-scale), which Mapbox doesn't
    // allow for: the map undoes it and is sized in real screen pixels.
    const size = () => {
      const r = outer.getBoundingClientRect();
      const z = outer.clientWidth ? r.width / outer.clientWidth : 1;
      el.style.zoom = String(1 / z);
      el.style.width = `${r.width}px`;
      el.style.height = `${r.height}px`;
    };
    size();
    const ro = new ResizeObserver(() => {
      size();
      map?.resize();
      if (!moved) map?.fitBounds(bounds, { ...fit, duration: 0 });
    });
    const loop = model.points.concat([model.points[0]]) as [number, number][];
    const coords = loop.map(([x, y]) => toLngLat(geo, x, y));
    const lngs = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    const bounds: [[number, number], [number, number]] = [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
    ];
    // Turned so the circuit faces the way it does on the basic map.
    const bearing = (-geo.a * 180) / Math.PI - turnRef.current;
    // Clear of the toolbar (top left) and the buttons (bottom right).
    const fit = { padding: { top: 48, bottom: 28, left: 28, right: 56 }, pitch: 50, bearing };
    import("mapbox-gl").then(({ default: mapboxgl }) => {
      if (gone) return;
      libRef.current = mapboxgl;
      mapboxgl.accessToken = MAPBOX_TOKEN;
      map = new mapboxgl.Map({
        container: el,
        style: "mapbox://styles/mapbox/standard",
        config: { basemap: { lightPreset: "night", showPointOfInterestLabels: false, showTransitLabels: false, showRoadLabels: false } },
        bounds,
        fitBoundsOptions: fit,
        attributionControl: false,
        // On the page a scroll or a one-finger drag should move the page.
        cooperativeGestures: !big,
        maxPitch: 75,
      });
      mapRef.current = map;
      map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-left");
      map.on("dragstart", (e) => {
        if ((e as { originalEvent?: Event }).originalEvent) leaveRef.current();
      });
      map.on("movestart", (e) => {
        if ((e as { originalEvent?: Event }).originalEvent) moved = true;
      });
      map.on("style.load", () => {
        if (!map) return;
        // The ground's height (the lines and markers follow it).
        map.addSource("dem", { type: "raster-dem", url: "mapbox://mapbox.mapbox-terrain-dem-v1", tileSize: 512, maxzoom: 14 });
        map.setTerrain({ source: "dem", exaggeration: EXAGGERATE });
        const emissive = { "line-emissive-strength": 1 };
        map.addSource("track", { type: "geojson", data: line(geo, loop) });
        if (model.pit && model.pit.length > 1) {
          map.addSource("lane", { type: "geojson", data: line(geo, model.pit) });
          map.addLayer({ id: "lane-edge", type: "line", source: "lane", slot: "middle", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#c9ccd6", "line-width": ["interpolate", ["exponential", 2], ["zoom"], 13, 2.5, 15, 5, 18, 20], ...emissive } });
          map.addLayer({ id: "lane", type: "line", source: "lane", slot: "middle", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#23262f", "line-width": ["interpolate", ["exponential", 2], ["zoom"], 13, 1.4, 15, 3, 18, 13], ...emissive } });
        }
        map.addLayer({ id: "track-edge", type: "line", source: "track", slot: "middle", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#e6e8ef", "line-width": ["interpolate", ["exponential", 2], ["zoom"], 13, 6, 15, 10, 18, 40], ...emissive } });
        map.addSource("edges", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({ id: "edges", type: "line", source: "edges", slot: "middle", layout: { "line-join": "round" }, paint: { "line-color": ["get", "colour"], "line-opacity": 0.85, "line-width": ["interpolate", ["exponential", 2], ["zoom"], 13, 6, 15, 10, 18, 40], ...emissive } });
        map.addLayer({ id: "track", type: "line", source: "track", slot: "middle", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#262932", "line-width": ["interpolate", ["exponential", 2], ["zoom"], 13, 3.6, 15, 6.5, 18, 28], ...emissive } });

        // The bridges over the track, drawn again on top of it (their width in metres, as pixels at each zoom).
        map.addSource("over", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        const metres = (k: number) => ["interpolate", ["exponential", 2], ["zoom"], 12, ["*", ["get", "w"], k / 38], 18, ["*", ["get", "w"], k / 0.6]];
        map.addLayer({ id: "over-case", type: "line", source: "over", slot: "middle", layout: { "line-cap": "butt" }, paint: { "line-color": "#151924", "line-width": metres(1.15) as never, ...emissive } });
        map.addLayer({ id: "over", type: "line", source: "over", slot: "middle", layout: { "line-cap": "butt" }, paint: { "line-color": "#3a4152", "line-width": metres(1) as never, ...emissive } });
        // The roads, bridges and tunnels: Mapbox Streets, read but not drawn.
        map.addSource("streets", { type: "vector", url: "mapbox://mapbox.mapbox-streets-v8" });
        map.addLayer({ id: "structures", type: "line", source: "streets", "source-layer": "road", slot: "bottom", paint: { "line-opacity": 0 } });
        setReady(true);
      });
      let seen = -1;
      const trackLL = model.points.map(([x, y]) => toLngLat(geo, x, y));
      // The lap's height, read once the terrain under the whole circuit has loaded.
      let heights = false;
      map.on("idle", () => {
        if (!heights && map) {
          const step = Math.max(1, Math.floor(trackLL.length / 240));
          const f: number[] = [];
          const h: number[] = [];
          for (let i = 0; i < trackLL.length; i += step) {
            const e = map.queryTerrainElevation(trackLL[i], { exaggerated: false });
            if (e === null || e === undefined) break;
            f.push(model.fraction[i] ?? i / trackLL.length);
            h.push(e);
          }
          if (h.length && f.length === Math.ceil(trackLL.length / step)) {
            heights = true;
            // The ground model is noisy in a city (a bridge, an embankment): a
            // running median, then a running mean, round the loop, before the
            // rise and fall is measured.
            const n = h.length;
            const at = (i: number) => h[((i % n) + n) % n];
            const med = h.map((_, i) => [-4, -3, -2, -1, 0, 1, 2, 3, 4].map((k) => at(i + k)).sort((a, b) => a - b)[4]);
            const smooth = med.map((_, i) => [-3, -2, -1, 0, 1, 2, 3].reduce((sum, k) => sum + med[((i + k) % n + n) % n], 0) / 7);
            const range = Math.max(...smooth) - Math.min(...smooth);
            setProfile(range >= FLAT ? { f, h: smooth } : null);
          }
        }
        if (!map?.getSource("streets")) return;
        const found = map.querySourceFeatures("streets", { sourceLayer: "road" });
        if (found.length === seen) return;
        seen = found.length;
        type Found = { geometry: { type: string; coordinates: unknown[] }; properties: Record<string, unknown> | null };
        const structures: Structure[] = (found as unknown as Found[]).flatMap((f) => {
          const g = f.geometry;
          const lines = g.type === "LineString" ? [g.coordinates] : g.type === "MultiLineString" ? g.coordinates : [];
          const st = f.properties?.structure;
          const structure = st === "bridge" || st === "tunnel" ? st : "none";
          return lines.length ? [{ structure, cls: String(f.properties?.class ?? ""), lines: lines as [number, number][][] }] : [];
        });
        const cover = findCover(trackLL, structures);
        coverRef.current = cover.covered;
        (map.getSource("over") as import("mapbox-gl").GeoJSONSource | undefined)?.setData({
          type: "FeatureCollection",
          features: cover.over.map((o) => ({ type: "Feature", properties: { w: o.w }, geometry: { type: "LineString", coordinates: o.line } })),
        });
      });
      ro.observe(outer);
      api.current = {
        zoomBy: (f) => {
          moved = true;
          map?.easeTo({ zoom: map.getZoom() + Math.log2(f), duration: 300 });
        },
        closeIn: (code) => {
          moved = true;
          const c = carsRef.current.find((x) => x.code === code);
          const at = c?.pit ?? spots.current.get(code);
          map?.easeTo({ zoom: Math.max(map.getZoom(), 16.2), ...(at ? { center: toLngLat(geo, at[0], at[1]) } : {}), duration: 700 });
        },
        reset: () => {
          moved = false;
          map?.fitBounds(bounds, { ...fit, bearing: map.getBearing(), duration: 600 });
        },
        rotate: (dir) => {
          moved = true;
          map?.easeTo({ bearing: map.getBearing() - dir * 45, duration: 500 });
        },
      };
    });
    const mk = markers.current;
    return () => {
      gone = true;
      ro.disconnect();
      api.current = null;
      mk.clear();
      badgeMarks.current = [];
      setReady(false);
      mapRef.current = null;
      map?.remove();
    };
  }, [model, geo, api, big, spots]);

  // The sector-coloured edges.
  useEffect(() => {
    const src = ready ? (mapRef.current?.getSource("edges") as import("mapbox-gl").GeoJSONSource | undefined) : undefined;
    src?.setData({ type: "FeatureCollection", features: (edges ?? []).map((e) => ({ ...line(geo, e.pts), properties: { colour: e.colour } })) });
  }, [edges, geo, ready]);

  // Sector and corner badges.
  useEffect(() => {
    const map = mapRef.current;
    const gl = libRef.current;
    if (!ready || !map || !gl) return;
    const made = badges.map((b) => {
      const el = document.createElement("div");
      el.textContent = b.text;
      el.style.cssText = `font:800 10.5px var(--font-sans),system-ui,sans-serif;color:${b.ink};background:${b.colour};${
        b.round ? "width:20px;height:20px;border-radius:50%;border:1.5px solid rgba(255,255,255,.85)" : "padding:2px 7px;border-radius:999px"
      };display:grid;place-items:center;box-shadow:0 1px 4px rgba(0,0,0,.5);pointer-events:none`;
      return new gl.Marker({ element: el }).setLngLat(toLngLat(geo, b.x, b.y)).addTo(map);
    });
    badgeMarks.current = made;
    return () => made.forEach((m) => m.remove());
  }, [badges, geo, ready]);

  // The cars: markers made and dropped as the field changes, moved every frame.
  useEffect(() => {
    const map = mapRef.current;
    const gl = libRef.current;
    if (!ready || !map || !gl) return;
    const mk = markers.current;
    const want = new Set(cars.map((c) => c.code));
    for (const [code, v] of mk)
      if (!want.has(code)) {
        v.m.remove();
        mk.delete(code);
      }
    for (const c of cars) {
      let v = mk.get(c.code);
      if (!v) {
        const el = document.createElement("div");
        // (no position here: Mapbox places markers absolutely, which also holds the label)
        el.style.cursor = "pointer";
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          focusRef.current?.(c.code);
        });
        v = { m: new gl.Marker({ element: el }).setLngLat(toLngLat(geo, ...(c.pit ?? model.points[0]))).addTo(map), el, html: "", op: "1" };
        mk.set(c.code, v);
      }
      const size = c.mine ? 16 : 12;
      v.el.style.zIndex = c.mine ? "2" : "1";
      // (one body, faded under a bridge or in a tunnel; rebuilt only when it
      // looks different, and at the opacity it had, so a live update doesn't
      // flash a dimmed car back to full)
      const html =
        `<span class="car-body" style="display:block;transition:opacity .3s ease;opacity:${v.op}">` +
        (c.mine ? `<span style="position:absolute;left:50%;top:50%;width:30px;height:30px;margin:-15px 0 0 -15px;border-radius:50%;background:${c.colour};opacity:.25" class="car-pulse"></span>` : "") +
        `<span style="display:block;width:${size}px;height:${size}px;border-radius:50%;background:${c.fill};border:2.5px solid ${c.ring};box-shadow:0 0 6px rgba(0,0,0,.6)"></span>` +
        (c.label
          ? `<span style="position:absolute;left:${size}px;bottom:${size - 2}px;font:700 ${c.mine ? 13 : 11}px var(--font-sans),system-ui,sans-serif;color:#fff;text-shadow:0 0 3px #000,0 0 3px #000;white-space:nowrap;pointer-events:none">${c.code}</span>`
          : "") +
        `</span>`;
      if (html.replace(/;opacity:[\d.]+/, "") !== v.html.replace(/;opacity:[\d.]+/, "")) {
        v.el.innerHTML = html;
        v.html = html;
      }
    }
  }, [cars, geo, model, ready]);

  // Every frame: the cars where the basic map's loop put them, the camera with the followed one.
  useEffect(() => {
    if (!ready) return;
    let raf = 0;
    // Hidden behind or under a building, as drawn: asked of the map a few
    // times a second (a link bridge over the road, a tower between the
    // camera and the track).
    const hidden = new Map<string, boolean>();
    // Once behind a building, a car stays dimmed until it has been clear for
    // a moment: a building's edge or a tile redrawing would otherwise flick
    // it bright and dim again.
    const dimUntil = new Map<string, number>();
    let asked = 0;
    const frame = (now: number) => {
      const map = mapRef.current;
      const covered = coverRef.current;
      const ask = !!map && now - asked > 150;
      if (ask) asked = now;
      for (const c of carsRef.current) {
        const v = markers.current.get(c.code);
        const at = c.pit ?? spots.current.get(c.code);
        if (!v || !at) continue;
        const ll = toLngLat(geo, at[0], at[1]);
        v.m.setLngLat(ll);
        if (ask && map) {
          let behind = false;
          try {
            behind = map.queryRenderedFeatures(map.project(ll), { target: { featuresetId: "buildings", importId: "basemap" } }).length > 0;
          } catch {}
          hidden.set(c.code, behind);
        }
        // A bridge or tunnel is known exactly from the track; only the building
        // check (one pixel, a few times a second) is held over its flicker.
        if (hidden.get(c.code)) dimUntil.set(c.code, now + 300);
        const under = now < (dimUntil.get(c.code) ?? 0) || (!c.pit && !!covered && covered[pointIndex(model.fraction, spots.current.get(c.code)?.[2] ?? 0)] > 0);
        const body = v.el.firstElementChild as HTMLElement | null;
        // Dimmed, not hidden: still followable, without blinking out. It
        // fades out gently and comes back quickly, as it clears the cover.
        const op = under ? "0.3" : "1";
        v.op = op;
        if (body && body.style.opacity !== op) {
          body.style.transition = `opacity ${under ? ".3s" : ".12s"} ease`;
          body.style.opacity = op;
        }
        if (map && follow.current === c.code && !map.isMoving()) map.setCenter(ll);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [ready, geo, spots, follow, model]);

  // Mapbox's stylesheet makes its container position: relative, so it sits in a layer of its own.
  return (
    <div ref={frame} className="absolute inset-0 rounded-xl overflow-hidden bg-[#0b0e17]">
      <div ref={box} />
      {profile && <Profile profile={profile} spots={spots} follow={follow} />}
    </div>
  );
}

/** How much the ground is raised (×), and the least rise and fall worth a profile (metres). */
const EXAGGERATE = 1.5;
const FLAT = 8;

/** The lap's height from the line round to the line, with the followed car on it. */
function Profile({ profile, spots, follow }: { profile: { f: number[]; h: number[] }; spots: React.RefObject<Map<string, [number, number, number]>>; follow: React.RefObject<string | null> }) {
  const dot = useRef<SVGCircleElement>(null);
  const W = 240;
  const H = 46;
  const lo = Math.min(...profile.h);
  const hi = Math.max(...profile.h);
  const span = hi - lo || 1;
  const x = (f: number) => 4 + f * (W - 8);
  const y = (h: number) => 6 + (1 - (h - lo) / span) * (H - 14);
  const pts = profile.f.map((f, i) => `${x(f).toFixed(1)},${y(profile.h[i]).toFixed(1)}`);
  const heightAt = (f: number) => {
    let i = 0;
    while (i < profile.f.length - 1 && profile.f[i + 1] <= f) i++;
    return profile.h[i];
  };
  // The followed car, every frame.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const code = follow.current;
      const at = code ? spots.current.get(code) : undefined;
      const el = dot.current;
      if (el) {
        if (at) {
          el.setAttribute("cx", x(at[2] % 1).toFixed(1));
          el.setAttribute("cy", y(heightAt(at[2] % 1)).toFixed(1));
          el.style.opacity = "1";
        } else el.style.opacity = "0";
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, spots, follow]);
  return (
    <div className="absolute left-10 bottom-8 w-[min(15rem,52%)] rounded-lg bg-[rgba(11,14,23,0.78)] border border-white/10 px-2 pt-1 pb-0.5 pointer-events-none" aria-label={`Height round the lap: ${Math.round(span)} m from lowest to highest`}>
      <div className="flex justify-between font-mono text-[9px] text-white/60">
        <span>Height</span>
        <span>{Math.round(span)} m rise and fall</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full h-auto">
        <polygon points={`${x(profile.f[0])},${H - 6} ${pts.join(" ")} ${x(profile.f[profile.f.length - 1])},${H - 6}`} fill="rgba(140,170,255,0.16)" />
        <polyline points={pts.join(" ")} fill="none" stroke="#9fb4ff" strokeWidth="1.4" strokeLinejoin="round" />
        <circle ref={dot} r="3.2" fill="#fff" stroke="#0b0e17" strokeWidth="1.2" style={{ opacity: 0 }} />
      </svg>
    </div>
  );
}

/** The track point at a share of the lap (the fractions run up from 0). */
function pointIndex(fraction: number[], f: number): number {
  let lo = 0;
  let hi = fraction.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (fraction[mid] <= f) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
