import type { Part } from "@google/genai";
import { z } from "zod";
import { genai, withRetry } from "@/lib/agent/run";

// Datos que la IA extrae de fuentes externas (CV / LinkedIn en PDF, GitHub) para enriquecer la entrevista.
export const Extracted = z.object({
  headline: z.string().describe("Una línea: quién es y qué hace hoy"),
  education: z.array(z.string()).describe("Estudios, con institución y estado (en curso, terminado)"),
  experience: z.array(z.string()).describe("Trabajos, proyectos o voluntariados, con rol"),
  skills: z.array(z.string()).describe("Habilidades concretas"),
  interests: z.array(z.string()).describe("Temas que le interesan según la fuente"),
  riasec_hints: z
    .array(z.object({ type: z.enum(["R", "I", "A", "S", "E", "C"]), evidence: z.string().describe("Qué dato de la fuente lo sugiere") }))
    .describe("Indicios de tipos RIASEC de Holland, solo con evidencia concreta de la fuente"),
  summary: z.string().describe("Resumen de 2 o 3 frases para el orientador, en español rioplatense"),
});
export type Extracted = z.infer<typeof Extracted>;
export type ImportSource = "cv" | "github";

const SYSTEM =
  "Extraés información vocacional de fuentes que el propio usuario comparte para una app de orientación vocacional en Uruguay. Solo extraé lo que dice la fuente, sin inventar. No incluyas datos sensibles (documento, dirección, teléfono, email, salud).";

async function extract(parts: Part[]): Promise<Extracted> {
  const res = await withRetry((model) =>
    genai().models.generateContent({
      model,
      contents: [{ role: "user", parts }],
      config: { systemInstruction: SYSTEM, responseMimeType: "application/json", responseJsonSchema: z.toJSONSchema(Extracted) },
    }),
  );
  return Extracted.parse(JSON.parse(res.text ?? "{}"));
}

/** CV o perfil de LinkedIn exportado a PDF. El PDF no se guarda: solo lo extraído. */
export function extractFromPdf(pdf: Buffer) {
  return extract([
    { inlineData: { mimeType: "application/pdf", data: pdf.toString("base64") } },
    { text: "Este es el CV o el perfil de LinkedIn del usuario. Extraé la información vocacional." },
  ]);
}

/** Perfil público de GitHub (API pública, sin login). */
export async function extractFromGithub(username: string) {
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "rumbo-build101" };
  const [userRes, reposRes] = await Promise.all([
    fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, { headers }),
    fetch(`https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=updated&per_page=30`, { headers }),
  ]);
  if (userRes.status === 404) throw new Error("No existe ese usuario de GitHub.");
  if (!userRes.ok || !reposRes.ok) throw new Error("GitHub no respondió, probá en un rato.");
  const user = await userRes.json();
  const repos = (await reposRes.json()) as { name: string; description: string | null; language: string | null; topics?: string[]; fork: boolean; stargazers_count: number }[];
  const data = {
    bio: user.bio,
    company: user.company,
    public_repos: user.public_repos,
    repos: repos
      .filter((r) => !r.fork)
      .map((r) => ({ name: r.name, description: r.description, language: r.language, topics: r.topics, stars: r.stargazers_count })),
  };
  return extract([{ text: `Perfil público de GitHub del usuario (JSON):\n${JSON.stringify(data)}\nExtraé la información vocacional: lenguajes, tipos de proyectos y temas.` }]);
}

/** Nota que se agrega a la conversación para que el agente use los datos. */
export function importNote(source: ImportSource, e: Extracted) {
  const name = source === "cv" ? "su CV / perfil de LinkedIn" : "su perfil público de GitHub";
  return `[Datos importados de ${name}, compartidos por el usuario. Tomalos como evidencia a confirmar con preguntas, no como certezas.]\n${JSON.stringify(e)}`;
}
