import type { Metadata } from "next";
import "./globals.css";
import { EditionProvider } from "@/lib/edition-context";
import ReadingProgressBar from "@/components/chrome/ReadingProgressBar";
import OnboardingGate from "@/components/onboarding/OnboardingGate";
import { MY_CARDS } from "@/lib/config/cards";
import { getF1Roster } from "@/lib/live/f1";

export const metadata: Metadata = {
  title: "The Daily Index",
  description: "An index of everything that matters today.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const f1Roster = await getF1Roster();

  return (
    <html lang="en" data-edition="morning" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300..700&family=Source+Serif+4:wght@400;600&family=IBM+Plex+Mono:wght@400;500;600&family=Oswald:wght@500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full flex flex-col">
        <EditionProvider>
          <ReadingProgressBar />
          {children}
          <OnboardingGate creditCards={MY_CARDS} f1Roster={f1Roster} />
        </EditionProvider>
      </body>
    </html>
  );
}
