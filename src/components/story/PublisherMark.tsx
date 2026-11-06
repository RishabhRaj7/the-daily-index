import { publisherFor } from "@/lib/publishers";

// Who published something, as a reader recognises them: the logo beside the
// proper name, in place of a web address. Logos come in two versions, one for each
// paper colour (lib/publishers.ts), and globals.css shows the right one (.pub-logo).
// A publisher with no logo gets a letter tile in a colour taken from its name, so
// it's the same colour every time.

function hueOf(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 360;
  return h;
}

export function PublisherLogo({ source, size = 16 }: { source: string; size?: number }) {
  const { name, slug } = publisherFor(source);
  const box = { width: size, height: size };
  if (!slug) {
    return (
      <span
        aria-hidden="true"
        className="pub-letter"
        style={{ ...box, fontSize: Math.round(size * 0.62), background: `hsl(${hueOf(name)} 45% 38%)` }}
      >
        {name.replace(/^the\s+/i, "").charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/publishers/${slug}.light.png`} alt="" width={size} height={size} loading="lazy" className="pub-logo pub-on-light" style={box} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/publishers/${slug}.dark.png`} alt="" width={size} height={size} loading="lazy" className="pub-logo pub-on-dark" style={box} />
    </>
  );
}

export default function PublisherMark({ source, size = 16, className = "" }: { source: string; size?: number; className?: string }) {
  const { name } = publisherFor(source);
  return (
    <span className={`inline-flex items-center gap-1.5 min-w-0 ${className}`}>
      <PublisherLogo source={source} size={size} />
      <span className="truncate">{name}</span>
    </span>
  );
}
