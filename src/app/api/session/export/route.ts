import { fail } from "@/lib/api";
import { snapshot } from "@/lib/engine/profile";
import { loadSession } from "@/lib/session";

/** Descargar mi resumen y mis datos (acceso y exportación). */
export async function GET() {
  const s = await loadSession();
  if (!s) return fail(404, "no_session", "No hay sesión.");
  const data = {
    generado: new Date().toISOString(),
    aviso: "Esto refleja lo que charlamos, no es un test. Puede cambiar si exploramos más.",
    perfil: snapshot(s),
    evidencias: s.evidence.map(({ id, indicatorId, kind, status, quote, concrete, polarity, value, area, axis }) => ({ id, indicatorId, kind, status, quote, concrete, polarity, value, area, axis })),
    conversacion: s.messages.map((m) => ({ rol: m.role === "USER" ? "vos" : "agente", texto: m.content, fecha: m.createdAt })),
    rutas: s.recommendations.at(-1)?.routes.map((r) => ({ titulo: r.opportunity.title, estado: r.opportunity.status, fuente: r.opportunity.source_url, por_que: r.why_this })) ?? [],
    proximo_paso: s.nextStep,
    versiones: { rubrica: s.rubricVersion, prompts: s.promptVersion, modelo: s.model },
    vence: s.expiresAt,
  };
  return new Response(JSON.stringify(data, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": 'attachment; filename="mi-exploracion.json"' },
  });
}
