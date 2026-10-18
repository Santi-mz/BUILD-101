import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Página no encontrada · Rumbo" };

// 404 de toda la app (rutas que no existen y notFound()). Se muestra dentro del layout, con el header de siempre.
export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <p className="font-mono text-sm font-semibold text-accent">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">No encontramos esta página</h1>
      <p className="mt-2 text-sm text-muted">Puede que el enlace esté mal escrito o que la página ya no exista.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center rounded-full bg-accent px-6 py-2.5 font-medium text-background outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Volver al inicio
        </Link>
        <Link
          href="/#feed"
          className="inline-flex min-h-11 items-center rounded-full border border-border bg-card px-6 py-2.5 font-medium outline-none transition hover:border-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Ver noticias
        </Link>
      </div>
    </div>
  );
}
