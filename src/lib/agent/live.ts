import { SYSTEM_PROMPT } from "./prompt";

// Modelos de Gemini Live (voz a voz en tiempo real), en orden de preferencia.
export const LIVE_MODEL = "gemini-3.8-live";

/** Instrucciones del agente en modo voz: las mismas de siempre, adaptadas a conversación hablada. */
export function liveInstruction(profileSummary: string) {
  return `${SYSTEM_PROMPT}

MODO VOZ (importante): estás hablando en vivo con la persona, no escribiendo.
- Frases cortas y naturales, como en una charla. Una sola pregunta por vez. Nada de listas ni formato.
- offer_choices NO existe en este modo: hacé la pregunta en voz y esperá la respuesta.
- Llamá a update_profile después de cada respuesta del usuario (sin anunciarlo).
- Si una herramienta te devuelve "[Sistema] El perfil está listo", cerrá como dice la sección Cierre y contale en voz el resultado en tres o cuatro frases.
- Si no entendiste lo que dijo, pedile que lo repita con otras palabras.
${profileSummary ? `\nPerfil guardado hasta ahora (seguí desde acá, no repitas lo ya cubierto): ${profileSummary}` : "\nEs la primera charla: presentate en una frase y arrancá."}`;
}
