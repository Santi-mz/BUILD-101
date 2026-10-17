import { z } from "zod";
import raw from "@/knowledge/rubric.v1.json";

/**
 * Rúbrica versionada (fuente: Documento 1, Base de conocimiento científico).
 * Es el único criterio de análisis: ningún módulo inventa indicadores fuera de acá.
 */
export const AREAS = ["R", "I", "A", "S", "E", "C"] as const;
export const AXES = ["PERSONAS", "COSAS", "DATOS", "IDEAS"] as const;
export type Area = (typeof AREAS)[number];
export type Axis = (typeof AXES)[number];

const indicatorSchema = z.object({
  id: z.string().regex(/^N[0-4]\.[A-Z_]+$/),
  label: z.string(),
  plain: z.string(),
  area: z.enum(AREAS).optional(),
  axis: z.enum(AXES).optional(),
  perArea: z.boolean().optional(),
  validEvidence: z.array(z.string()).min(1),
  notEnough: z.array(z.string()).optional(),
  allowedInferences: z.array(z.string()).min(1),
  forbiddenInferences: z.array(z.string()).min(1),
  tactGuidance: z.string().optional(),
  exampleQuestions: z.array(z.string()).min(1),
});

const levelSchema = z.object({
  level: z.number().int().min(0).max(4),
  name: z.string(),
  stage: z.string(),
  framework: z.string(),
  parallel: z.boolean().optional(),
  exitCriteria: z
    .object({
      requiredIndicators: z.array(z.string()).optional(),
      minEvidence: z.number().int().optional(),
      minEvidencePerAxisPair: z.number().int().optional(),
      minAreasWithEvidence: z.number().int().optional(),
      minEvidencePerTopArea: z.number().int().optional(),
      minSpecifics: z.number().int().optional(),
      requiresConcrete: z.boolean().optional(),
      requiresConfirmation: z.boolean().optional(),
      maxTurns: z.number().int().min(1),
    })
    .optional(),
  indicators: z.array(indicatorSchema).min(1),
});

export const rubricSchema = z.object({
  version: z.string(),
  source: z.string(),
  levels: z.array(levelSchema).length(5),
  values: z.array(z.object({ id: z.string(), label: z.string() })).min(1),
  weights: z.object({
    confirmed: z.number(),
    declaredConcrete: z.number(),
    declared: z.number(),
    hypothesis: z.number(),
    againstFactor: z.number(),
  }),
  display: z.object({
    minEvidenceForPercentages: z.number().int(),
    minAreasForPercentages: z.number().int(),
    confidence: z.object({ mediumFrom: z.number().int(), highFrom: z.number().int() }),
    disclaimer: z.string(),
  }),
  planner: z.object({
    flatRatio: z.number(),
    n4EveryTurns: z.number().int(),
    maxBeliefExamsInRow: z.number().int(),
    maxDeepenTries: z.number().int(),
    minValuesToClose: z.number().int(),
    minSpecificsToClose: z.number().int(),
  }),
  limits: z.object({ offerCloseAtUserTurns: z.number().int(), forceCloseAtUserTurns: z.number().int() }),
});

export type Rubric = z.infer<typeof rubricSchema>;
export type Indicator = z.infer<typeof indicatorSchema>;
export type Level = z.infer<typeof levelSchema>;

export const rubric: Rubric = rubricSchema.parse(raw);
export const RUBRIC_VERSION = rubric.version;

const byId = new Map<string, Indicator & { level: number }>();
for (const l of rubric.levels) for (const i of l.indicators) byId.set(i.id, { ...i, level: l.level });

export const indicator = (id: string) => byId.get(id);
export const indicatorIds = () => [...byId.keys()];
export const levelOf = (n: number) => rubric.levels.find((l) => l.level === n)!;
export const levelOfIndicator = (id: string) => byId.get(id)?.level ?? Number(id.slice(1, 2));
export const VALUE_IDS = rubric.values.map((v) => v.id);
export const valueLabel = (id: string) => rubric.values.find((v) => v.id === id)?.label ?? id;

export const AREA_LABELS: Record<Area, string> = {
  R: "Realista",
  I: "Investigador",
  A: "Artístico",
  S: "Social",
  E: "Emprendedor",
  C: "Convencional",
};
export const AREA_PLAIN: Record<Area, string> = Object.fromEntries(
  AREAS.map((a) => [a, byId.get(`N2.${a}`)!.plain]),
) as Record<Area, string>;

/** Etapas visibles en la UI (Documento 2, sección 12). */
export const STAGES = ["Arranque", "Lo general", "Tus intereses", "Lo concreto", "Cierre"] as const;
