"use client";

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";

// One way to open a driver, everywhere: any driver's name on the site (the
// championship tables, timing, the grid, the feed, the charts) is a
// DriverName, and a tap on it opens that driver's season (DriverSheet). The
// sheet itself is mounted once, by DriverSheetHost in the root layout, and
// loaded only when first opened.

const DriverSheet = dynamic(() => import("./DriverSheet"), { ssr: false });

let open: string | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());

/** Open a driver's season sheet (by timing code: "VER"). */
export function openDriver(code: string) {
  open = code.toUpperCase();
  emit();
}

function close() {
  open = null;
  emit();
}

export function DriverSheetHost() {
  const code = useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    () => open,
    () => null,
  );
  return code ? <DriverSheet code={code} onClose={close} /> : null;
}

/**
 * A driver's name that opens their season. Inside a row that does something
 * else on a tap (follow on the map), the name alone opens the sheet.
 */
export function DriverName({ code, children, className = "", title }: { code: string | null | undefined; children: React.ReactNode; className?: string; title?: string }) {
  if (!code || !/^[A-Z]{3}$/i.test(code)) return <span className={className}>{children}</span>;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        openDriver(code);
      }}
      className={`driver-link text-left min-w-0 ${className}`}
      title={title ?? `${code.toUpperCase()}: the season, round by round`}
    >
      {children}
    </button>
  );
}
