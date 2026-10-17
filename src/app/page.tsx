import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { getFeed } from "@/lib/feed";
import { RIASEC_KEYS, RIASEC_LABELS, riasecCode, type ProfileData, type RiasecKey } from "@/lib/profile";
import { supabaseServer } from "@/lib/supabase/server";

const STEPS = [
  { n: "1", title: "Charlás y te conocés", body: "Una pregunta por vez, de lo general a lo concreto. Ves lo que la IA va entendiendo y corregís lo que no te represente." },
  { n: "2", title: "Recibís tu devolución", body: "Lo que más aparece en lo que contaste, tus intereses concretos y lo que te importa. No es un test ni una etiqueta." },
  { n: "3", title: "Explorás caminos", body: "Hasta tres rutas distintas, con por qué aparecen, qué falta verificar y un próximo paso chico y reversible." },
];

const AI_PILLARS: { title: string; body: string; icon: ReactNode }[] = [
  {
    title: "Entrevista adaptativa",
    body: "Un analizador convierte cada respuesta en evidencias según una rúbrica científica fija; un planificador decide la próxima pregunta y un entrevistador la redacta con tacto.",
    icon: <path d="M4 5h16v10H8l-4 4V5Z" />,
  },
  {
    title: "Criterio con base científica",
    body: "La rúbrica combina Gati (dificultades para decidir), Prediger (personas/cosas, datos/ideas), Holland (RIASEC), intereses básicos y SCCT. El criterio es el mismo para todos y está versionado.",
    icon: <path d="M10 3v6L4.5 18.5A1.5 1.5 0 0 0 5.8 21h12.4a1.5 1.5 0 0 0 1.3-2.5L14 9V3M8.5 3h7M7 15h10" />,
  },
  {
    title: "Vos tenés la última palabra",
    body: "Nada entra a tu perfil sin evidencia: se separa lo que dijiste, lo que la IA supone y lo que confirmaste. Los porcentajes los calcula código, no la IA, y solo con datos suficientes.",
    icon: <path d="M12 3 21 8v8l-9 5-9-5V8l9-5Zm0 0v18M3 8l9 5 9-5" />,
  },
  {
    title: "Agentes que verifican",
    body: "Al explorar caminos, un agente busca, otro verifica la fuente y otro elige hasta tres rutas diversas. Lo que no tiene fuente no se muestra como disponible.",
    icon: <path d="M4 6h16M4 12h10M4 18h6M17 14l3 3-3 3" />,
  },
];

const CTA_CLASS =
  "inline-flex items-center gap-2 rounded-full bg-accent px-7 py-3.5 text-base font-semibold text-background shadow-sm transition hover:opacity-90";

async function loadViewer() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const profile = user
    ? ((await supabase.from("profiles").select("data").eq("user_id", user.id).maybeSingle()).data?.data as ProfileData | null)
    : null;
  return { supabase, user, profile };
}

function HeroCta() {
  return (
    <Link href="/chat" className={CTA_CLASS}>
      Empezar a explorar
      <span aria-hidden>→</span>
    </Link>
  );
}

function SectionTitle({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <div className="mb-8 max-w-2xl">
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-accent">{eyebrow}</p>
      <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
      {children && <p className="mt-3 text-muted">{children}</p>}
    </div>
  );
}

export default function Home() {
  return (
    <div className="overflow-x-clip">
      <section className="relative isolate">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-24 -z-10 mx-auto h-[28rem] max-w-5xl rounded-full bg-accent-soft opacity-70 blur-3xl"
        />
        <div className="mx-auto grid max-w-5xl items-center gap-10 px-4 pb-14 pt-8 sm:pb-20 sm:pt-16 lg:grid-cols-[1.25fr_1fr]">
          <div>
            <p className="mb-4 inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-accent">
              <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              <span className="sm:hidden">Conectate con tu futuro</span>
              <span className="hidden sm:inline">Conectate con tu futuro · exploración vocacional con IA</span>
            </p>
            <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight sm:text-6xl">
              No elegimos tu futuro por vos. <span className="text-accent">Te ayudamos a explorarlo.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted">
              Una charla para descubrir qué te gusta y qué te importa, contrastar caminos con información confiable y acercarte a personas que
              los conocen. No hace falta que tengas todo claro.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <HeroCta />
              <a href="#feed" className="rounded-full border border-border bg-card px-6 py-3.5 font-medium transition hover:border-accent">
                Ver noticias
              </a>
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
              <li><span aria-hidden>✓ </span>15 a 25 minutos</li>
              <li><span aria-hidden>✓ </span>Sin cuenta ni datos personales</li>
              <li><span aria-hidden>✓ </span>Corregís lo que entienda</li>
            </ul>

            <div className="mt-8 rounded-2xl border border-border bg-card/80 p-4 shadow-sm lg:hidden">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted">Tu perfil mide seis intereses</p>
              <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
                {RIASEC_KEYS.map((k) => (
                  <li key={k} className="rounded-lg bg-accent-soft px-1 py-2 text-center">
                    <div className="font-mono text-base font-semibold text-accent">{k}</div>
                    <div className="truncate text-[11px] text-muted">{RIASEC_LABELS[k]}</div>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="hidden rounded-3xl border border-border bg-card p-6 shadow-sm lg:block">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted">Tu perfil mide seis intereses</p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {RIASEC_KEYS.map((k) => (
                <div key={k} className="rounded-xl bg-accent-soft p-3 text-center">
                  <div className="font-mono text-xl font-semibold text-accent">{k}</div>
                  <div className="mt-0.5 text-xs text-muted">{RIASEC_LABELS[k]}</div>
                </div>
              ))}
            </div>
            <ul className="mt-5 space-y-3 border-t border-border pt-5 text-sm">
              <li className="flex gap-2"><span aria-hidden className="text-accent">●</span>El peso de cada área en lo que contaste, con su confianza</li>
              <li className="flex gap-2"><span aria-hidden className="text-accent">●</span>Cada dato con la frase tuya que lo sostiene</li>
              <li className="flex gap-2"><span aria-hidden className="text-accent">●</span>Hasta tres caminos para investigar, con su fuente</li>
            </ul>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4">
        <section className="pb-16 sm:pb-24">
          <SectionTitle eyebrow="Cómo funciona" title="De una charla a un próximo paso, en tres etapas" />
          <ol className="grid gap-4 sm:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="rounded-2xl border border-border bg-card p-6">
                <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-full bg-accent font-mono text-sm font-semibold text-background">
                  {s.n}
                </div>
                <h3 className="font-semibold">{s.title}</h3>
                <p className="mt-1.5 text-sm text-muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="pb-16 sm:pb-24">
          <SectionTitle eyebrow="Por qué la IA es clave" title="La IA lee y redacta; el criterio no depende de su humor">
            Los modelos de lenguaje analizan tus respuestas y escriben las preguntas. Todo lo que decide (tu perfil, los porcentajes, qué
            preguntar después, cuándo cerrar) es código determinista que se puede auditar y testear.
          </SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            {AI_PILLARS.map((p) => (
              <div key={p.title} className="flex gap-4 rounded-2xl border border-border bg-card p-6">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    {p.icon}
                  </svg>
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold">{p.title}</h3>
                  <p className="mt-1.5 text-sm text-muted">{p.body}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-6 text-xs text-muted">
            Los marcos teóricos organizan la exploración: una conversación con IA no es un test psicométrico validado. No es un diagnóstico ni
            reemplaza a un orientador o psicólogo. Que la conversación ayude más que un cuestionario fijo es una hipótesis que todavía hay que
            validar.
          </p>
        </section>

        <Suspense fallback={<p id="feed" className="scroll-mt-20 pb-20 text-sm text-muted">Cargando noticias…</p>}>
          <Feed />
        </Suspense>
      </div>
    </div>
  );
}

async function Feed() {
  const { supabase, user, profile } = await loadViewer();
  const { items, personalized } = await getFeed(supabase, profile);
  const code = riasecCode(profile);
  return (
    <section id="feed" className="scroll-mt-20 pb-20">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-accent">Feed</p>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Noticias</h2>
          <p className="mt-2 text-sm text-muted">
            {personalized
              ? `Ordenadas para tu perfil ${code} · se actualizan todos los días`
              : "Empleo, pasantías, becas y estudios · resumidas y etiquetadas por IA · se actualizan todos los días"}
          </p>
        </div>
        {!personalized && (
          <Link href={user ? "/chat" : "/login"} className="rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-accent transition hover:border-accent">
            Personalizalas con tu perfil →
          </Link>
        )}
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <p className="font-medium">Estamos preparando las noticias de hoy</p>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">
            Buscamos oportunidades de empleo, pasantías, becas y estudios, y la IA las resume para vos. Volvé en un rato.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {items.map((n) => {
            const top = (Object.entries(n.riasec) as [RiasecKey, number][]).sort((a, b) => b[1] - a[1])[0];
            return (
              <a
                key={n.id}
                href={n.url}
                target="_blank"
                rel="noreferrer"
                className="group flex min-w-0 flex-col rounded-2xl border border-border bg-card p-5 transition hover:-translate-y-0.5 hover:border-accent hover:shadow-sm"
              >
                <div className="flex-1">
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                    {n.category && <span className="rounded-full bg-accent-soft px-2.5 py-0.5 font-medium text-accent">{n.category}</span>}
                    {top && <span className="rounded-full border border-border px-2.5 py-0.5 text-muted">{RIASEC_LABELS[top[0]]}</span>}
                    {personalized && n.match !== undefined && (
                      <span className="ml-auto rounded-full bg-accent px-2.5 py-0.5 font-mono font-medium text-background">{n.match}% afinidad</span>
                    )}
                  </div>
                  <h3 className="break-words text-lg font-semibold leading-snug group-hover:text-accent">{n.title}</h3>
                  {n.summary && <p className="mt-2 line-clamp-3 break-words text-[15px] leading-relaxed text-muted sm:text-sm">{n.summary}</p>}
                </div>
                <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3 text-sm text-muted sm:text-xs">
                  <span className="min-w-0 truncate">
                    {n.source}
                    {n.published_at && ` · ${new Date(n.published_at).toLocaleDateString("es-UY", { day: "numeric", month: "short" })}`}
                  </span>
                  <span className="shrink-0 font-medium text-accent">
                    Leer <span aria-hidden>↗</span>
                  </span>
                </div>
              </a>
            );
          })}
        </div>
      )}
    </section>
  );
}
