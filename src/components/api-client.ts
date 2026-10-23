"use client";

import type { PublicSession } from "@/lib/session";

export type View = PublicSession & { reply?: string; safety?: boolean };
export type ApiError = { error: { code: string; message: string } };

type PreviewResult = View & { __previewState?: unknown; previewStorage?: string };
const PREVIEW_KEY = "rumbo.preview.session";
function readPreview() {
  try { return JSON.parse(sessionStorage.getItem(PREVIEW_KEY) || "null"); } catch { return null; }
}
function savePreview(data: PreviewResult) {
  if (data.previewStorage !== "browser" || !data.__previewState) return;
  try { sessionStorage.setItem(PREVIEW_KEY, JSON.stringify(data.__previewState)); } catch { /* solo demo */ }
}

/** Llamada a la API propia; devuelve la vista de la sesión o un error legible. */
export async function call(path: string, init?: { method?: string; body?: unknown }): Promise<{ view?: View; error?: string; status: number }> {
  try {
    const previous = readPreview();
    const restoring = path === "/api/session" && !init?.body && previous;
    const actualPath = restoring ? "/api/preview-session" : path;
    const payload = restoring ? { __previewState: previous } : init?.body && typeof init.body === "object" ? { ...init.body, ...(previous ? { __previewState: previous } : {}) } : init?.body;
    const res = await fetch(actualPath, {
      method: restoring ? "POST" : init?.method ?? (payload ? "POST" : "GET"),
      headers: payload ? { "Content-Type": "application/json" } : undefined,
      body: payload ? JSON.stringify(payload) : undefined,
    });
    const data = (await res.json().catch(() => null)) as View | ApiError | null;
    if (!res.ok) {
      if (restoring && res.status === 404) sessionStorage.removeItem(PREVIEW_KEY);
      return { error: (data as ApiError | null)?.error?.message ?? "Algo falló. Probá de nuevo.", status: res.status };
    }
    if (init?.method === "DELETE") sessionStorage.removeItem(PREVIEW_KEY);
    else if (data) savePreview(data as PreviewResult);
    return { view: data as View, status: res.status };
  } catch {
    return { error: "No pude conectarme. Revisá tu conexión y probá de nuevo.", status: 0 };
  }
}
