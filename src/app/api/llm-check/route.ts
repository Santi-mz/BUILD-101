import { checkProviders } from "@/lib/llm/provider";

/** Diagnóstico: ¿responde la IA configurada? No muestra claves. Solo en desarrollo o con CRON_SECRET. */
export async function GET(req: Request) {
  const allowed = process.env.NODE_ENV !== "production" || req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
  if (!allowed) return new Response("No autorizado", { status: 401 });
  const r = await checkProviders();
  return Response.json({
    ...r,
    resumen: !r.configured.length
      ? "No hay ninguna clave configurada: la app usa el modo demo con reglas."
      : r.results.some((x) => x.ok)
        ? `La IA funciona (${r.results.filter((x) => x.ok).map((x) => x.provider).join(", ")}).`
        : "Ninguna IA responde. Mirá el error de cada una.",
  });
}
