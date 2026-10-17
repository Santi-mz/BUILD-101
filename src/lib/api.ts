import { z } from "zod";
import type { SessionState } from "@/lib/engine/types";
import { loadSession, publicView } from "@/lib/session";
import { store } from "@/lib/store";

/** Helpers de las rutas API: validación de entrada en el servidor y errores estructurados. */
export const fail = (status: number, code: string, message: string) => Response.json({ error: { code, message } }, { status });

export async function withSession(fn: (s: SessionState) => Promise<Response | void>): Promise<Response> {
  const s = await loadSession();
  if (!s) return fail(404, "no_session", "No hay una sesión activa. Empezá de nuevo desde el inicio.");
  try {
    const res = await fn(s);
    await store().save(s);
    return res ?? Response.json(publicView(s));
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 403) return fail(403, "forbidden", (err as Error).message);
    console.error(JSON.stringify({ event: "api.error", error: String(err).slice(0, 200) }));
    // No se pierde lo ya guardado: el estado anterior sigue en la base.
    return fail(500, "error", "Algo falló. Probá de nuevo en un momento.");
  }
}

export async function body<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T> | Response> {
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  return parsed.success ? parsed.data : fail(400, "bad_request", "Datos inválidos.");
}
