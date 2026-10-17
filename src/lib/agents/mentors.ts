import directory from "@/data/mentors.demo.json";
import type { MentorResult, SessionState } from "@/lib/engine/types";
import { AGE_MIN } from "@/lib/engine/turn";

/**
 * A5 · Conector humano. Solo con ruta elegida + consentimiento específico. Consulta exclusivamente el
 * directorio interno opt-in. Nunca busca contactos externos ni inicia comunicación. En el MVP la
 * mensajería real está deshabilitada.
 */
export class ConsentError extends Error {
  status = 403;
}

type Entry = (typeof directory.mentors)[number];
export interface MentorDirectory {
  list(): Promise<Entry[]>;
}
export const demoDirectory = (entries: Entry[] = directory.mentors): MentorDirectory => ({ list: async () => entries });

export const MENTOR_MESSAGING_ENABLED = false;

export function hasMentorConsent(s: SessionState, pathId: string) {
  const last = [...s.consents].reverse().find((c) => c.purpose === "mentors" && c.pathId === pathId);
  return last?.status === "granted";
}

/** Coincidencia válida para contacto: verified + active + opt_in + available + política por edad. */
function contactable(m: Entry, s: SessionState) {
  const adultUser = AGE_MIN[s.ageRange] >= 18;
  return m.verification_status === "verified" && m.active && m.opt_in && m.available && (adultUser || s.guardianConsent);
}

export async function findVerifiedMentors(s: SessionState, pathId: string, dir: MentorDirectory = demoDirectory()): Promise<MentorResult> {
  if (!s.selectedPathId || s.selectedPathId !== pathId) throw new ConsentError("Primero elegí una ruta para explorar.");
  if (!hasMentorConsent(s, pathId)) throw new ConsentError("Hace falta tu permiso para buscar personas con experiencia en esta ruta.");
  const route = s.recommendations.at(-1)?.routes.find((r) => r.path_id === pathId);
  const tags = new Set([...(route?.opportunity.tags ?? [])]);
  const areas = Object.entries(route?.opportunity.riasec ?? {}).filter(([, v]) => (v ?? 0) >= 0.5).map(([k]) => k);
  const all = await dir.list();
  const relevant = all
    .map((m) => ({ m, hits: m.tags.filter((t) => tags.has(t)).length + m.riasec.filter((a) => areas.includes(a)).length }))
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 3);
  const matches = relevant.map(({ m }) => ({
    mentor_id: m.mentor_id,
    public_alias: m.public_alias,
    experience: m.experience,
    verification_status: m.verification_status === "verified" ? ("verified" as const) : ("demo" as const),
    topics: m.topics,
    contact_mode: "moderated_async_question" as const,
    can_receive_question: MENTOR_MESSAGING_ENABLED && contactable(m, s),
  }));
  const anyReal = matches.some((m) => m.verification_status === "verified" && m.can_receive_question);
  return {
    path_id: pathId,
    matches,
    fallback: anyReal ? null : "Aún no hay participantes reales habilitados. Los perfiles que ves son de prueba y no se pueden contactar.",
    suggested_questions: [
      "¿Qué te sorprendió cuando empezaste?",
      "¿Cómo es un día o una semana típica?",
      "¿Qué te hubiera gustado saber antes de elegir?",
    ],
  };
}
