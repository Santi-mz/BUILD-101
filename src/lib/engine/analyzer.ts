import { indicator, rubric, type Area } from "@/lib/rubric";
import { LLMUnavailable, type LLMProvider } from "@/lib/llm/provider";
import { ANALYZER_SYSTEM } from "@/prompts/analyzer.v1";
import { panelLabel } from "./profile";
import { precheck } from "./safety";
import { analyzerOutputSchema, MAX_EVIDENCE_PER_TURN, type AnalyzerOutput, type SessionState } from "./types";

/**
 * Analizador (LLM 1): convierte el último mensaje en evidencias de la rúbrica. Validación Zod,
 * 1 reintento y fallback (evidence vacío) si vuelve a fallar. En modo mock usa reglas deterministas.
 */
export const EMPTY_OUTPUT: AnalyzerOutput = { evidence: [], contradictions: [], answerQuality: "BRIEF", risk: { flag: false } };

const JSON_SCHEMA = {
  type: "object",
  properties: {
    evidence: {
      type: "array",
      items: {
        type: "object",
        properties: {
          indicatorId: { type: "string" },
          area: { type: "string", enum: ["R", "I", "A", "S", "E", "C"] },
          axis: { type: "string", enum: ["PERSONAS", "COSAS", "DATOS", "IDEAS"] },
          value: { type: "string" },
          polarity: { type: "integer", enum: [1, -1] },
          kind: { type: "string", enum: ["DECLARED", "HYPOTHESIS"] },
          concrete: { type: "boolean" },
          quote: { type: "string" },
          rationale: { type: "string" },
        },
        required: ["indicatorId", "polarity", "kind", "concrete", "quote", "rationale"],
      },
    },
    confirmation: {
      type: "object",
      properties: {
        target: { type: "string", enum: ["LEVEL_SUMMARY", "HYPOTHESIS"] },
        result: { type: "string", enum: ["CONFIRMED", "REJECTED", "PARTIAL"] },
        corrections: { type: "string" },
      },
      required: ["target", "result"],
    },
    contradictions: {
      type: "array",
      items: { type: "object", properties: { indicatorId: { type: "string" }, description: { type: "string" } }, required: ["indicatorId", "description"] },
    },
    answerQuality: { type: "string", enum: ["RICH", "BRIEF", "EVASIVE", "OFF_TOPIC"] },
    risk: {
      type: "object",
      properties: { flag: { type: "boolean" }, category: { type: "string", enum: ["SUICIDIO", "AUTOLESION", "VIOLENCIA", "MALESTAR_INTENSO"] } },
      required: ["flag"],
    },
  },
  required: ["evidence", "contradictions", "answerQuality", "risk"],
};

function rubricContext(lvl: number) {
  const detailed = [lvl, 4].filter((v, i, a) => a.indexOf(v) === i);
  return rubric.levels
    .map((L) => {
      if (detailed.includes(L.level)) {
        return `Nivel ${L.level} · ${L.name} (DETALLADO)\n${L.indicators
          .map(
            (i) =>
              `- ${i.id}${i.area ? ` [area ${i.area}]` : ""}${i.axis ? ` [axis ${i.axis}]` : ""}: ${i.plain}. Evidencia válida: ${i.validEvidence.join("; ")}.${i.notEnough ? ` No alcanza: ${i.notEnough.join("; ")}.` : ""} Prohibido inferir: ${i.forbiddenInferences.join("; ")}.`,
          )
          .join("\n")}`;
      }
      return `Nivel ${L.level} · ${L.name}: ${L.indicators.map((i) => `${i.id}${i.area ? `[${i.area}]` : ""}${i.axis ? `[${i.axis}]` : ""} (${i.plain})`).join("; ")}`;
    })
    .join("\n\n");
}

export function buildAnalyzerPrompt(s: SessionState, userText: string) {
  const recent = s.messages.slice(-9, -1).map((m) => `${m.role === "USER" ? "Persona" : "Agente"}: ${m.content}`).join("\n");
  const confirmed = s.evidence.filter((e) => e.status === "CONFIRMED").map((e) => `${e.indicatorId}: ${panelLabel(e)} ("${e.quote}")`);
  const last = s.lastAction;
  return `RÚBRICA
${rubricContext(s.currentLevel)}

PERFIL CONFIRMADO
${confirmed.length ? confirmed.join("\n") : "(nada confirmado todavía)"}

ÚLTIMOS MENSAJES
${recent || "(inicio)"}

ÚLTIMA ACCIÓN DEL AGENTE: ${last?.type ?? "ninguna"}${last?.indicatorId ? ` sobre ${last.indicatorId}` : ""}${s.pendingConfirmation ? `\nEl agente PIDIÓ CONFIRMAR el resumen del nivel ${s.pendingConfirmation.level}: completá "confirmation".` : ""}

ÚLTIMO MENSAJE DE LA PERSONA (citá solo de acá):
"""${userText}"""`;
}

export async function analyze(provider: LLMProvider, s: SessionState, userText: string): Promise<{ output: AnalyzerOutput; fallback: boolean }> {
  if (provider.name === "mock") return { output: mockAnalyze(s, userText), fallback: false };
  const prompt = buildAnalyzerPrompt(s, userText);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = (await provider.json({ system: ANALYZER_SYSTEM, prompt, jsonSchema: JSON_SCHEMA })) as Record<string, unknown> | null;
      const parsed = analyzerOutputSchema.safeParse(clean(raw));
      if (parsed.success) {
        parsed.data.evidence = parsed.data.evidence.filter((e) => indicator(e.indicatorId));
        return { output: parsed.data, fallback: false };
      }
    } catch (err) {
      console.warn(JSON.stringify({ event: "analyzer.error", attempt, error: String(err).slice(0, 120) }));
      // Ningún modelo respondió a tiempo: reintentar solo alargaría el turno.
      if (err instanceof LLMUnavailable) break;
    }
  }
  // Fallback: el analizador por reglas. Saca menos evidencias que el LLM, pero no deja el turno vacío
  // (con evidencia vacía el planificador tomaba toda respuesta como "breve" y pedía ejemplos sin sentido).
  return { output: mockAnalyze(s, userText), fallback: true };
}

/** Clave de una evidencia para sacar duplicados (mismo indicador, área, eje y valor). */
const evidenceKey = (e: { indicatorId?: unknown; area?: unknown; axis?: unknown; value?: unknown }) =>
  `${e.indicatorId}|${e.area ?? ""}|${e.axis ?? ""}|${String(e.value ?? "").toLowerCase()}`;

/**
 * Recorta campos largos antes de validar (el modelo a veces se pasa del límite). Los duplicados se sacan
 * ANTES del tope por mensaje: si no, una respuesta rica con repetidos perdía evidencias distintas.
 */
function clean(raw: Record<string, unknown> | null) {
  if (!raw || typeof raw !== "object") return raw;
  const seen = new Set<string>();
  const ev = (Array.isArray(raw.evidence) ? raw.evidence : []).filter((e: Record<string, unknown>) => {
    const k = evidenceKey(e);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return {
    ...raw,
    contradictions: Array.isArray(raw.contradictions) ? raw.contradictions : [],
    evidence: ev.slice(0, MAX_EVIDENCE_PER_TURN).map((e: Record<string, unknown>) => ({
      ...e,
      quote: String(e.quote ?? "").slice(0, 400),
      rationale: String(e.rationale ?? "").slice(0, 300),
      value: e.value ? String(e.value).slice(0, 60) : undefined,
      area: e.area || undefined,
      axis: e.axis || undefined,
    })),
  };
}

// ---------------------------------------------------------------------------------------------
// Analizador por reglas (modo mock y pruebas). Determinista: mismo texto => mismas evidencias.
// ---------------------------------------------------------------------------------------------
const norm = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const AREA_RULES: Record<Area, RegExp> = {
  R: /\b(arregl|armar|constru|cocin|deporte|futbol|entren|campo|taller|herramient|mecanic|carpinter|jardin|plant(e|o|ar)|animales|caball|bici|reparar|repare|soldar)/,
  I: /\b(investig|configur|programe|programar|entender como|como funciona|por que pasa|curiosidad|experiment|ciencia|astronom|problemas? dificil|averigu|analiz|descubr|estudi(e|o) por mi cuenta|me puse a buscar|calcul)/,
  A: /\b(dibuj|music|audio|sonido|beats?|toco (la|el)|tocar (la|el)|compon|produzco|produje|producir|escrib|(hago|grabo|filmo|armo|grabar|filmar|hacer) videos?|edit|disen|pint|foto|teatro|cante|canto|bail|crear|cree algo|invente)/,
  S: /\b(ayud|ensen|explic|cuid|voluntari|acompan|escuch(o|ar|e) a|consejo|mis amigos me cuentan|me buscan para)/,
  E: /\b(organic|organiz(e|o|ar) (un|una|el|la|eventos?|salida|fiesta|torneo|rifa)|lider|vend|negoci|convenc|emprend|evento|a cargo|delegad|capitan|presente frente)/,
  C: /\b(orden(o|ar|e|ado)|planilla|excel|listas?|cuentas|registr|calendario|archiv|clasific|inventario|presupuesto|organizo mis)/,
};
// Un hábito ("todos los viernes", "cada finde") también es concreto: ya dice qué hace y cuándo.
const CONCRETE = /\b(una vez|todos los (dias|lunes|martes|miercoles|jueves|viernes|sabados|domingos|findes|fines de semana|veranos)|cada (semana|finde|fin de semana|verano)|el otro dia|el ano pasado|la semana pasada|el verano|cuando (tenia|estaba|fui|hice)|hice|arme|organice|ayude|toque|fui|estuve|me quede|aprendi|tuve que|construi|cocine|dibuje|escribi|edite|vendi|explique|cuide|configure|arregle|produje|investigue|lidere|presente|participe)\b/;
const NEG_CLAUSE = /\b(no me gusta|no me gustaba|odio|me aburre|me aburria|detesto|evito|no soporto|no me interesa|nada que ver con)\b/;

const AXIS_FROM_AREA: Record<Area, ("PERSONAS" | "COSAS" | "DATOS" | "IDEAS")[]> = {
  R: ["COSAS"], I: ["IDEAS"], A: ["IDEAS"], S: ["PERSONAS"], E: ["PERSONAS"], C: ["DATOS"],
};

const VALUE_RULES: [RegExp, string][] = [
  [/\b(libertad|mis propios horarios|autonom|independ|ser mi propio jefe|que nadie me mande)/, "autonomia"],
  [/\b(estab|seguridad|algo fijo|trabajo fijo)/, "estabilidad"],
  [/\b(plata|ganar bien|buen sueldo|ingresos|dinero)/, "ingresos"],
  [/\b(creativ|crear cosas|inventar)/, "creatividad"],
  [/\b(aprender|seguir aprendiendo|aprendizaje)/, "aprendizaje"],
  [/\b(variedad|no hacer siempre lo mismo|rutina me aburre|cosas distintas)/, "variedad"],
  [/\b(buen ambiente|buena onda|buenos companeros|trabajar en equipo)/, "buen_ambiente"],
  [/\b(ayudar a (la gente|otros|personas)|servir a|ser util)/, "ayudar"],
  [/\b(reconoc|que me valoren)/, "reconocimiento"],
  [/\b(ver (el|los) resultados?|ver lo que hice|logr)/, "logro"],
  [/\b(tiempo (para|libre)|mis proyectos|equilibrio|vida personal|tiempo con mi familia)/, "equilibrio"],
];

const BARRIER_RULES: [RegExp, string][] = [
  [/\b(de noche|nocturno|solo puedo (estudiar|cursar) de noche|trabajo de dia)/, "solo puede cursar de noche"],
  [/\b(fuera de uruguay|no puedo (irme|estudiar fuera|salir) del pais|irme del pais)/, "no estudiar fuera de Uruguay"],
  [/\b(no puedo pagar|no tengo plata|caro|gratis|gratuit)/, "necesita opciones gratuitas o de bajo costo"],
  [/\b(vivo en el interior|lejos de montevideo|no puedo mudarme|en el interior)/, "vive en el interior / no puede mudarse"],
  [/\b(a distancia|online|virtual|desde casa)/, "prefiere modalidad a distancia"],
  [/\b(trabajo de dia|trabajo todo el dia|tengo que trabajar|cuido a mis hermanos)/, "tiene poco tiempo disponible"],
];

/** Tramos negados de una cláusula normalizada: desde la negación hasta la próxima coma, "y"/"e" o el final. */
function negationSpans(c: string): [number, number][] {
  const spans: [number, number][] = [];
  const re = new RegExp(NEG_CLAUSE.source, "g");
  for (let m = re.exec(c); m; m = re.exec(c)) {
    const rest = c.slice(m.index + m[0].length);
    const end = rest.search(/,|\s(y|e)\s/);
    spans.push([m.index, end === -1 ? c.length : m.index + m[0].length + end]);
  }
  return spans;
}

function clauses(text: string) {
  // También por comas: en una respuesta larga ("me encanta dibujar, ayudo en la panadería, el año pasado organicé…")
  // cada interés queda con su cita y su propio "concreto", en vez de que el primer área se lleve todo.
  return text.split(/(?<=[.;!?])\s+|,\s*(?:pero|aunque)\s+|\s+pero\s+|,\s+/i).map((c) => c.trim()).filter(Boolean);
}

export function mockAnalyze(s: SessionState, userText: string): AnalyzerOutput {
  const out: AnalyzerOutput = { evidence: [], contradictions: [], answerQuality: "RICH", risk: precheck(userText) };
  const t = norm(userText);
  const words = userText.trim().split(/\s+/).filter(Boolean).length;
  const seen = new Set<string>();
  const push = (e: Omit<AnalyzerOutput["evidence"][number], "rationale"> & { rationale?: string }) => {
    const k = evidenceKey(e);
    if (seen.has(k) || out.evidence.length >= MAX_EVIDENCE_PER_TURN) return;
    seen.add(k);
    out.evidence.push({ rationale: e.rationale ?? "Regla del modo demo (mock)", ...e });
  };

  // Confirmación de un resumen pendiente.
  if (s.pendingConfirmation) {
    let result: "CONFIRMED" | "REJECTED" | "PARTIAL" | null = null;
    if (/\b(mas o menos|en parte|algo asi|casi|si pero|si, pero|no del todo)\b/.test(t)) result = "PARTIAL";
    else if (/^(no|nop|nope)[.!]*$|^no[,.!]\s|^(para nada|nada que ver)|\bno es asi\b|\bno me representa\b|^no (tanto|mucho|tan asi)\b/.test(t)) result = "REJECTED";
    else if (/^(si|sii+|exacto|tal cual|totalmente|correcto|obvio|dale|de una|me representa|esta bien|claro)\b/.test(t) || /\bme representa\b/.test(t)) result = "CONFIRMED";
    if (result) out.confirmation = { target: "LEVEL_SUMMARY", result, corrections: result === "CONFIRMED" ? undefined : userText.slice(0, 300) };
  }

  // Un ejemplo concreto sin área propia ("…, el año pasado hice uno de naves con un amigo") es el ejemplo de los
  // intereses que se nombran en el mismo mensaje ("me encanta programar jueguitos, …").
  const orphanExample = clauses(userText).some((cl) => {
    const c = norm(cl);
    return CONCRETE.test(c) && !(Object.keys(AREA_RULES) as Area[]).some((a) => AREA_RULES[a].test(c));
  });
  for (const clause of clauses(userText)) {
    const c = norm(clause);
    const neg = NEG_CLAUSE.test(c);
    const quote = clause.slice(0, 200);
    const areas = (Object.keys(AREA_RULES) as Area[]).filter((a) => AREA_RULES[a].test(c));
    // La negación alcanza solo hasta la próxima coma o "y": "odio las planillas y me encanta construir" no niega construir.
    const spans = negationSpans(c);
    const negated = (a: Area) => {
      const at = c.search(AREA_RULES[a]);
      return spans.some(([from, to]) => at >= from && at < to);
    };
    const positives = areas.filter((a) => !negated(a));
    // Concreto salvo que todo lo nombrado esté negado ("con mis amigos, todos los viernes" no nombra un área y es concreto).
    // Sin área nombrada ("con mis amigos, todos los viernes"), lo concreto puede estar en otra parte del mensaje.
    const concrete = areas.length === 0 ? CONCRETE.test(t) : (CONCRETE.test(c) || orphanExample) && positives.length > 0;
    for (const area of areas) {
      const pol = negated(area) ? -1 : 1;
      push({ indicatorId: `N2.${area}`, area, polarity: pol, kind: "DECLARED", concrete: pol === 1 && concrete, quote });
      for (const axis of AXIS_FROM_AREA[area] ?? []) push({ indicatorId: `N1.${axis}`, axis, polarity: pol, kind: "DECLARED", concrete: pol === 1 && concrete, quote });
      if (concrete && area === positives[0]) push({ indicatorId: "N3.ACTIVIDAD", area, polarity: 1, kind: "DECLARED", concrete: true, quote });
    }
    const rejected = areas.find(negated);
    if (rejected) push({ indicatorId: "N3.RECHAZO", area: rejected, polarity: 1, kind: "DECLARED", concrete: false, quote });
    if (!areas.length && /\b(con (mis |los |unos )?(amigos|amigas|gente|personas|companeros)|en grupo)\b/.test(c)) push({ indicatorId: "N1.PERSONAS", axis: "PERSONAS", polarity: 1, kind: "DECLARED", concrete, quote });
    if (/\b(se me pasan las horas|pierdo la nocion|me quedo horas|horas y horas|me colgue)\b/.test(c))
      push({ indicatorId: "N3.FLOW", area: areas[0], polarity: 1, kind: "DECLARED", concrete: true, quote });
    const tema = c.match(/\b(miro videos de|leo sobre|busco sobre|me interesa(n)? (el|la|los|las)?)\s*([a-z ]{3,40})/);
    if (tema) push({ indicatorId: "N3.TEMA", area: areas[0], value: tema[4].trim().split(" ").slice(0, 4).join(" "), polarity: 1, kind: "DECLARED", concrete: false, quote });
    if (/\b(siempre termino|en los grupos|yo soy (el|la) que|me toca (organizar|presentar|investigar|disenar))\b/.test(c))
      push({ indicatorId: "N3.ROL", area: areas[0], polarity: 1, kind: "DECLARED", concrete, quote });

    for (const [re, v] of VALUE_RULES) if (re.test(c)) push({ indicatorId: "N4.VALOR", value: v, polarity: neg ? -1 : 1, kind: "DECLARED", concrete, quote });
    for (const [re, v] of BARRIER_RULES) if (re.test(c)) { push({ indicatorId: "N4.BARRERA", value: v, polarity: 1, kind: "DECLARED", concrete: false, quote }); break; }
    if (/\b(soy mal[oa]|no sirvo|no soy buen[oa]|me cuesta|no me da la cabeza)\b/.test(c))
      push({ indicatorId: "N4.AUTOEF", area: /numer|matemat|cuentas/.test(c) ? "C" : areas[0], polarity: -1, kind: "DECLARED", concrete: false, quote });
    if (/\b(me sale bien|soy buen[oa] (en|para)|me va bien en)\b/.test(c))
      push({ indicatorId: "N4.AUTOEF", area: areas[0], polarity: 1, kind: "DECLARED", concrete, quote });
    if (/\b(de eso no se vive|no hay trabajo|no tiene salida|muerto de hambre|no da plata)\b/.test(c))
      push({ indicatorId: "N4.EXPECT", polarity: 1, kind: "DECLARED", concrete: false, quote });
    if (/\b(me apoya|me apoyan|me banca|me bancan|me ayuda mi|me ayudan mis)\b/.test(c))
      push({ indicatorId: "N4.APOYO", value: clause.slice(0, 50), polarity: 1, kind: "DECLARED", concrete: false, quote });
    if (/\b(deberia|tendria que|me dicen que|quieren que)\b/.test(c))
      push({ indicatorId: "N4.INFLUENCIA", polarity: 1, kind: "DECLARED", concrete: false, quote });

    // Nivel 0
    if (/\b(no tengo (ni )?idea|ni idea|no se que (hacer|estudiar|elegir)|(esta )?todo abierto|cero claro|estoy pintad[oa]|perdid[oa]|crisis vocacional)\b/.test(c))
      push({ indicatorId: "N0.ESTADO", value: "sin opciones", polarity: 1, kind: "DECLARED", concrete: false, quote });
    else if (/\b(dudo entre|entre dos|varias opciones|varias cosas|no se si)\b/.test(c))
      push({ indicatorId: "N0.ESTADO", value: "varias opciones", polarity: 1, kind: "DECLARED", concrete: false, quote });
    else if (/\b(ya se (que|lo que)|tengo claro|tengo (una )?idea|quiero estudiar|me gustaria estudiar)\b/.test(c))
      push({ indicatorId: "N0.ESTADO", value: "una preferida", polarity: 1, kind: "DECLARED", concrete: false, quote });
    if (/\b(no conozco|no se que (hay|opciones)|no se como funciona|me falta (informacion|info)|no tengo informacion)\b/.test(c))
      push({ indicatorId: "N0.INFO", polarity: 1, kind: "DECLARED", concrete: false, quote });
    if (/\b(mis (viejos|padres)|mi (familia|mama|papa|madre|padre))\b.*\b(quieren|dicen|esperan|insisten|prefieren)\b/.test(c))
      push({ indicatorId: "N0.CONF_EXT", polarity: 1, kind: "DECLARED", concrete: false, quote });
    if (/\b(me gustan las dos|tironea|choca con|por un lado .* por otro)\b/.test(c))
      push({ indicatorId: "N0.CONF_INT", polarity: 1, kind: "DECLARED", concrete: false, quote });
    if (/\b(no me gusta nada|me da igual|no tengo ganas|me da lo mismo)\b/.test(c))
      push({ indicatorId: "N0.MOTIV", polarity: 1, kind: "DECLARED", concrete: false, quote });
    if (/\b(arruino mi vida|arruinarme la vida|arruinar mi vida|si me equivoco|equivocarme|elegir mal|carrera perfecta|para toda la vida|no hay vuelta atras|me arruino)\b/.test(c))
      push({ indicatorId: "N0.CREENCIAS", polarity: 1, kind: "DECLARED", concrete: false, quote });
    if (/\b(me gusta todo|me interesan muchas cosas|muchas cosas me gustan)\b/.test(c))
      push({ indicatorId: "N1.ENTUSIASMO", value: "alto", polarity: 1, kind: "DECLARED", concrete: false, quote });
  }

  // Contradicciones con lo confirmado: una evidencia en contra de un área confirmada a favor.
  for (const e of out.evidence) {
    if (e.polarity !== -1 || !e.area || !e.indicatorId.startsWith("N2.")) continue;
    const conf = s.evidence.some((x) => x.status === "CONFIRMED" && x.area === e.area && x.polarity === 1 && x.indicatorId.startsWith("N2."));
    if (conf) out.contradictions.push({ indicatorId: e.indicatorId, description: `Antes confirmaste interés en esto y ahora decís: "${e.quote}"` });
  }

  const evasive = /^(no se|nose|ni idea|paso|nada|no|ninguna|ninguno|que se yo|no me acuerdo)[.!]*$/.test(t.trim());
  if (evasive) out.answerQuality = "EVASIVE";
  else if (out.confirmation) out.answerQuality = "RICH";
  else if (words <= 4 || !out.evidence.length) out.answerQuality = "BRIEF";
  else out.answerQuality = out.evidence.some((e) => e.concrete) || words > 12 ? "RICH" : "BRIEF";
  return out;
}


