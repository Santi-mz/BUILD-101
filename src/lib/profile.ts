import { z } from "zod";
import type { Opportunity } from "@/lib/opportunities";

export const RIASEC_KEYS = ["R", "I", "A", "S", "E", "C"] as const;
export type RiasecKey = (typeof RIASEC_KEYS)[number];

export const RIASEC_LABELS: Record<RiasecKey, string> = {
  R: "Realista",
  I: "Investigador",
  A: "Artístico",
  S: "Social",
  E: "Emprendedor",
  C: "Convencional",
};

const dimension = z.object({
  score: z.number().min(0).max(1).describe("Qué tan fuerte es este interés (0 a 1)"),
  confidence: z.number().min(0).max(1).describe("Qué tan seguro estás de ese puntaje (0 a 1)"),
});

export const profileUpdateSchema = z.object({
  riasec: z.object({
    R: dimension,
    I: dimension,
    A: dimension,
    S: dimension,
    E: dimension,
    C: dimension,
  }),
  strengths: z.array(z.string()).describe("Fortalezas o habilidades detectadas"),
  values: z.array(z.string()).describe("Valores laborales (autonomía, impacto social, estabilidad...)"),
  constraints: z
    .object({
      location: z.string().optional(),
      modality: z.string().optional().describe("presencial, remoto, híbrido"),
      education_level: z.string().optional(),
      availability: z.string().optional(),
    })
    .describe("Condiciones prácticas del usuario"),
  interests_keywords: z.array(z.string()).describe("Temas concretos que le interesan, para buscar noticias"),
  evidence: z
    .array(z.object({ pmid: z.string(), title: z.string(), claim: z.string() }))
    .describe("Papers de PubMed que respaldan los rasgos inferidos"),
  summary: z.string().describe("Resumen breve del perfil en segunda persona"),
  reasons: z
    .array(
      z.object({
        type: z.enum(["R", "I", "A", "S", "E", "C"]),
        quote: z.string().describe("Frase TEXTUAL del usuario (copiada de lo que dijo), corta"),
        why: z.string().describe("Por qué esa frase indica ese tipo, en una línea"),
      }),
    )
    .optional()
    .describe("Frases del usuario que justifican los tipos principales (1 o 2 por tipo del top 3)"),
  covered: z
    .array(z.string())
    .optional()
    .describe("Temas o situaciones que ya preguntaste (ej: 'sábado libre', 'materias favoritas'), para no repetirlos"),
});

export type ProfileData = z.infer<typeof profileUpdateSchema> & {
  history?: string[][]; // top-3 RIASEC de cada actualización, para medir estabilidad
  recommendations?: Recommendation[];
  opportunities?: Opportunity[]; // becas, pasantías, empleos y cursos reales y abiertos
  graph_trail?: string[]; // nodos del grafo de carreras que recorrió el agente
  imports?: { source: "cv" | "github"; summary: string; at: string }[]; // datos traídos de otras apps
};

export type Recommendation = {
  type: "carrera" | "curso" | "pasantia" | "empleo" | "beca";
  title: string;
  why: string;
  url?: string;
};

// Condición de parada
export const CONFIDENCE_THRESHOLD = 0.75;
export const STABLE_ROUNDS = 2;
export const MAX_QUESTIONS = 10;
export const MIN_QUESTIONS = 5; // no cerrar por confianza antes de esto: el perfil queda flojo

export function topThree(p: Pick<ProfileData, "riasec">): RiasecKey[] {
  return [...RIASEC_KEYS].sort((a, b) => p.riasec[b].score - p.riasec[a].score).slice(0, 3);
}

/** 0..1: qué tan definido está el perfil (promedio de confianzas). */
export function completeness(p: ProfileData | null): number {
  if (!p?.riasec) return 0;
  const sum = RIASEC_KEYS.reduce((acc, k) => acc + p.riasec[k].confidence, 0);
  return Math.min(1, sum / RIASEC_KEYS.length / CONFIDENCE_THRESHOLD);
}

export type StopReason = "confidence" | "max_questions" | null;

export function shouldStop(p: ProfileData | null, questionCount: number): StopReason {
  if (questionCount >= MAX_QUESTIONS) return "max_questions";
  if (!p?.riasec || questionCount < MIN_QUESTIONS) return null;
  const confident = RIASEC_KEYS.every((k) => p.riasec[k].confidence >= CONFIDENCE_THRESHOLD);
  const h = p.history ?? [];
  const stable =
    h.length >= STABLE_ROUNDS &&
    h.slice(-STABLE_ROUNDS).every((t) => t.join("") === h[h.length - 1].join(""));
  return confident && stable ? "confidence" : null;
}

/** Lo que la interfaz necesita para mostrar el perfil en vivo. */
export function profileSnapshot(p: ProfileData | null, status: string | undefined, questionCount: number) {
  return {
    status: status ?? "in_progress",
    questionCount,
    completeness: status === "final" ? 1 : completeness(p),
    code: riasecCode(p),
    riasec: p?.riasec ?? null,
    evidence: p?.evidence?.length ?? 0,
    strengths: (p?.strengths ?? []).slice(0, 4),
  };
}
export type ProfileSnapshot = ReturnType<typeof profileSnapshot>;

export function riasecCode(p: ProfileData | null): string {
  return p?.riasec ? topThree(p).join("") : "";
}
