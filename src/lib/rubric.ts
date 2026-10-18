import { z } from "zod";
import rawOptions from "@/knowledge/options.v1.json";
import rawV1 from "@/knowledge/rubric.v1.json";
import rawV2 from "@/knowledge/rubric.v2.json";

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

export const SLOT_IDS = ["E1", "E2", "E3", "C1", "C2", "C3"] as const;
const slotSchema = z.object({
  id: z.enum(SLOT_IDS),
  kind: z.enum(["essential", "complementary"]),
  priority: z.number().int(),
  indicators: z.array(z.string().regex(/^N[0-4]\.([A-Z_]+|\*)$/)).min(1),
  doneWhen: z.enum(["evidence_or_asked_once", "two_positive_same_area", "one_value", "evidence_or_none_answer", "evidence", "one_concrete"]),
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
  limits: z.object({
    offerCloseAtUserTurns: z.number().int(),
    forceCloseAtUserTurns: z.number().int(),
    // v2 (demo): presupuesto de preguntas y reglas de cierre. Opcionales para que la v1 siga validando.
    maxQuestions: z.number().int().min(1).optional(),
    targetQuestions: z.tuple([z.number().int(), z.number().int()]).optional(),
    offerCloseFrom: z.number().int().optional(),
    closeWhenSufficientFrom: z.number().int().optional(),
    stallToClose: z.number().int().optional(),
    maxDeepenPerIndicator: z.number().int().optional(),
    maxMiniSummaries: z.number().int().optional(),
    miniSummaryUntil: z.number().int().optional(),
    optionsDefault: z.tuple([z.number().int(), z.number().int()]).optional(),
    optionsAfterNoInfo: z.number().int().optional(),
  }),
  /** v2: casilleros de suficiencia (E = imprescindible, C = complementario), en orden de prioridad. */
  slots: z.array(slotSchema).optional(),
});

export type Rubric = z.infer<typeof rubricSchema>;
export type Indicator = z.infer<typeof indicatorSchema>;
export type Level = z.infer<typeof levelSchema>;
export type Slot = z.infer<typeof slotSchema>;
export type SlotId = Slot["id"];

export const rubricV1: Rubric = rubricSchema.parse(rawV1);
export const rubricV2: Rubric = rubricSchema.parse(rawV2);
/**
 * Rúbrica activa: la v2 (demo) salvo `RUBRIC_VERSION=1`. Los niveles e indicadores son los mismos en las dos;
 * la v2 agrega `limits` del presupuesto y `slots`. La v1 no se edita (regla de AGENTS.md).
 */
export const rubric: Rubric = process.env.RUBRIC_VERSION === "1" ? rubricV1 : rubricV2;
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

// ---------------------------------------------------------------------------------------------
// Banco de opciones (src/knowledge/options.v1.json): respuestas en botones por casillero. Cada opción
// trae la evidencia que genera, así tocarla registra el dato sin llamar al LLM.
// ---------------------------------------------------------------------------------------------
const optionEvidenceSchema = z.object({
  indicatorId: z.string().regex(/^N[0-4]\.[A-Z_]+$/),
  area: z.enum(AREAS).optional(),
  axis: z.enum(AXES).optional(),
  value: z.string().max(60).optional(),
});
export const optionSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/).max(40),
  label: z.string().min(2).max(60),
  evidence: z.array(optionEvidenceSchema).optional(),
  /** "Ninguna en especial" en C1: da el casillero por cubierto sin evidencia. */
  marksDone: z.boolean().optional(),
  /** "Ninguna de estas" / "Prefiero no decir": cuenta como respuesta sin información. */
  noInfo: z.boolean().optional(),
});
export const OPTION_GROUPS = [...SLOT_IDS, "COMMON"] as const;
export const optionBankSchema = z.object({
  version: z.string(),
  slots: z.object(Object.fromEntries(OPTION_GROUPS.map((g) => [g, z.array(optionSchema)])) as Record<(typeof OPTION_GROUPS)[number], z.ZodArray<typeof optionSchema>>),
});

export type Option = z.infer<typeof optionSchema>;
export type OptionGroup = (typeof OPTION_GROUPS)[number];

export const optionBank = optionBankSchema.parse(rawOptions);
export const OPTIONS_VERSION = optionBank.version;

const optionsById = new Map<string, Option & { group: OptionGroup }>();
for (const g of OPTION_GROUPS) for (const o of optionBank.slots[g]) optionsById.set(o.id, { ...o, group: g });

/** Opciones de un casillero (sin las comunes). */
export const optionsOf = (slot: SlotId): Option[] => optionBank.slots[slot];
/** Opciones que se agregan siempre ("Ninguna de estas", "Prefiero no decir"). */
export const commonOptions = (): Option[] => optionBank.slots.COMMON;
/** Una opción del banco por id, con el casillero al que pertenece. */
export const optionById = (id: string) => optionsById.get(id);
/** Una opción del banco por su texto exacto (sin mayúsculas ni tildes): por si la persona lo escribe en vez de tocarlo. */
const normLabel = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[.!¡¿?\s]+/g, " ").trim();
const optionsByLabel = new Map([...optionsById.values()].filter((o) => !o.noInfo).map((o) => [normLabel(o.label), o]));
export const optionByLabel = (text: string) => optionsByLabel.get(normLabel(text));
