import { fail } from "@/lib/api";
import { browserPreviewEnabled, previewEnvelope, readPreviewState } from "@/lib/preview-session";
import { publicView } from "@/lib/session";

/** Restaura el estado guardado en sessionStorage al recargar la página del Preview. */
export async function POST(req: Request) {
  if (!browserPreviewEnabled()) return fail(404, "not_found", "Esta función solo está disponible en Preview.");
  const payload = await req.json().catch(() => null);
  const s = readPreviewState(payload?.__previewState);
  if (!s) return fail(404, "expired", "La sesión de prueba terminó. Empezá una nueva.");
  return Response.json({ ...publicView(s), ...previewEnvelope(s) });
}
