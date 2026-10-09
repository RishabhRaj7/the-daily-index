import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import Script from "next/script";
import { Big_Shoulders, IBM_Plex_Mono, Newsreader, Schibsted_Grotesk } from "next/font/google";
import "./globals.css";
import { EditionProvider } from "@/lib/edition-context";
import ReadingProgressBar from "@/components/chrome/ReadingProgressBar";
import MotionRuntime from "@/components/chrome/MotionRuntime";
import OnboardingGate from "@/components/onboarding/OnboardingGate";
import { getF1Roster } from "@/lib/live/f1";

// Four voices, one job each:
//   Newsreader        — headlines and reading text (serif, optical sizes)
//   Schibsted Grotesk — labels, navigation, UI (a grotesk drawn for news)
//   Big Shoulders     — the loud bits: section names, numbers, the wordmark
//   IBM Plex Mono     — data: times, levels, gaps, dates
const serif = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  variable: "--ff-serif",
  display: "swap",
});
const sans = Schibsted_Grotesk({ subsets: ["latin"], variable: "--ff-sans", display: "swap" });
const display = Big_Shoulders({
  subsets: ["latin"],
  axes: ["opsz"],
  variable: "--ff-display",
  display: "swap",
});
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--ff-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "The Daily Index",
  description: "An index of everything that matters today.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f3ef" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0d0f" },
  ],
};

// Picks morning/evening before first paint so the page never flashes the
// wrong theme while React hydrates. Mirrors lib/edition-context.tsx.
const THEME_BOOT = `(function(){try{var s=localStorage.getItem("daily-index:edition-override");var h=new Date().getHours();var m=s==="morning"||s==="evening"?s:(h>=18||h<5?"evening":"morning");document.documentElement.setAttribute("data-edition",m);}catch(e){}document.documentElement.classList.add("js");})();`;

export default async function RootLayout({ children }: { children: ReactNode }) {
  const f1Roster = await getF1Roster();

  return (
    <html
      lang="en"
      data-edition="morning"
      suppressHydrationWarning
      className={`${serif.variable} ${sans.variable} ${display.variable} ${mono.variable} h-full antialiased`}
    >
      <head>
        <Script id="theme-boot" strategy="beforeInteractive">
          {THEME_BOOT}
        </Script>
      </head>
      <body className="min-h-full flex flex-col">
        <EditionProvider>
          <ReadingProgressBar />
          <MotionRuntime />
          {children}
          <OnboardingGate f1Roster={f1Roster} />
        </EditionProvider>
      </body>
    </html>
  );
}
