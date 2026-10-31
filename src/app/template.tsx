"use client";

import type { ReactNode } from "react";

// Every page fades in as it arrives (a template mounts afresh on each
// navigation, unlike the layout): the paper, the live centre, the archive
// and settings all hand over the same way. Opacity only — a transform here
// would pull the pages' fixed bars and sheets out of place while it ran.
// The loading.tsx skeletons cover the wait before a page is ready.

export default function Template({ children }: { children: ReactNode }) {
  return <div className="page-in flex-1 flex flex-col min-h-0">{children}</div>;
}
