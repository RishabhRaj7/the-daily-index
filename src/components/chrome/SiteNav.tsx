"use client";

import TopBar from "@/components/chrome/TopBar";
import { Rail } from "@/components/chrome/PaperNav";
import { useSavedMenu } from "@/lib/nav-menu";

// The menu on the archive and settings, so moving between them moves nothing (the
// live centre has the same menu with its own views, f1/LiveNav.tsx): from 1500px the paper's side menu, and on a
// tablet or laptop its words in the top bar, each going back to that part of the
// paper. Its page wraps it in `.page-scale.with-rail`, as the paper does, so it sits
// at the same size in the same place. A phone keeps the plain top bar: settings has
// its save bar along the foot of the screen.

export default function SiteNav() {
  const menu = useSavedMenu();
  return (
    <>
      <TopBar chapters={menu.chapters} linkBase="/" alwaysShowLogo />
      <Rail chapters={menu.chapters} active="" section={null} date={menu.date} issue={menu.issue} base="/" />
    </>
  );
}
