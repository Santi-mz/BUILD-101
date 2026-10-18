import { Type, type FunctionDeclaration } from "@google/genai";

// Modelo de Gemini Live (voz a voz en tiempo real).
export const LIVE_MODEL = "gemini-3.8-live";

/**
 * En voz, Gemini Live es solo la voz y el oído: escucha, transcribe y lee en voz alta.
 * Qué se pregunta, qué se entiende y cuándo se cierra lo sigue decidiendo el motor (runTurn) vía /api/chat,
 * igual que en el chat escrito.
 */
export const LIVE_TOOLS: FunctionDeclaration[] = [
  {
    name: "responder",
    description: "Manda al motor de la entrevista lo que dijo la persona y devuelve el texto exacto que hay que decirle.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        texto: { type: Type.STRING, description: "Lo que dijo la persona, lo más literal posible, en español." },
        terminar: { type: Type.BOOLEAN, description: "true solo si la persona pidió terminar la charla y ver lo que se entendió." },
      },
      required: ["texto"],
    },
  },
];

export const LIVE_INSTRUCTION = `Sos la voz de Rumbo, una entrevista de orientación vocacional en español rioplatense. Hablás en vivo con una persona joven.

Tu único trabajo es ser la voz de la entrevista. No hacés preguntas propias, no opinás, no recomendás carreras ni das porcentajes.
- Cada vez que la persona termina de hablar, llamá a la herramienta "responder" con lo que dijo, lo más literal posible.
- Si pide terminar o ver lo que entendiste, llamá a "responder" con terminar: true.
- Cuando la herramienta te devuelva "decir", decilo en voz alta palabra por palabra, con tono cálido y natural, sin agregar ni sacar nada.
- Si la herramienta devuelve un error, decí: "Perdón, se me cortó. ¿Me lo repetís?"
- Si no entendiste lo que dijo, pedile que lo repita, sin llamar a la herramienta.
- Si te piden que leas un texto en voz alta, leelo tal cual.`;
