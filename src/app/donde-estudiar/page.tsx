import type { Metadata } from "next";
import { Suspense } from "react";
import { CATALOGO } from "./catalogo";
import Explorador from "./explorador";

export const metadata: Metadata = {
  title: "Dónde estudiar · Rumbo",
  description: "Programas universitarios reales de Uruguay, con su página oficial, filtrados por área, carrera, destino, costo, becas, idioma y modalidad.",
};

// Etapa 2 de Rumbo. Independiente de la entrevista: trabaja con el catálogo local y no llama a Gemini.
// Se puede abrir con una selección inicial: /donde-estudiar?area=emp&carrera=Economía&region=uy
export default function DondeEstudiar() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:py-14">
      <div className="mb-6 grid gap-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent">Etapa 2 · Dónde estudiar</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">¿Dónde podés estudiarlo?</h1>
        <p className="max-w-2xl text-muted">
          De tu área de interés a una carrera, y de la carrera a programas reales con su página oficial. Hoy el catálogo tiene{" "}
          {CATALOGO.programas.length} programas de Uruguay; los datos que una página no publica aparecen como «No consta en la fuente».
        </p>
      </div>
      {/* useSearchParams necesita un Suspense para que el resto de la página se pueda prerenderizar. */}
      <Suspense fallback={<div aria-hidden className="h-96 rounded-3xl bg-accent-soft motion-safe:animate-pulse" />}>
        <Explorador />
      </Suspense>
    </div>
  );
}
