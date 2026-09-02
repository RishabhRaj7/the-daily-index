import { redirect } from "next/navigation";

export function generateStaticParams() {
  return [];
}

export default async function ArchiveDatePage() {
  redirect("/archive");
}
