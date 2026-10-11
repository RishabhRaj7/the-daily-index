"use client";

import { useEffect, useRef } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import type { TrackGeo } from "@/lib/f1-live-types";

// Satellite imagery under the track map. The map is drawn as before — the
// outline, the cars, the overlays, our zoom and follow — and Mapbox only
// paints the ground beneath it, its camera kept exactly under our view: the
// circuit's fit (lib/live/f1-geo.ts) turns the view's box into a centre, a
// zoom and a compass bearing. Loaded only when the reader picks Satellite.

export const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const M = 111_320;

/** A point in the model's box as [longitude, latitude]. */
export function toLngLat(g: TrackGeo, x: number, y: number): [number, number] {
  const yy = g.m * y;
  const e = g.s * (Math.cos(g.a) * x - Math.sin(g.a) * yy) + g.tx;
  const n = g.s * (Math.sin(g.a) * x + Math.cos(g.a) * yy) + g.ty;
  return [g.lon0 + e / (Math.cos((g.lat0 * Math.PI) / 180) * M), g.lat0 + n / M];
}

/** Mapbox's camera for our view: same centre, same metres per pixel, the model's x along the screen. */
function cameraFor(g: TrackGeo, box: ViewBox, width: number, height: number) {
  // The SVG fits its box both ways (meet): the larger ratio sets the scale.
  const units = Math.max(box.w / Math.max(1, width), box.h / Math.max(1, height));
  const metres = g.s * units;
  const [lng, lat] = toLngLat(g, box.x + box.w / 2, box.y + box.h / 2);
  const zoom = Math.log2((40_075_016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * metres));
  return { center: [lng, lat] as [number, number], zoom, bearing: (-g.a * 180) / Math.PI, pitch: 0 };
}

export default function Satellite({ geo, view, follow }: { geo: TrackGeo; view: React.RefObject<ViewBox>; follow: React.RefObject<((box: ViewBox) => void) | null> }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el || !MAPBOX_TOKEN) return;
    let map: import("mapbox-gl").Map | null = null;
    let gone = false;
    const jump = (b: ViewBox) => map?.jumpTo(cameraFor(geo, b, el.clientWidth, el.clientHeight));
    const ro = new ResizeObserver(() => {
      map?.resize();
      jump(view.current);
    });
    import("mapbox-gl").then(({ default: mapboxgl }) => {
      if (gone) return;
      mapboxgl.accessToken = MAPBOX_TOKEN;
      map = new mapboxgl.Map({
        container: el,
        style: "mapbox://styles/mapbox/satellite-v9",
        interactive: false,
        attributionControl: false,
        fadeDuration: 0,
        ...cameraFor(geo, view.current, el.clientWidth, el.clientHeight),
      });
      map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");
      follow.current = jump;
      ro.observe(el);
    });
    return () => {
      gone = true;
      follow.current = null;
      ro.disconnect();
      map?.remove();
    };
  }, [geo, view, follow]);
  // Mapbox's stylesheet makes its container position: relative, so it sits in a layer of its own.
  return (
    <div className="absolute inset-0 rounded-xl overflow-hidden" aria-hidden="true">
      <div ref={box} className="w-full h-full" />
    </div>
  );
}
