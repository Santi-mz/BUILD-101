"use client";

import { useEffect } from "react";

// Error en el layout raíz: reemplaza toda la página, así que trae su propio <html> y <body>.
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => console.error(error), [error]);
  const e = error as Error & { digest?: string };
  const detail = e instanceof Error ? [e.message, e.digest && `código ${e.digest}`].filter(Boolean).join(" · ") : String(error);

  return (
    <html lang="es">
      <body style={{ fontFamily: "system-ui, sans-serif", textAlign: "center", padding: "80px 16px" }}>
        <h1>Algo falló al cargar Rumbo</h1>
        <p>Probá de nuevo. Si sigue pasando, pasale este detalle al equipo:</p>
        <pre style={{ display: "inline-block", textAlign: "left", padding: 12, border: "1px solid #ccc", borderRadius: 8 }}>{detail}</pre>
        <p>
          <button onClick={() => retry()}>Reintentar</button>
        </p>
      </body>
    </html>
  );
}
