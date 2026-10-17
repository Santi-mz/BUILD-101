import type { Area } from "@/lib/rubric";

/** Acciones de exploración en la vida real (Parte 1: sin carreras ni instituciones), según lo que más apareció. */
const BY_AREA: Record<Area, string> = {
  R: "Probá un taller o una actividad práctica donde armes, repares o cocines algo de principio a fin.",
  I: "Elegí una pregunta que te dé curiosidad y dedicale una semana a investigarla por tu cuenta.",
  A: "Hacé algo propio desde cero (un dibujo, un tema, un video, un texto) y mostráselo a alguien.",
  S: "Sumate unas horas a una actividad donde acompañes o le expliques algo a otras personas.",
  E: "Organizá algo chico con otras personas: una salida, una feria, una rifa o un torneo.",
  C: "Tomá un proyecto tuyo y ordenalo con una lista o una planilla; fijate si disfrutás esa parte.",
};

export function realLifeActions(top: Area[], flat: boolean): string[] {
  const out = top.slice(0, 2).map((a) => BY_AREA[a]);
  if (flat || out.length < 2) out.push("Probá tres actividades distintas este mes, aunque sean chicas, y anotá cuál te dejó con ganas de más.");
  out.push("Charlá con alguien que haga algo que te llame la atención y preguntale cómo es su día a día.");
  return [...new Set(out)].slice(0, 3);
}

export const RESOURCES = [
  "El equipo de orientación o adscripción de tu centro de estudios.",
  "Ferias y jornadas de puertas abiertas de instituciones educativas.",
  "Personas de tu entorno que estudien o trabajen en algo que te interese.",
];
