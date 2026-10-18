import data from "./catalogo-uy.json";

/**
 * Catálogo de «Dónde estudiar»: programas reales de Uruguay tomados de la página oficial de cada carrera.
 * El JSON se genera fuera del repo (armar_catalogo_v2.py) y no se edita a mano: cada dato tiene su fuente y lo
 * que la fuente no publica dice "No consta en la fuente". No hay registros DEMO.
 */
export const NC = "No consta en la fuente";

type Fuente = { url: string; cita?: string; alcance: string };
export type Programa = {
  id: string;
  area: string;
  nombre_oficial: string;
  institucion: string;
  facultad: string;
  ciudades: string[];
  departamentos: string[];
  otras_localidades: string;
  titulo_final: string;
  titulos_intermedios: string[];
  titulos_nota?: string;
  modalidad: string;
  horario?: string;
  idioma: string;
  idioma_nota?: string;
  duracion: string;
  matricula: string;
  matricula_fuente?: Fuente;
  becas: string;
  becas_nota?: string;
  becas_fuente?: Fuente;
  requisitos_ingreso: string;
  inscripciones: string;
  url_programa: string;
  fecha_verificacion: string;
  pendientes: string[];
};

export const CATALOGO = data as { version: string; fecha_verificacion: string; programas: Programa[] };

export type Modo = "presencial" | "hibrida" | "distancia";
export type Area = { id: string; label: string; riasec: string; careers: string[] };

/** Áreas de interés (las mismas direcciones RIASEC de la devolución). Solo dos tienen catálogo por ahora. */
export const AREAS: Area[] = [
  { id: "tec", label: "Tecnología y datos", riasec: "Investigador · Convencional", careers: ["Ingeniería en Computación", "Ciencia de Datos", "Tecnologías de la Información"] },
  { id: "emp", label: "Organizar y emprender", riasec: "Emprendedor", careers: ["Economía", "Administración y negocios", "Marketing", "Contador Público"] },
  { id: "cre", label: "Diseño, audio y creación", riasec: "Artístico", careers: [] },
  { id: "per", label: "Enseñar, cuidar y acompañar", riasec: "Social", careers: [] },
  { id: "man", label: "Hacer con las manos", riasec: "Realista", careers: [] },
];
const AREA_DEL_CATALOGO: Record<string, string> = { "Tecnología y datos": "tec", "Organizar y emprender": "emp" };

export type Region = { id: string; label: string; countries: string[] };
export const REGIONS: Region[] = [
  { id: "uy", label: "Uruguay", countries: ["Uruguay"] },
  { id: "latam", label: "Latinoamérica", countries: ["Argentina", "Brasil", "Chile", "México"] },
  { id: "eu", label: "Europa", countries: ["España", "Alemania", "Portugal"] },
  { id: "us", label: "Estados Unidos", countries: ["Estados Unidos"] },
  { id: "otro", label: "Otro destino", countries: [] },
];
/** Destinos con catálogo real. Los programas del JSON son todos de Uruguay. */
export const CATALOG_REGIONS = ["uy"];

/**
 * Cómo se relaciona cada programa con las carreras y qué se sabe para filtrar, derivado de su fuente:
 * - direct: el programa es esa carrera; related: carrera cercana según el criterio de Rumbo (se muestra aparte).
 * - tuition: "free" solo con fuente que lo diga; "paid" si la página indica cuotas; si no, "unknown".
 * - modes: modalidades que publica la fuente; null si no publica ninguna.
 * Ninguna fuente confirma una beca específica de la carrera ni una inscripción vigente.
 */
type Atributos = { direct: string[]; related: string[]; tuition: "free" | "paid" | "unknown"; modes: Modo[] | null };
const ATRIBUTOS: Record<string, Atributos> = {
  "udelar-fing-ingenieria-computacion": { direct: ["Ingeniería en Computación"], related: [], tuition: "free", modes: null },
  "udelar-fing-licenciatura-computacion": { direct: [], related: ["Ingeniería en Computación"], tuition: "free", modes: null },
  "utec-lic-ingenieria-datos-ia": { direct: ["Ciencia de Datos"], related: [], tuition: "unknown", modes: ["presencial"] },
  "utec-lic-tecnologias-informacion": { direct: ["Tecnologías de la Información"], related: [], tuition: "unknown", modes: ["hibrida"] },
  "utec-utu-udelar-tecnologo-informatica": { direct: [], related: ["Ingeniería en Computación", "Tecnologías de la Información"], tuition: "unknown", modes: ["presencial", "hibrida"] },
  "ucu-ia-ciencia-datos": { direct: ["Ciencia de Datos"], related: [], tuition: "unknown", modes: ["presencial"] },
  "um-ingenieria-informatica": { direct: [], related: ["Ingeniería en Computación"], tuition: "unknown", modes: null },
  "um-ingenieria-datos-ia": { direct: ["Ciencia de Datos"], related: [], tuition: "unknown", modes: null },
  "ort-ingenieria-sistemas": { direct: [], related: ["Ingeniería en Computación"], tuition: "paid", modes: ["presencial", "hibrida"] },
  "udelar-fcea-lic-economia": { direct: ["Economía"], related: [], tuition: "free", modes: null },
  "udelar-fcea-contador-publico": { direct: ["Contador Público"], related: [], tuition: "free", modes: null },
  "ort-lic-gerencia-administracion": { direct: ["Administración y negocios"], related: ["Marketing"], tuition: "paid", modes: ["presencial"] },
  "ort-lic-economia": { direct: ["Economía"], related: [], tuition: "paid", modes: ["presencial"] },
  "ucu-negocios-economia": { direct: ["Economía", "Administración y negocios"], related: [], tuition: "unknown", modes: ["presencial"] },
  "ucu-comunicacion-marketing": { direct: ["Marketing"], related: [], tuition: "unknown", modes: ["presencial"] },
  "um-lic-marketing": { direct: ["Marketing"], related: [], tuition: "unknown", modes: ["presencial"] },
  "um-direccion-administracion-empresas": { direct: ["Administración y negocios"], related: [], tuition: "unknown", modes: null },
  "ude-lic-administracion-empresas": { direct: ["Administración y negocios"], related: [], tuition: "unknown", modes: null },
  "ude-lic-marketing": { direct: ["Marketing"], related: [], tuition: "unknown", modes: null },
};

export type Ficha = Programa & Atributos & {
  areaId: string;
  region: string;
  pais: string;
  /** Beca específica de la carrera confirmada en la fuente. Hoy ninguna fuente lo confirma. */
  becaConfirmada: boolean;
  /** Inscripción abierta confirmada en la fuente. Hoy ninguna lo confirma. */
  inscripcionVigente: boolean;
};

export const FICHAS: Ficha[] = CATALOGO.programas.map((p) => {
  const a = ATRIBUTOS[p.id];
  if (!a) throw new Error(`Programa sin atributos de filtro: ${p.id}`);
  return { ...p, ...a, areaId: AREA_DEL_CATALOGO[p.area], region: "uy", pais: "Uruguay", becaConfirmada: false, inscripcionVigente: false };
});

/** Organismos reales que publican becas o cursos (la misma lista oficial que usa Rumbo para oportunidades). */
export type FuenteBecas = { name: string; url: string; kinds: string[]; for: string; regions: string[]; countries?: string[] };
export const FUENTES_BECAS: FuenteBecas[] = [
  { name: "ANII · Formación", url: "https://www.anii.org.uy/apoyos/formacion/", kinds: ["Becas"], for: "Estudiar en Uruguay", regions: ["uy"] },
  { name: "Fondo de Solidaridad", url: "https://www.fondodesolidaridad.edu.uy/becas", kinds: ["Becas"], for: "Estudiantes de educación terciaria pública", regions: ["uy"] },
  { name: "Udelar · Becas", url: "https://becas.udelar.edu.uy/", kinds: ["Becas"], for: "Estudiantes de la Udelar", regions: ["uy"] },
  { name: "INEFOP · Cursos", url: "https://www.inefop.uy/cursos", kinds: ["Cursos"], for: "Formación para el trabajo", regions: ["uy"] },
  { name: "AUCI · Becas para uruguayos en el exterior", url: "https://www.gub.uy/agencia-uruguaya-cooperacion-internacional/becas", kinds: ["Becas"], for: "Uruguayos que quieren estudiar en el exterior", regions: ["latam", "eu", "us", "otro"] },
  { name: "Fundación Carolina", url: "https://www.fundacioncarolina.es/formacion/", kinds: ["Becas"], for: "Estudiar en España", regions: ["eu"], countries: ["España"] },
  { name: "DAAD (Alemania)", url: "https://www.daad.de/en/studying-in-germany/scholarships/", kinds: ["Becas"], for: "Estudiar en Alemania", regions: ["eu"], countries: ["Alemania"] },
  { name: "Erasmus+", url: "https://erasmus-plus.ec.europa.eu/opportunities/opportunities-for-individuals/students", kinds: ["Becas", "Movilidad"], for: "Estudiar en la Unión Europea", regions: ["eu"] },
  { name: "Fulbright Uruguay", url: "https://fulbright.org.uy/", kinds: ["Becas"], for: "Estudiar en Estados Unidos", regions: ["us"] },
];
