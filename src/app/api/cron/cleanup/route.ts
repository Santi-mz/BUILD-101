import { store } from "@/lib/store";

/** Borrado diario de sesiones vencidas (RETENTION_DAYS). Vercel Cron manda "Authorization: Bearer <CRON_SECRET>". */
export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return new Response("No autorizado", { status: 401 });
  const deleted = await store().purgeExpired();
  await store().audit("retention.purge", null, { deleted });
  return Response.json({ deleted });
}
