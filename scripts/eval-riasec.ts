/**
 * Comprobación de calidad del agente (rúbrica Build 101: "calidad de la IA").
 *
 * Simula personas con un tipo RIASEC conocido: otra llamada a Gemini hace de usuario y responde
 * en personaje. Corre el agente real (mismo prompt, mismas herramientas MCP y PubMed real) hasta el
 * cierre y compara el código RIASEC final con el esperado.
 * El perfil se guarda en memoria para no ensuciar la base; las noticias se leen de Supabase real.
 *
 * Uso: npx tsx --env-file=.env.local scripts/eval-riasec.ts [cantidad de personas]
 */
import type { Content } from "@google/genai";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { genai, runAgent, withRetry, type AgentEvent } from "../src/lib/agent/run";
import { riasecCode, shouldStop, type ProfileData } from "../src/lib/profile";

const PERSONAS = [
  { expected: "S", who: "Lucía, 17 años, Montevideo. Termina el liceo. Ama ayudar a otros, es la que escucha a sus amigas, hace voluntariado en un merendero y piensa en psicología o docencia. No le gustan los números ni estar sola frente a una computadora." },
  { expected: "I", who: "Mateo, 18 años, Salto. Le fascinan la biología y la química; arma experimentos caseros, lee divulgación científica y quiere entender cómo funcionan las cosas. Es reservado y prefiere trabajar solo en problemas difíciles." },
  { expected: "A", who: "Valentina, 19 años, Canelones. Dibuja, edita videos para redes y toca guitarra. Odia las reglas rígidas y la rutina; quiere crear cosas propias y expresarse. Le cuesta la matemática." },
  { expected: "R", who: "Bruno, 20 años, Rivera. Arregla motos y bicicletas, trabaja con su padre en carpintería y disfruta construir con las manos al aire libre. No le gusta leer mucho ni hablar en público." },
  { expected: "E", who: "Camila, 22 años, Maldonado. Revende ropa por Instagram, organizó la fiesta de egresados y lidera el grupo en todo. Le motivan las ventas, negociar y la plata; se aburre con tareas repetitivas." },
];
const MAX_TURNS = 16;

/** Cliente Supabase mínimo: `profiles` en memoria y el resto contra Supabase real (lectura). */
function memorySupabase(real: SupabaseClient) {
  let row: { data: ProfileData; status: string; question_count: number } | null = null;
  const profiles = {
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row }) }) }),
    upsert: async (r: typeof row) => {
      row = { ...row!, ...r! };
      return { error: null };
    },
    update: (r: Partial<NonNullable<typeof row>>) => ({
      eq: async () => {
        row = { ...row!, ...r };
        return { error: null };
      },
    }),
  };
  const client = { from: (t: string) => (t === "profiles" ? profiles : real.from(t)) } as unknown as SupabaseClient;
  return { client, get: () => row, set: (r: typeof row) => (row = r) };
}

async function simulateUser(who: string, agentSaid: string, options: string[]) {
  const res = await withRetry((model) =>
    genai().models.generateContent({
      model,
      contents: `El orientador te dijo:\n"""${agentSaid}"""\n${options.length ? `Opciones: ${options.join(" | ")}` : ""}\nRespondé en una o dos frases, en primera persona y en rioplatense. Si hay opciones, podés elegir una o responder libre.`,
      config: { systemInstruction: `Hacés de esta persona, de forma realista y sin exagerar: ${who}` },
    }),
  );
  return (res.text ?? "").trim();
}

async function runPersona(p: (typeof PERSONAS)[number], real: SupabaseClient) {
  const mem = memorySupabase(real);
  mem.set({ data: {} as ProfileData, status: "in_progress", question_count: 0 });
  const history: Content[] = [{ role: "user", parts: [{ text: "Hola, quiero empezar mi orientación vocacional." }] }];
  const tools: Record<string, number> = {};
  const errors: string[] = [];

  for (let turn = 0; turn <= MAX_TURNS; turn++) {
    let said = "";
    let options: string[] = [];
    const emit = (e: AgentEvent) => {
      if (e.type === "text") said += e.delta;
      if (e.type === "choices") {
        said += `\n${e.question}`;
        options = e.options;
      }
      if (e.type === "tool") tools[e.name] = (tools[e.name] ?? 0) + 1;
      if (e.type === "error") errors.push(e.message);
    };
    await runAgent({ history, userId: "eval", supabase: mem.client, emit });
    const row = mem.get()!;
    if (row.status === "final") break;

    const answer = await simulateUser(p.who, said, options);
    history.push({ role: "user", parts: [{ text: answer }] });
    row.question_count += 1;
    const stop = shouldStop(row.data?.riasec ? row.data : null, row.question_count);
    if (stop) {
      history.push({
        role: "user",
        parts: [{ text: `[Mensaje del sistema, no del usuario] El perfil está listo para cerrar (${stop}). No hagas más preguntas: buscá opciones reales con web_search, llamá a finalize_profile y escribí el cierre.` }],
      });
    }
  }

  const row = mem.get()!;
  const code = riasecCode(row.data?.riasec ? row.data : null);
  const recs = row.data?.recommendations ?? [];
  return {
    expected: p.expected,
    code,
    hitTop1: code[0] === p.expected,
    hitTop3: code.includes(p.expected),
    final: row.status === "final",
    answers: row.question_count,
    evidence: row.data?.evidence?.length ?? 0,
    recs: recs.length,
    recsWithUrl: recs.filter((r) => r.url?.startsWith("http")).length,
    tools,
    errors,
  };
}

async function main() {
  const n = Number(process.argv[2] ?? PERSONAS.length);
  const real = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const results = [];
  for (const p of PERSONAS.slice(0, n)) {
    const r = await runPersona(p, real);
    console.log(JSON.stringify(r));
    results.push(r);
  }
  const top1 = results.filter((r) => r.hitTop1).length;
  const top3 = results.filter((r) => r.hitTop3).length;
  const finals = results.filter((r) => r.final).length;
  console.log(`\nRESUMEN: tipo principal acertado ${top1}/${results.length} · dentro del top 3 ${top3}/${results.length} · charlas cerradas ${finals}/${results.length}`);
}

main();
