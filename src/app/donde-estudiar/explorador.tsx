"use client";

import { useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { AREAS, CATALOGO, NC, REGIONS, type Ficha } from "./catalogo";
import { buscar, FILTROS_INICIALES, fuentesBecas, tieneCatalogo, type Filtros, type Resultado, type Seleccion } from "./filtros";

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const INCOMPLETO = "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200";
const fecha = (iso: string) => iso.split("-").reverse().join("/");

/**
 * Selección inicial desde la URL, para poder enlazar la página desde otras pantallas sin acoplarlas:
 * /donde-estudiar?area=emp&carrera=Economía&region=uy. Los valores que no existen se ignoran.
 */
function seleccionInicial(params: URLSearchParams): Seleccion {
  const area = AREAS.find((a) => a.id === params.get("area")) ?? AREAS[0];
  const career = area.careers.find((c) => c === params.get("carrera")) ?? null;
  const region = REGIONS.find((r) => r.id === params.get("region")) ?? REGIONS[0];
  const country = region.countries.find((c) => c === params.get("pais")) ?? null;
  return { area: area.id, career, region: region.id, country };
}

export default function Explorador() {
  const params = useSearchParams();
  const [sel, setSel] = useState<Seleccion>(() => seleccionInicial(new URLSearchParams(params.toString())));
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_INICIALES);
  const area = AREAS.find((a) => a.id === sel.area)!;
  const region = REGIONS.find((r) => r.id === sel.region)!;
  const lugar = sel.country ?? (region.countries.length > 1 ? `${region.label} (cualquier país)` : region.label);
  const carrera = sel.career ?? area.label;
  const set = (patch: Partial<Seleccion>) => setSel((s) => ({ ...s, ...patch }));
  const setF = (patch: Partial<Filtros>) => setFiltros((f) => ({ ...f, ...patch }));

  return (
    <div className="grid gap-5">
      <nav aria-label="Tu recorrido" className="flex flex-wrap items-center gap-2 text-sm">
        {[
          ["Área", area.label],
          ["Carrera", sel.career ?? "Todas las del área"],
          ["Dónde", lugar],
        ].map(([k, v], i) => (
          <span key={k} className="flex items-center gap-2">
            {i > 0 && <span aria-hidden className="text-muted">→</span>}
            <span className="flex min-w-0 flex-col rounded-xl border border-border bg-card px-3 py-1.5">
              <small className="text-[0.68rem] uppercase tracking-wider text-muted">{k}</small>
              <b className="font-semibold">{v}</b>
            </span>
          </span>
        ))}
      </nav>

      <Paso n={1} title="Área de interés" hint="La dirección que salió de tu charla, no una carrera">
        <Opciones
          label="Área de interés"
          value={sel.area}
          options={AREAS.map((a) => ({ id: a.id, label: a.label, sub: a.riasec }))}
          onPick={(id) => id !== sel.area && set({ area: id, career: null })}
        />
      </Paso>

      <Paso n={2} title="Carrera que querés explorar">
        {area.careers.length ? (
          <Opciones
            small
            label="Carrera"
            value={sel.career ?? ""}
            options={[{ id: "", label: "Todas las del área" }, ...area.careers.map((c) => ({ id: c, label: c }))]}
            onPick={(id) => set({ career: id || null })}
          />
        ) : (
          <p className="text-sm text-muted">Todavía no tenemos carreras cargadas para esta área.</p>
        )}
      </Paso>

      <Paso n={3} title="Dónde querés cursarla" hint="Cambiar el destino no borra tus filtros">
        <span className="text-xs font-medium text-muted">Región</span>
        <Opciones label="Región" value={sel.region} options={REGIONS} onPick={(id) => id !== sel.region && set({ region: id, country: null })} />
        {region.countries.length > 1 && (
          <>
            <span className="text-xs font-medium text-muted">País</span>
            <Opciones
              small
              label="País"
              value={sel.country ?? ""}
              options={[{ id: "", label: "Cualquier país" }, ...region.countries.map((c) => ({ id: c, label: c }))]}
              onPick={(id) => set({ country: id || null })}
            />
          </>
        )}
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Campo id="f-budget" label="Presupuesto" help="Solo cuenta lo que confirma la fuente.">
            <select id="f-budget" value={filtros.budget} onChange={(e) => setF({ budget: e.target.value as Filtros["budget"] })} className={selectClass}>
              <option value="any">Cualquiera</option>
              <option value="free">Matrícula gratuita</option>
              <option value="aid">Gratuita o con beca</option>
            </select>
          </Campo>
          <Campo id="f-becas" label="Becas">
            <label htmlFor="f-becas" className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-border bg-background px-3 py-2 text-sm">
              <input id="f-becas" type="checkbox" checked={filtros.becas} onChange={(e) => setF({ becas: e.target.checked })} className="h-4 w-4 accent-[var(--accent)]" />
              Solo con beca confirmada
            </label>
          </Campo>
          <Campo id="f-lang" label="Idioma de cursado">
            <select id="f-lang" value={filtros.lang} onChange={(e) => setF({ lang: e.target.value as Filtros["lang"] })} className={selectClass}>
              <option value="any">Cualquiera</option>
              <option value="es">Español</option>
              <option value="en">Inglés</option>
              <option value="pt">Portugués</option>
              <option value="de">Alemán</option>
            </select>
          </Campo>
          <Campo id="f-mode" label="Modalidad">
            <select id="f-mode" value={filtros.mode} onChange={(e) => setF({ mode: e.target.value as Filtros["mode"] })} className={selectClass}>
              <option value="any">Cualquiera</option>
              <option value="presencial">Presencial</option>
              <option value="hibrida">Híbrida</option>
              <option value="distancia">A distancia</option>
            </select>
          </Campo>
        </div>
      </Paso>

      <Resultados sel={sel} filtros={filtros} carrera={carrera} lugar={lugar} onReset={() => setFiltros(FILTROS_INICIALES)} onAllCareers={() => set({ career: null })} onGoUruguay={() => set({ region: "uy", country: null })} />
    </div>
  );
}

const selectClass = `min-h-11 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm hover:border-accent ${FOCUS}`;

function Paso({ n, title, hint, children }: { n: number; title: string; hint?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`paso-${n}`} className="grid gap-3 rounded-3xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id={`paso-${n}`} className="flex items-baseline gap-2 font-semibold">
          <span className="font-mono text-xs text-accent">{n}</span>
          {title}
        </h2>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function Opciones({ label, value, options, onPick, small }: { label: string; value: string; options: { id: string; label: string; sub?: string }[]; onPick: (id: string) => void; small?: boolean }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={o.id === value}
          onClick={() => onPick(o.id)}
          className={`inline-flex items-center gap-1.5 rounded-full border px-4 text-left transition ${small ? "min-h-10 py-1.5 text-sm" : "min-h-11 py-2"} ${
            o.id === value ? "border-accent bg-accent text-background" : "border-border bg-background hover:border-accent"
          } ${FOCUS}`}
        >
          {o.label}
          {o.sub && <span className="text-xs opacity-75">{o.sub}</span>}
        </button>
      ))}
    </div>
  );
}

function Campo({ id, label, help, children }: { id: string; label: string; help?: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 content-start gap-1.5">
      <label htmlFor={id} className="text-xs font-medium text-muted">
        {label}
      </label>
      {children}
      {help && <span className="text-xs text-muted">{help}</span>}
    </div>
  );
}

function Resultados(props: { sel: Seleccion; filtros: Filtros; carrera: string; lugar: string; onReset: () => void; onAllCareers: () => void; onGoUruguay: () => void }) {
  const { sel, filtros, carrera, lugar } = props;
  const fuentes = fuentesBecas(sel);
  const hayFiltros = filtros.budget !== "any" || filtros.becas || filtros.lang !== "any" || filtros.mode !== "any";

  if (!tieneCatalogo(sel)) {
    const area = AREAS.find((a) => a.id === sel.area)!;
    const otroArea = !area.careers.length;
    return (
      <section aria-labelledby="h-res" className="grid gap-4">
        <h2 id="h-res" className="sr-only">Resultados</h2>
        <p role="status" className="text-sm">
          Todavía no tenemos un catálogo de {otroArea ? area.label : carrera} en {lugar}.
        </p>
        <Vacio title={`Todavía no tenemos programas de ${otroArea ? area.label : carrera} en ${lugar}`}>
          <p>
            Por ahora el catálogo cubre solo Uruguay, en Tecnología y datos y en Organizar y emprender. Preferimos no mostrarte nada antes que
            opciones que no podemos respaldar.
          </p>
          {sel.region !== "uy" && !otroArea && (
            <button type="button" onClick={props.onGoUruguay} className={`mt-1 min-h-11 rounded-full border border-border bg-background px-5 font-medium ${FOCUS}`}>
              Ver {carrera} en Uruguay
            </button>
          )}
        </Vacio>
        <Fuentes fuentes={fuentes} />
      </section>
    );
  }

  const r = buscar(sel, filtros);
  const coinciden = r.direct.length + r.related.length;
  const estado = [
    `${r.direct.length} ${r.direct.length === 1 ? "programa coincide" : "programas coinciden"}`,
    r.related.length ? `${r.related.length} ${r.related.length === 1 ? "relacionado" : "relacionados"}` : "",
    r.incomplete.length ? `${r.incomplete.length} con información incompleta` : "",
    r.excluded.length ? `${r.excluded.length} no ${r.excluded.length === 1 ? "cumple" : "cumplen"}` : "",
  ].filter(Boolean);
  const motivos = [...new Set(r.excluded.flatMap((e) => e.checks.filter((c) => c.value === "no").map((c) => c.label)))];

  return (
    <section aria-labelledby="h-res" className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="h-res" className="sr-only">Resultados</h2>
        <p role="status" className="text-sm">
          {estado.join(" · ")} · {carrera} en {lugar}
        </p>
        {hayFiltros && (
          <button type="button" onClick={props.onReset} className={`min-h-11 px-1 text-sm font-medium text-accent underline underline-offset-4 ${FOCUS}`}>
            Limpiar filtros
          </button>
        )}
      </div>

      <div className="grid gap-3">
        <div>
          <h2 className="text-lg font-semibold">Programas con página oficial comprobada</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            Cada ficha sale de la página oficial de la carrera, comprobada el {fecha(CATALOGO.fecha_verificacion)}. Eso no significa que la
            inscripción esté abierta ni que haya becas aseguradas: confirmalo siempre en la página oficial.
          </p>
        </div>
        {r.direct.length > 0 && (
          <>
            {sel.career && <h3 className="text-sm font-semibold">Coinciden con {sel.career}</h3>}
            <Grilla items={r.direct} />
          </>
        )}
        {r.related.length > 0 && (
          <>
            <h3 className="text-sm font-semibold">Relacionadas con {sel.career}</h3>
            <p className="text-sm text-muted">Carreras cercanas según el criterio de Rumbo. No son la misma carrera: revisá el plan de estudios.</p>
            <Grilla items={r.related} />
          </>
        )}
        {coinciden === 0 && (
          <Vacio title="Ningún programa confirma tus filtros con la información publicada">
            <p>
              {r.incomplete.length
                ? "Las fuentes no publican algunos de los datos que filtraste. Podés ver esos programas abajo, marcados como información incompleta."
                : "Probá quitar algún filtro o mirar todas las carreras del área."}
            </p>
            {sel.career && !r.incomplete.length && (
              <button type="button" onClick={props.onAllCareers} className={`mt-1 min-h-11 rounded-full border border-border bg-background px-5 font-medium ${FOCUS}`}>
                Ver todas las carreras del área
              </button>
            )}
          </Vacio>
        )}
      </div>

      {r.incomplete.length > 0 && (
        <details open={coinciden === 0} className="rounded-2xl border border-dashed border-border bg-card px-4 pb-4">
          <summary className={`flex min-h-12 cursor-pointer items-center gap-2 font-semibold ${FOCUS}`}>
            Con información incompleta para tus filtros
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${INCOMPLETO}`}>{r.incomplete.length}</span>
          </summary>
          <p className="mb-3 text-sm text-muted">La fuente oficial no publica alguno de los datos que filtraste, así que no los contamos como coincidencias.</p>
          <Grilla items={r.incomplete} />
        </details>
      )}

      {r.excluded.length > 0 && (
        <p className="text-sm text-muted">
          {r.excluded.length} {r.excluded.length === 1 ? "programa queda" : "programas quedan"} afuera porque su fuente indica que no cumple: {motivos.join(", ")}.
        </p>
      )}

      <Fuentes fuentes={fuentes} />
    </section>
  );
}

function Grilla({ items }: { items: Resultado[] }) {
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {items.map((r) => (
        <li key={r.ficha.id} className="min-w-0">
          <Tarjeta r={r} />
        </li>
      ))}
    </ul>
  );
}

function Dato({ k, v, note }: { k: string; v: string; note?: string }) {
  return (
    <>
      <dt className="text-muted">{k}</dt>
      <dd className="min-w-0 [overflow-wrap:anywhere]">
        {v === NC ? <span className="text-muted italic">{NC}</span> : v}
        {note && <span className="block text-xs text-muted">{note}</span>}
      </dd>
    </>
  );
}

function Tarjeta({ r }: { r: Resultado }) {
  const f: Ficha = r.ficha;
  const unknown = r.checks.filter((c) => c.value === "unknown");
  const lugar = f.ciudades[0] === NC ? NC : f.ciudades.join(", ") + (f.departamentos.join() !== f.ciudades.join() ? ` (${f.departamentos.join(", ")})` : "");
  const titulos = [f.titulo_final !== NC ? f.titulo_final : "", ...f.titulos_intermedios.map((t) => `Intermedio: ${t}`)].filter(Boolean).join(" · ") || NC;
  return (
    <article className="flex h-full flex-col gap-3 rounded-2xl border border-accent/50 bg-card p-5">
      <div className="flex flex-wrap gap-1.5 text-xs font-medium">
        <span className="rounded-full border border-accent px-2.5 py-0.5 text-accent">Página oficial comprobada</span>
        {f.pendientes.length > 0 && <span className={`rounded-full px-2.5 py-0.5 ${INCOMPLETO}`}>Ficha incompleta</span>}
        {r.relation === "related" && <span className="rounded-full border border-border px-2.5 py-0.5 text-muted">Relacionada</span>}
        {f.inscripcionVigente && <span className="rounded-full bg-accent px-2.5 py-0.5 text-background">Inscripción vigente</span>}
        {f.becaConfirmada && <span className="rounded-full bg-accent px-2.5 py-0.5 text-background">Beca confirmada</span>}
      </div>
      <div>
        <p className="text-sm font-medium text-accent">{f.institucion}</p>
        <h3 className="mt-0.5 text-lg font-semibold leading-snug">{f.nombre_oficial}</h3>
      </div>
      <dl className="grid grid-cols-[minmax(5.5rem,auto)_1fr] gap-x-3 gap-y-1 text-sm">
        {f.facultad !== NC && <Dato k="Facultad" v={f.facultad} />}
        <Dato k="Dónde" v={lugar} note={f.otras_localidades !== NC ? f.otras_localidades : undefined} />
        <Dato k="Título" v={titulos} note={f.titulos_nota} />
        <Dato k="Duración" v={f.duracion} />
        <Dato k="Modalidad" v={f.modalidad} note={f.horario} />
        <Dato k="Idioma" v={f.idioma} note={f.idioma_nota} />
        <Dato k="Requisitos" v={f.requisitos_ingreso} />
      </dl>
      <dl className="grid grid-cols-[minmax(5.5rem,auto)_1fr] gap-x-3 gap-y-1 rounded-xl border border-border bg-background p-3 text-sm">
        <Dato k="Matrícula" v={f.matricula} note={f.matricula_fuente ? `Fuente: ${f.matricula_fuente.url} · «${f.matricula_fuente.cita}»` : undefined} />
        <Dato k="Becas" v={f.becas} note={f.becas_nota ?? (f.becas_fuente ? `${f.becas_fuente.alcance}: ${f.becas_fuente.url}` : undefined)} />
        <Dato k="Inscripción" v={f.inscripcionVigente ? "Vigente según la fuente" : "No verificada"} note={f.inscripciones !== NC ? f.inscripciones : undefined} />
      </dl>
      {unknown.length > 0 && (
        <p className={`rounded-lg px-3 py-2 text-xs ${INCOMPLETO}`}>
          No consta en la fuente: {unknown.map((c) => c.label).join(", ")}. No lo contamos como coincidencia.
        </p>
      )}
      <div className="mt-auto grid gap-1 border-t border-border pt-3 text-xs text-muted">
        {f.pendientes.length > 0 && <span>Faltan en la fuente: {f.pendientes.join(", ")}</span>}
        <span>Comprobado el {fecha(f.fecha_verificacion)}</span>
        <a href={f.url_programa} target="_blank" rel="noopener noreferrer" className={`inline-flex min-h-11 items-center text-sm font-medium text-accent hover:underline ${FOCUS}`}>
          Ver la página oficial de la carrera <span aria-hidden>&nbsp;↗</span>
          <span className="sr-only"> (se abre en otra pestaña)</span>
        </a>
      </div>
    </article>
  );
}

function Vacio({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="grid justify-items-start gap-2 rounded-2xl border border-dashed border-border bg-card p-5 text-sm">
      <h3 className="text-base font-semibold">{title}</h3>
      <div className="grid gap-2 text-muted">{children}</div>
    </div>
  );
}

function Fuentes({ fuentes }: { fuentes: ReturnType<typeof fuentesBecas> }) {
  if (!fuentes.length) return null;
  return (
    <div className="grid gap-3">
      <div>
        <h2 className="text-lg font-semibold">Fuentes oficiales de becas y cursos</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Organismos reales que publican becas y cursos. Que una fuente sea real no significa que tenga una beca para la carrera que buscás.
        </p>
      </div>
      <ul className="grid gap-3 md:grid-cols-2">
        {fuentes.map((s) => (
          <li key={s.url} className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 text-sm">
            <div className="flex flex-wrap gap-1.5 text-xs font-medium">
              <span className="rounded-full bg-accent px-2.5 py-0.5 text-background">Fuente oficial</span>
              {s.kinds.map((k) => (
                <span key={k} className="rounded-full border border-border px-2.5 py-0.5 text-muted">
                  {k}
                </span>
              ))}
            </div>
            <h3 className="font-semibold">{s.name}</h3>
            <p className="text-muted">{s.for}. Sin beca confirmada para esta búsqueda.</p>
            <a href={s.url} target="_blank" rel="noopener noreferrer" className={`mt-auto inline-flex min-h-11 items-center font-medium text-accent hover:underline ${FOCUS}`}>
              Ir a la página oficial <span aria-hidden>&nbsp;↗</span>
              <span className="sr-only"> (se abre en otra pestaña)</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
