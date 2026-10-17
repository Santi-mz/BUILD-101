"use client";

import { useEffect } from "react";

// Pantalla de error de las páginas: muestra qué falló (sirve para depurar) y deja reintentar.
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const e = error as Error & { digest?: string };
  const detail = e instanceof Error ? [e.message, e.digest && `código ${e.digest}`].filter(Boolean).join(" · ") : String(error);

  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <h1 className="text-2xl font-semibold">Algo falló al cargar esta página</h1>
      <p className="mt-2 text-sm text-muted">Probá de nuevo. Si sigue pasando, pasale este detalle al equipo:</p>
      <pre className="mt-4 overflow-x-auto rounded-xl border border-border bg-card p-3 text-left text-xs">{detail}</pre>
      <button onClick={() => retry()} className="mt-6 rounded-full bg-accent px-6 py-2.5 font-medium text-background">
        Reintentar
      </button>
    </div>
  );
}
