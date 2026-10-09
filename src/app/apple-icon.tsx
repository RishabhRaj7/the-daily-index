import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";

// The home-screen icon: app/icon.svg (the site's mark — a dot grid tracing a
// rising index line) drawn at 180px on a full-bleed tile, since iOS rounds
// the corners itself.

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  const svg = readFileSync(join(process.cwd(), "src/app/icon.svg"), "utf8").replace('rx="14"', 'rx="0"');
  return new ImageResponse(
    (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`} width={180} height={180} alt="" />
    ),
    size,
  );
}
