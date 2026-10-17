"use client";

import type { PublicSession } from "@/lib/session";

export type View = PublicSession & { reply?: string; safety?: boolean };
export type ApiError = { error: { code: string; message: string } };

/** Llamada a la API propia; devuelve la vista de la sesión o un error legible. */
export async function call(path: string, init?: { method?: string; body?: unknown }): Promise<{ view?: View; error?: string; status: number }> {
  try {
    const res = await fetch(path, {
      method: init?.method ?? (init?.body ? "POST" : "GET"),
      headers: init?.body ? { "Content-Type": "application/json" } : undefined,
      body: init?.body ? JSON.stringify(init.body) : undefined,
    });
    const data = (await res.json().catch(() => null)) as View | ApiError | null;
    if (!res.ok) return { error: (data as ApiError | null)?.error?.message ?? "Algo falló. Probá de nuevo.", status: res.status };
    return { view: data as View, status: res.status };
  } catch {
    return { error: "No pude conectarme. Revisá tu conexión y probá de nuevo.", status: 0 };
  }
}
