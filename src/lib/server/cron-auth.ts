// Vercel Cron calls with `Authorization: Bearer $CRON_SECRET` when the
// CRON_SECRET environment variable is set. Without it anyone could trigger
// builds, so the cron routes refuse to run at all until it is configured.
export function isCronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}
