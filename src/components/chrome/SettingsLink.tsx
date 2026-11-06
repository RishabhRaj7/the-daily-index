"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";

export const SETTINGS_RETURN_KEY = "daily-index:settings-return";

/**
 * Close settings. Going *back* restores the paper from the router's cache
 * instantly; pushing "/" would re-run the whole server render (fetching every
 * feed again), which reads like a reload.
 */
export function leaveSettings(router: ReturnType<typeof useRouter>): void {
  let cameFromPaper = false;
  try {
    cameFromPaper = sessionStorage.getItem(SETTINGS_RETURN_KEY) === "back";
    sessionStorage.removeItem(SETTINGS_RETURN_KEY);
  } catch {}
  if (cameFromPaper && window.history.length > 1) router.back();
  else router.push("/");
}

/**
 * The way into settings, which remembers it was opened from the paper so settings
 * can close instantly (leaveSettings). On settings itself it's the way out, the
 * same as the archive's icon on the archive. Settings holds it back while there are
 * unsaved changes (SettingsPageClient).
 */
export default function SettingsLink({
  className,
  children,
}: {
  className?: string;
  /** Text, or an icon drawn by whether settings is the page you're on. */
  children: ReactNode | ((current: boolean) => ReactNode);
}) {
  const router = useRouter();
  const current = usePathname() === "/settings";
  const onClick = (e: MouseEvent) => {
    if (current) {
      e.preventDefault();
      leaveSettings(router);
      return;
    }
    try {
      sessionStorage.setItem(SETTINGS_RETURN_KEY, "back");
    } catch {}
  };
  // An icon has no words of its own; a text link keeps its own.
  const icon = typeof children === "function";
  const label = current ? "Back to the paper" : "Settings";
  return (
    <Link
      href={current ? "/" : "/settings"}
      className={className}
      title={icon ? label : undefined}
      aria-label={icon ? label : undefined}
      aria-current={current ? "page" : undefined}
      onClick={onClick}
    >
      {typeof children === "function" ? children(current) : children}
    </Link>
  );
}
