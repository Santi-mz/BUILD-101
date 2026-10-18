import { z } from "zod";
import { AREAS, AXES, type Area, type Axis } from "@/lib/rubric";

// ---------- Salida del analizador (LLM 1), Documento 2 sección 7 ----------
/** Evidencias máximas por mensaje (después de sacar duplicados): una respuesta rica puede traer muchos intereses. */
export const MAX_EVIDENCE_PER_TURN = 12;
export const analyzerEvidenceSchema = z.object({
  indicatorId: z.string(),
  area: z.enum(AREAS).optional(),
  axis: z.enum(AXES).optional(),
  value: z.string().max(60).optional(),
  polarity: z.union([z.literal(1), z.literal(-1)]),
  kind: z.enum(["DECLARED", "HYPOTHESIS"]),
  concrete: z.boolean(),
  quote: z.string().max(400),
  rationale: z.string().max(300),
});

export const analyzerOutputSchema = z.object({
  evidence: z.array(analyzerEvidenceSchema).max(MAX_EVIDENCE_PER_TURN),
  confirmation: z
    .object({
      target: z.enum(["LEVEL_SUMMARY", "HYPOTHESIS"]),
      result: z.enum(["CONFIRMED", "REJECTED", "PARTIAL"]),
      corrections: z.string().max(300).optional(),
    })
    .optional(),
  contradictions: z.array(z.object({ indicatorId: z.string(), description: z.string().max(300) })),
  answerQuality: z.enum(["RICH", "BRIEF", "EVASIVE", "OFF_TOPIC"]),
  risk: z.object({
    flag: z.boolean(),
    category: z.enum(["SUICIDIO", "AUTOLESION", "VIOLENCIA", "MALESTAR_INTENSO"]).optional(),
  }),
});
export type AnalyzerOutput = z.infer<typeof analyzerOutputSchema>;
export type AnswerQuality = AnalyzerOutput["answerQuality"];
export type RiskCategory = NonNullable<AnalyzerOutput["risk"]["category"]>;

// ---------- Estado de la sesión ----------
export type EvidenceStatus = "PENDING" | "CONFIRMED" | "REJECTED";
export type Evidence = {
  id: string;
  messageId: string;
  indicatorId: string;
  area?: Area;
  axis?: Axis;
  value?: string;
  polarity: 1 | -1;
  kind: "DECLARED" | "HYPOTHESIS";
  concrete: boolean;
  status: EvidenceStatus;
  quote: string;
  rationale: string;
  createdAt: string;
  /** Quién cambió el estado por última vez: el resumen confirmado o la persona desde el panel. */
  changedBy?: "summary" | "user";
};

export type LevelStatus = "OPEN" | "SUMMARIZED" | "CONFIRMED";
export type LevelState = { level: number; status: LevelStatus; summary?: string; confirmedAt?: string; turns: number };

export type ActionType =
  | "SAFETY"
  | "CLOSE"
  | "WAIT_CONFIRMATION"
  | "GO_BACK"
  | "SUMMARIZE_LEVEL"
  | "FLAT_PROFILE_STRATEGY"
  | "ADVANCE_LEVEL"
  | "ASK_DEEPEN"
  | "CHANGE_ANGLE"
  | "ASK_NEW"
  | "EXAMINE_BELIEF"
  | "OFFER_CLOSE"
  | "GREETING";

export type Action = {
  type: ActionType;
  level: number;
  indicatorId?: string;
  notes?: string;
  /** Nivel al que se mueve la sesión (al saltar niveles ya confirmados). */
  setLevel?: number;
  /** Intención de la persona que el mensaje tiene que atender (pedir cerrar, reclamo, confusión, pedir recomendación). */
  intent?: "CLOSE" | "ALREADY_SAID" | "CONFUSED" | "ASK_RECOMMENDATION";
};

export type Message = { id: string; role: "USER" | "ASSISTANT"; content: string; action?: Action; createdAt: string };

export type SessionStatus = "ACTIVE" | "COMPLETED" | "SAFETY_STOP" | "DELETED";

/** Estados del recorrido completo (blueprint, sección 4.3). */
export type Phase =
  | "DISCOVERY"
  | "PROFILE_REVIEW"
  | "RESEARCHING_OPTIONS"
  | "OPTIONS_PRESENTED"
  | "PATH_EXPLORATION"
  | "MATCHING_HUMANS"
  | "NEXT_STEP";

export type AgeRange = "A14_15" | "A16_17" | "A18_21" | "A22_25" | "A26_MAS";

export type ConsentPurpose = "session" | "mentors";
export type Consent = { purpose: ConsentPurpose; version: string; status: "granted" | "withdrawn"; at: string; pathId?: string };

export type TaskStatus = "pending" | "running" | "completed" | "failed" | "cancelled";
export type AgentTask = {
  taskId: string;
  type: "DISCOVER_OPPORTUNITIES" | "VERIFY_OPPORTUNITIES" | "RANK_PATHS" | "FIND_MENTORS";
  agent: "A2" | "A3" | "A4" | "A5";
  status: TaskStatus;
  createdAt: string;
  finishedAt?: string;
  summary?: string;
  error?: string;
};

export type OpportunityStatus = "verified" | "partial" | "stale" | "unverified" | "demo";
export type OpportunityType = "degree" | "technical" | "course" | "internship" | "exchange" | "experience" | "occupation";

export type Opportunity = {
  opportunity_id: string;
  type: OpportunityType;
  category: "training" | "practical" | "adjacent";
  title: string;
  summary: string;
  provider: string;
  country: string;
  modality: "presencial" | "distancia" | "hibrida" | "unknown";
  schedule?: "diurno" | "nocturno" | "flexible" | "unknown";
  cost?: "gratuito" | "pago" | "unknown";
  requirements: string | null;
  riasec: Partial<Record<Area, number>>;
  tags: string[];
  status: OpportunityStatus;
  source_url: string | null;
  source_name?: string;
  verified_at: string | null;
  unknowns: string[];
};

export type CheckedOpportunity = Opportunity & { checks: { field: string; ok: boolean; note: string }[]; warnings: string[] };

export type Route = {
  path_id: string;
  opportunity: CheckedOpportunity;
  what: string;
  why_this: string;
  evidence_ids: string[];
  potential_appeal: string;
  potential_tradeoffs: string;
  known: string;
  open_questions: string[];
  action_today: string;
  excluded_reason?: string;
};

export type RecommendationSet = {
  id: string;
  createdAt: string;
  filters: Filters;
  routes: Route[];
  note: string;
  rejected?: boolean;
};

export type Filters = {
  country: "UY";
  modality: "cualquiera" | "presencial" | "distancia";
  schedule: "cualquiera" | "nocturno";
  cost: "cualquiera" | "gratuito";
};

export type MentorMatch = {
  mentor_id: string;
  public_alias: string;
  experience: string;
  verification_status: "verified" | "demo";
  topics: string[];
  contact_mode: "moderated_async_question";
  can_receive_question: boolean;
};
export type MentorResult = { path_id: string; matches: MentorMatch[]; fallback: string | null; suggested_questions: string[] };

export type SessionState = {
  id: string;
  createdAt: string;
  expiresAt: string;
  ageRange: AgeRange;
  consentAt: string;
  guardianConsent: boolean;
  status: SessionStatus;
  phase: Phase;
  currentLevel: number;
  userTurns: number;
  rubricVersion: string;
  promptVersion: string;
  model: string;
  /** Usuario de Supabase (si entró con cuenta); sirve para ordenar el feed de noticias. */
  userId?: string;
  messages: Message[];
  evidence: Evidence[];
  levels: LevelState[];
  pendingConfirmation: { level: number; tries: number } | null;
  lastAction: Action | null;
  lastIndicator: string | null;
  sameIndicatorTries: number;
  qualityHistory: AnswerQuality[];
  flatStrategyTried: boolean;
  closeOffered: boolean;
  beliefExamsInRow: number;
  beliefExamsTotal: number;
  lastN4Turn: number;
  wentBack: string[];
  openContradictions: { indicatorId: string; description: string }[];
  safetyEvents: { id: string; category: string; at: string }[];
  consents: Consent[];
  tasks: AgentTask[];
  recommendations: RecommendationSet[];
  selectedPathId: string | null;
  pathQuestions: { question: string; answer: string; at: string }[];
  mentorResult: MentorResult | null;
  nextStep: string | null;
  feedback: { usefulness: number; clarity: number; wouldUseAgain: boolean; comment?: string; at: string } | null;
};
