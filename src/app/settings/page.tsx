import { MY_CARDS } from "@/lib/config/cards";
import { getF1Roster } from "@/lib/live/f1";
import SettingsPageClient from "@/components/settings/SettingsPageClient";

export const metadata = { title: "Settings — The Daily Index" };

export default async function SettingsPage() {
  const f1Roster = await getF1Roster();
  return <SettingsPageClient creditCards={MY_CARDS} f1Roster={f1Roster} />;
}
