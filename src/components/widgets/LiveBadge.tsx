export default function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1 font-label text-[9px] text-up">
      <span className="w-1.5 h-1.5 rounded-full bg-up inline-block animate-pulse" />
      Live
    </span>
  );
}
