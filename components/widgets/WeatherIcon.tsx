// WMO code → icon mapping. All icons use currentColor + strokeLinecap="round"
// so they look at home in both light and dark themes.

function Sun({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="24" cy="24" r="8" />
      <line x1="24" y1="4"  x2="24" y2="10" />
      <line x1="24" y1="38" x2="24" y2="44" />
      <line x1="4"  y1="24" x2="10" y2="24" />
      <line x1="38" y1="24" x2="44" y2="24" />
      <line x1="9"  y1="9"  x2="13.2" y2="13.2" />
      <line x1="34.8" y1="34.8" x2="39" y2="39" />
      <line x1="39" y1="9"  x2="34.8" y2="13.2" />
      <line x1="13.2" y1="34.8" x2="9"  y2="39" />
    </svg>
  );
}

function Cloud({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M34 34H14a9 9 0 01-1-17.9A11 11 0 0135 22a7 7 0 01-1 12z" />
    </svg>
  );
}

function SunCloud({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {/* small sun top-left */}
      <circle cx="17" cy="16" r="6" />
      <line x1="17" y1="6"  x2="17" y2="9" />
      <line x1="17" y1="23" x2="17" y2="25" />
      <line x1="7"  y1="16" x2="10" y2="16" />
      <line x1="24" y1="16" x2="27" y2="16" />
      <line x1="10" y1="9"  x2="12" y2="11" />
      <line x1="22" y1="21" x2="24" y2="23" />
      <line x1="24" y1="9"  x2="22" y2="11" />
      <line x1="12" y1="21" x2="10" y2="23" />
      {/* cloud below-right */}
      <path d="M36 40H20a7 7 0 01-.8-14 9 9 0 0117.6 3.5A5.5 5.5 0 0136 40z" />
    </svg>
  );
}

function Fog({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
      <line x1="8" y1="16" x2="40" y2="16" />
      <line x1="8" y1="24" x2="36" y2="24" />
      <line x1="8" y1="32" x2="32" y2="32" />
    </svg>
  );
}

function Rain({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M34 30H14a9 9 0 01-1-17.9A11 11 0 0135 18a7 7 0 01-1 12z" />
      <line x1="16" y1="36" x2="14" y2="42" />
      <line x1="24" y1="36" x2="22" y2="42" />
      <line x1="32" y1="36" x2="30" y2="42" />
    </svg>
  );
}

function Thunder({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M34 28H14a9 9 0 01-1-17.9A11 11 0 0135 16a7 7 0 01-1 12z" />
      <polyline points="27,30 22,38 26,38 21,46" />
    </svg>
  );
}

function Snow({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M34 30H14a9 9 0 01-1-17.9A11 11 0 0135 18a7 7 0 01-1 12z" />
      <line x1="16" y1="38" x2="16" y2="44" />
      <line x1="13" y1="41" x2="19" y2="41" />
      <line x1="24" y1="38" x2="24" y2="44" />
      <line x1="21" y1="41" x2="27" y2="41" />
      <line x1="32" y1="38" x2="32" y2="44" />
      <line x1="29" y1="41" x2="35" y2="41" />
    </svg>
  );
}

export default function WeatherIcon({
  code,
  size = 40,
}: {
  code: number;
  size?: number;
}) {
  if (code === 0) return <Sun size={size} />;
  if (code <= 3) return <SunCloud size={size} />;
  if (code === 45 || code === 48) return <Fog size={size} />;
  if (code >= 51 && code <= 67) return <Rain size={size} />;
  if (code >= 71 && code <= 77) return <Snow size={size} />;
  if (code >= 80 && code <= 82) return <Rain size={size} />;
  if (code >= 85 && code <= 86) return <Snow size={size} />;
  if (code >= 95) return <Thunder size={size} />;
  return <Cloud size={size} />;
}
