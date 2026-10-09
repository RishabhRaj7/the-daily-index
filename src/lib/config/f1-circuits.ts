// Track maps the site serves itself, from public/f1/circuits/<id>.png, keyed
// by Jolpica's circuitId. They are formula1.com's "Track icons 4x3/<Name>
// carbon.png" images (the same ones OpenF1's circuit_image points at), copied
// in so the map never depends on OpenF1 being unlocked.
//
// A circuit missing here (a new venue — Madrid and Sepang had no image at
// that address in Oct 2026) falls back to OpenF1's circuit_image, kept in the
// store per race weekend. To add one: save the PNG as public/f1/circuits/<id>.png
// and list the id below.
export const LOCAL_CIRCUITS: ReadonlySet<string> = new Set([
  "albert_park",
  "americas",
  "bahrain",
  "baku",
  "catalunya",
  "hungaroring",
  "imola",
  "interlagos",
  "jeddah",
  "losail",
  "marina_bay",
  "miami",
  "monaco",
  "monza",
  "red_bull_ring",
  "rodriguez",
  "shanghai",
  "silverstone",
  "spa",
  "suzuka",
  "vegas",
  "villeneuve",
  "yas_marina",
  "zandvoort",
]);
