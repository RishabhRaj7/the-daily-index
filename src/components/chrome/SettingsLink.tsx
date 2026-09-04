"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export const SETTINGS_RETURN_KEY = "daily-index:settings-return";

/** Link to /settings that remembers it was opened from the paper, so the
 *  settings page can close with router.back() (instant, from cache) instead
 *  of re-rendering the whole front page. */
export default function SettingsLink({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href="/settings"
      className={className}
      onClick={() => {
        try {
          sessionStorage.setItem(SETTINGS_RETURN_KEY, "back");
        } catch {}
      }}
    >
      {children}
    </Link>
  );
}
