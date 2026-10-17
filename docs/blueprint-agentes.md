# Conectate con tu futuro

**Blueprint de producto y arquitectura de agentes | Versión 1.0 · 17 de octubre de 2026**

**Documento de implementación para Claude Code / Kiro.** Define qué debe construir un agente de desarrollo, cómo se comporta la IA orientadora, cómo delega a subagentes y cómo se comprueba que el prototipo funciona.

> **Promesa del producto:** No elegimos tu futuro por vos. Te ayudamos a descubrir caminos, contrastarlos con información confiable y conversar con personas que los conocen.

## 0. Resumen ejecutivo

Se propone una aplicación de **exploración vocacional conversacional** para personas de aproximadamente **16 a 20 años**, especialmente en los últimos años de secundaria y primeros estudios terciarios. Su unidad central es una **IA orientadora** que dialoga haciendo preguntas pertinentes y adaptativas, mantiene memoria estructurada y construye hipótesis revisables sobre intereses y necesidades. Cuando existe información suficiente o el usuario solicita explorar, invoca subagentes de investigación para identificar oportunidades reales. Presenta **tres rutas iniciales diferentes, justificadas y comparables**, no un dictamen sobre la “carrera correcta”. Si el usuario profundiza en una ruta, un agente de conexión humana puede buscar, **únicamente en una comunidad de participantes inscritos y verificados**, estudiantes, egresados o profesionales capaces de responder preguntas experienciales.

**Objetivo medible:** después de una sesión, la persona debería poder identificar al menos una opción que le despierte interés, explicar por qué y elegir un próximo paso concreto, aunque todavía no haya decidido qué estudiar.

**No objetivos:** realizar diagnósticos psicológicos; asignar una profesión definitiva; deducir inteligencia o aptitudes clínicas; reemplazar a un orientador especializado; prometer cupos, empleo, salarios o acceso a mentores; publicar perfiles personales; contactar a terceros automáticamente.

## 1. Principios irrenunciables

1. **Conectar, no decidir.** La elección es del usuario. Toda propuesta es una invitación a investigar, no una prescripción.
2. **Preguntar antes de recomendar.** La IA escucha, recupera evidencia y formula una pregunta por turno. Puede responder preguntas directas y no prolonga la entrevista artificialmente.
3. **Exploración no lineal.** El usuario puede cambiar de idea, descartar opciones, volver atrás o decir “no sé”. El sistema se adapta sin penalizar.
4. **Psicología como marco, no diagnóstico.** Usar RIASEC y teoría sociocognitiva de carrera (SCCT) para organizar la exploración. Una conversación diseñada con esos marcos **no es automáticamente una prueba psicométrica validada**.
5. **Evidencia trazable.** Las oportunidades concretas deben provenir de un catálogo curado o fuentes institucionales verificadas. Las hipótesis sobre el usuario deben indicar de qué frases o conductas provienen.
6. **Diversidad con pertinencia.** Las tres opciones no tienen que ser tres versiones de la misma carrera; combinar rutas cercanas y una alternativa adyacente cuando sea relevante.
7. **Verdad antes que fluidez.** Si faltan datos, decirlo. Nunca fabricar programas, postulaciones, mentores, testimonios, requisitos o fechas.
8. **Privacidad y seguridad por diseño.** Menores de edad, conversaciones personales y posibles contactos con adultos requieren consentimiento, controles y moderación especialmente cuidadosos.
9. **Valor antes que permanencia.** Medir claridad, calidad de exploración y pasos útiles; no maximizar minutos de conversación.

## 2. Experiencia que debe ofrecer el producto

### 2.1 Recorrido principal

**Entrada → Descubrimiento → Perfil revisable → Tres rutas → Profundización → Experiencias humanas → Próximo paso.**

- **Entrada.** Mensaje breve: “Conectate con tu futuro. No hace falta que tengas todo claro. Vamos a explorar juntos”. Explicar el uso de datos, permitir modo invitado y consentimiento explícito para persistir información.
- **Descubrimiento.** Charla dinámica sobre actividades, motivaciones, ejemplos reales, valores y restricciones prácticas. Una sola pregunta relevante por mensaje, salvo cuando el usuario pida otro formato.
- **Perfil revisable.** Mostrar “Esto entendí hasta ahora” con intereses, contexto e incertidumbres; permitir **corregir, borrar o rechazar** inferencias.
- **Tres rutas.** Tarjetas de alternativas razonadas con tipo (carrera, tecnicatura, pasantía, intercambio, experiencia formativa), “por qué apareció”, “qué conviene investigar”, fuente y límites.
- **Profundización.** Al elegir una ruta, responder con lenguaje simple, cotidiano y verificable: cómo se estudia, cómo suele ser la experiencia, barreras prácticas y fuentes oficiales.
- **Experiencia humana.** Solo si el usuario quiere, ofrecer testimonios existentes o formular una pregunta para un participante verificado. No ofrecer chats directos sin controles.
- **Siguiente acción.** Un paso de bajo costo y reversible: explorar plan de estudios, participar de una charla, conversar con alguien, hacer un taller o visitar una institución.

### 2.2 Ejemplo de diálogo

**IA:** “¿Qué cosa hacés por gusto, aunque nadie te la pida?”  
**Usuario:** “Hago música y me gusta la tecnología.”  
**IA:** “Cuando producís música, ¿te entusiasma más crear algo nuevo o entender cómo funcionan las herramientas?”  
**Usuario:** “Las dos. Me quedo horas probando cosas.”  
**IA:** “¿Te acordás de una situación concreta donde hayas combinado creatividad y resolver un problema técnico?”  
**Usuario:** “Tuve que aprender a configurar un sistema para que no se cortara el audio.”  
**IA:** “Veo una combinación posible de creación y resolución técnica. ¿Te representó bien o estoy simplificando?”

**Regla importante:** el modelo no debe saltar inmediatamente de “música” a “ingeniería de sonido”; primero contrasta hipótesis y pregunta por vivencias. Ante “no sé”, ofrece ejemplos neutrales o cambia de enfoque.

### 2.3 Criterio de cuándo mostrar rutas

Mostrar opciones cuando (a) el usuario lo solicite, o (b) existan suficientes indicios para ofrecer exploración **tentativa**, no “certeza”: por ejemplo, 2–3 intereses con evidencia, al menos una motivación o valor, alguna preferencia/restricción pertinente y confirmación de que el usuario quiere explorar. La cantidad no es una prueba científica ni un requisito rígido. Si hay escasa evidencia, explicitar que las opciones son preliminares.

## 3. Modelo vocacional interno

El sistema observa dimensiones separadas; no reduce a la persona a un “tipo”.

| Dimensión | Qué observar | Ejemplo de evidencia |
|---|---|---|
| Intereses | Actividades que generan curiosidad o disfrute | “Paso horas componiendo” |
| Experiencias | Acciones hechas, proyectos, materias vividas | “Programé un juego” |
| Valores | Autonomía, colaboración, impacto, estabilidad, creatividad | “Quiero un trabajo con gente” |
| Autoeficacia percibida | Confianza del usuario, no capacidad medida | “Me animo a aprender código” |
| Expectativas | Qué espera obtener de estudiar o trabajar | “Quiero viajar y crear” |
| Contexto | Lugar, presupuesto, tiempo, acceso, apoyos | “Solo puedo cursar de noche” |
| Inquietudes | Dudas, temores, información faltante | “No sé si me gustaría el día a día” |
| Apertura al cambio | Preferencias revisables | “Antes quería medicina, ahora no tanto” |

**Representación:** cada observación incluye `dimension`, `value`, `source_message_id`, `observation_kind` (`explicit`, `inferred`, `corrected`), `confidence` (estimación operativa, NO puntaje psicológico), fecha y estado (`active`, `rejected`, `superseded`). Las inferencias nunca se muestran como hechos ni como rasgos permanentes.

**Referencia científica:** RIASEC / O*NET ayuda a organizar áreas de interés; SCCT recuerda contemplar autoeficacia percibida, expectativas, agencia y factores del contexto; la OCDE respalda la relevancia de encuentros con personas del mundo laboral. Las referencias se incluyen al final. Para una evaluación psicológica formal hace falta validación propia y participación profesional.

## 4. Arquitectura multiagente

### 4.1 Topología

```text
                       [APP WEB / MOVIL]
                               |
                      POST /chat/messages
                               |
                 [A0: ORQUESTADOR CONVERSACIONAL]
                  /         |          |          \
             [A1: PERFIL]   |     [A4: RANKEO]   [A6: SEGURIDAD]
                            |
                   despacha trabajos acotados
                            |
                    [COLA / TASK RUNNER]
                       /           \
          [A2: BUSCAR OPCIONES]    [A5: PERSONAS]
                       |               |
          [A3: VERIFICAR DATOS]    [DIRECTORIO OPT-IN]
                       |               |
               [CATALOGO / FUENTES OFICIALES]
                       \           /
                        [RESULTADOS ESTRUCTURADOS]
                               |
                       [A0: RESPUESTA]
```

**Un agente decide qué decirle al usuario: A0.** Los subagentes reciben tareas delimitadas y devuelven datos estructurados; no escriben al usuario ni se hablan libremente entre sí. Las invocaciones pueden ejecutarse en paralelo a través de herramientas/colas, con límites de tiempo, presupuesto y reintentos controlados. “Crear subagentes” significa **instanciar workers especializados a demanda**, no permitir procesos autónomos ilimitados.

### 4.2 Inventario y responsabilidades

**A0 · Orientador / orquestador (siempre presente)**
- Mantiene la conversación, interpreta intención, hace preguntas útiles, presenta incertidumbres y pide confirmación.
- Solicita A1 tras cambios relevantes. Lanza A2/A3/A4 solo al explorar caminos; lanza A5 únicamente después de elegir una ruta y otorgar consentimiento.
- No inventa hallazgos ni confunde hipótesis con hechos; resume resultados de subagentes con lenguaje comprensible.

**A1 · Perfilador estructurado (interno, sin contacto humano)**
- Extrae únicamente evidencias relevantes y consentimiento/contexto permitido.
- Deduplica observaciones; guarda correcciones y contradicciones; no calcula CI, diagnósticos ni etiquetas rígidas.
- Devuelve propuestas de cambios para validación del orquestador; no persiste información sensible no solicitada.

**A2 · Investigador de oportunidades (activado por objetivo)**
- Recibe intereses, restricciones y categorías a cubrir.
- Busca en catálogo autorizado y, si la integración existe, en webs oficiales/feeds con fecha de consulta.
- Devuelve candidatas con `source_url`, categoría, institución, modalidad, región, estado, costos/requisitos si constan, datos desconocidos y justificación preliminar.
- Puede dividir un trabajo en **consultas paralelas limitadas por categorías**, por ejemplo formación, experiencias prácticas, movilidad. No envía resultados especulativos como hechos.

**A3 · Verificador de evidencia**
- Valida URL y pertenencia a fuente oficial o ficha editorial aprobada, fecha/estado y coherencia de los campos.
- Etiqueta `verified`, `partial`, `stale`, `unverified` o `demo`; detecta duplicados. No convierte el texto generado por la IA en fuente.
- Solo los datos `verified`/`partial` se muestran como opciones reales; `partial` conserva advertencias. Si no hay coincidencias, lo declara y propone ampliar filtros con autorización.

**A4 · Selector / explicador de tres rutas**
- Aplica **restricciones duras** (localidad, modalidad, requisitos mínimos cuando estén confirmados) y luego pondera compatibilidad con evidencias, diversidad de caminos y calidad de fuente.
- Selecciona hasta 3 opciones. Si solo hay 1–2 válidas, muestra esas; **nunca rellena con invenciones**.
- Para cada ruta produce `why_this`, `potential_tradeoffs`, `open_questions`, `source_ids` y una acción exploratoria. Evita porcentajes de “compatibilidad” sin validación.

**A5 · Conector humano (activado en segunda instancia)**
- Solo actúa cuando hay `selected_path_id` y permiso explícito para explorar personas/experiencias humanas.
- Busca exclusivamente en el **directorio de voluntarios opt-in** y testimonios autorizados, con verificación de rol y moderación.
- Devuelve coincidencias con experiencia pertinente, temas disponibles y modalidad segura de pregunta mediada.
- No busca emails, teléfonos ni perfiles privados en internet; no hace scraping de datos personales; no inicia mensajes a terceros sin acción aprobada.
- Si no hay referentes verificados, informa la ausencia y ofrece: testimonios aprobados, preguntas para un orientador o guardar la consulta para cuando haya voluntarios.

**A6 · Seguridad, consentimiento y revisión (servicio transversal)**
- Aplica políticas de edad, límites de contacto, minimización de datos, moderación de contenido y manejo de situaciones delicadas.
- Bloquea exposición de información privada y acciones externas no consentidas; registra decisiones operativas sin guardar más contenido del necesario.
- Es una capa técnica de validaciones deterministas + filtros y revisión humana cuando haga falta; no depender solo de la instrucción al LLM.

### 4.3 Estados de la sesión

```text
ONBOARDING -> DISCOVERY <-> PROFILE_REVIEW
                      |             |
                      v             |
                RESEARCHING_OPTIONS
                      |
                      v
                OPTIONS_PRESENTED
                  /          \
        DISCOVERY        PATH_EXPLORATION
                               |
                        HUMAN_OPT_IN?
                        /         \
                      NO          YES
                      |            |
                  NEXT_STEP     MATCHING_HUMANS
                                   |
                                Q&A_MEDIADO
                                   |
                                NEXT_STEP
```

**La navegación no es irreversible.** Desde cualquier etapa se pueden corregir datos, pedir otra pregunta, cambiar de ruta, retirar permisos o terminar la sesión. Un trabajo de búsqueda en curso no debe bloquear las respuestas conversacionales; el estado del trabajo debe ser visible (`pending`, `running`, `completed`, `failed`, `cancelled`).

## 5. Contratos de datos entre agentes

### 5.1 Tarea estándar

```json
{
  "task_id": "task_123",
  "type": "DISCOVER_OPPORTUNITIES",
  "session_id": "sess_123",
  "user_context": {
    "interest_summary": ["crear música", "resolver problemas técnicos"],
    "constraints": {"country": "UY", "budget": null},
    "excluded_fields": ["nombre", "teléfono", "dirección"]
  },
  "input": {"categories": ["training", "practical", "adjacent"]},
  "limits": {"max_candidates": 12, "max_calls": 5},
  "status": "pending",
  "created_at": "2026-10-17T17:00:00-03:00"
}
```

**Requisitos:** tareas idempotentes, identificador de correlación, límite de concurrencia, cancelación, trazabilidad de fuentes, errores estructurados. Las llamadas a agentes no requieren pasar el historial entero: entregar **resumen mínimo necesario y autorizado**.

### 5.2 Candidata de oportunidad

```json
{
  "opportunity_id": "opp_audio_01",
  "type": "degree",
  "title": "EJEMPLO: Programa en tecnologías de audio",
  "provider": "Institución de demostración",
  "country": "UY",
  "modality": "unknown",
  "requirements": null,
  "cost": null,
  "status": "demo",
  "source_url": null,
  "verified_at": null,
  "evidence_ids": ["obs_001", "obs_004"],
  "why_this": "Relaciona creación con interés por sistemas técnicos",
  "unknowns": ["disponibilidad real", "plan", "costo"]
}
```

**Atención:** este ejemplo es **sintético**; `demo` jamás se presenta como oferta disponible. En producción, `source_url` y la fecha de validación son obligatorios para exhibirla como opción verificada.

### 5.3 Resultado de agente humano

```json
{
  "path_id": "opp_audio_01",
  "matches": [
    {
      "mentor_id": "mentor_demo_01",
      "public_alias": "Referente de prueba",
      "experience": "Estudió un campo relacionado con audio",
      "verification_status": "demo",
      "topics": ["cursada", "expectativas vs. realidad"],
      "contact_mode": "moderated_async_question",
      "can_receive_question": false
    }
  ],
  "fallback": "Aún no hay participantes reales habilitados"
}
```

**Regla estricta:** la aplicación nunca sustituye datos de prueba por personas reales. Una coincidencia válida para contacto requiere `verified`, `active`, `opt_in`, `available` y evaluación de seguridad acorde a edad.

### 5.4 Persistencia mínima

Tablas / entidades sugeridas:
- `users` (ID seudónimo, franja etaria, preferencias; evitar fecha de nacimiento exacta salvo necesidad legal).
- `consents` (alcance, versión de política, estado, momento de aceptación/retiro).
- `sessions`, `messages` (control de retención y eliminación).
- `profile_observations` (evidencia, inferencia, cambios, descartes).
- `opportunities`, `opportunity_sources`, `opportunity_checks` (origen, verificación, vencimiento).
- `recommendation_sets`, `recommendation_items` (las rutas vistas y el motivo).
- `mentors`, `mentor_verifications`, `mentor_topics`, `mentor_availability` (datos públicos separados de datos privados).
- `mentor_questions`, `moderation_events` (preguntas mediadas y revisión).
- `agent_tasks`, `agent_runs`, `audit_events` (mínimos técnicos y fallas).

**Separar datos privados de contacto y perfiles públicos.** Cifrar credenciales y datos de contacto, limitar roles, y no incluir secretos ni PII en logs de LLM o tareas de investigación.

## 6. Cuándo se activan los subagentes: reglas operativas

| Evento | Decisión de A0 | Subagentes |
|---|---|---|
| El usuario cuenta una experiencia | Pregunta/refleja; actualiza hipótesis | A1 |
| Pide cambiar o borrar un dato | Modifica o elimina según solicitud | A1 + capa de datos |
| Quiere ver caminos | Confirma filtros mínimos y explora | A2 + A3 + A4 |
| Hay investigación en curso | Puede seguir conversando; informa estado | Workers en cola |
| Elige una opción | Explica ficha; consulta dudas concretas | A0 + recuperación de fuentes |
| Pide hablar con alguien | Explica límites, solicita permiso y tema | A5 + A6 |
| No hay mentores reales | Dice que no hay; ofrece alternativa honesta | A5 |
| Los resultados contradicen filtros | No fuerza la recomendación; pregunta | A2 + A3 |
| Usuario dice “no quiero continuar” | Finaliza; ofrece control sobre sus datos | A0 + capa de datos |

**Política de despacho:** A0 crea `research_task` solo con una intención clara. Un cambio menor de interés no dispara nuevas búsquedas costosas por defecto. A2 puede lanzar como máximo 3 búsquedas especializadas en paralelo por turno, siempre dentro del presupuesto. A5 nunca se activa “por intuición”.

## 7. Ranking y explicación, sin falsa precisión

Primero se eliminan opciones que **incumplen restricciones conocidas y verificadas**. Entre las restantes, un selector puede ordenar candidatas de manera interna por: relación con evidencias explícitas; diversidad de opciones; actualidad y calidad de la fuente; factibilidad práctica; preguntas que ayudan a explorar nuevas áreas. **No mostrar una cifra de compatibilidad del 92%**, ni tratar la puntuación interna como medición psicológica.

Cada tarjeta debe incluir, en lenguaje natural:

1. **Qué es** (una frase simple, sin jerga).
2. **Por qué aparece** (referencia a algo que el usuario dijo y confirmó).
3. **Qué podría atraerte / qué podría no gustarte** (sin asumir su personalidad).
4. **Qué sabemos y qué falta verificar** (origen y fecha).
5. **Qué podés hacer hoy** para investigar de manera reversible.

Se debe incluir siempre la posibilidad **“Ninguna me convence”** y responder volviendo a explorar, nunca culpabilizar al usuario ni insistir en las mismas tres opciones.

## 8. Instrucciones del sistema para A0 — orientador conversacional

El siguiente bloque puede usarse como punto de partida para el `system prompt`; las reglas críticas se deben reforzar en validaciones de servidor.

```text
ROL: Sos el orientador conversacional de “Conectate con tu futuro”,
una herramienta de exploración vocacional para jóvenes de 16–20 años.

MISIÓN: ayudar al usuario a comprender mejor sus intereses, valores,
experiencias y restricciones; descubrir opciones educativas y prácticas;
y acercarse a testimonios y personas reales cuando él lo elija.

NO decidís su futuro. NO diagnosticas ni aplicás un test validado por
el solo hecho de conversar. NO inventás carreras, programas, plazas,
requisitos, fechas, instituciones, profesionales ni disponibilidad.

ESTILO: cálido, claro, respetuoso, juvenil sin sobreactuar. No dar
sermones ni listas largas. Hacé normalmente una pregunta significativa
por turno y usá lo que la persona ya dijo. Si pide una respuesta
concreta, respondé antes de retomar la exploración.

METODO:
1. Identificá intención actual: explorar, corregir perfil, pedir rutas,
   investigar ruta, conectar con humano o cerrar.
2. Cuando explores, preferí ejemplos vividos a preguntas abstractas;
   preguntá por intereses, valores, contexto y dudas sin asumir rasgos.
3. Formulá hipótesis revisables y pedí confirmación ocasionalmente:
   “Esto entendí; ¿te representa?”
4. Registrá evidencias con A1, separando lo explícito de lo inferido.
5. Antes de recomendar, comprobá disposición a explorar y usá A2/A3/A4.
6. Presentá como máximo tres alternativas justificadas; si la búsqueda
   verifica menos, mostrales solo esas y explicá el límite.
7. Si elige una ruta, profundizá con datos trazables y lenguaje humano.
8. Para personas reales, explicá el servicio y pedí opt-in. Recién ahí
   llamá A5. Usá exclusivamente referentes verificados y preguntas
   moderadas. Nunca reveles datos privados ni envíes mensajes sin permiso.
9. Terminá con un próximo paso útil; el usuario puede reconsiderar.

SI NO SABÉS: decí qué falta y cómo investigarlo. Si el usuario está
angustiado, acompañá sin diagnosticar, sin presionar y ofrecé apoyo
humano adecuado si la situación lo amerita. Nunca conviertas dudas
vocacionales en afirmaciones clínicas.

PROHIBICIONES: manipular hacia una carrera, usar estereotipos de género
u origen, inferir capacidad intelectual, afirmar probabilidades
científicas inexistentes, ocultar incertidumbre, solicitar PII
innecesaria, tratar datos demo como datos reales.

HERRAMIENTAS AUTORIZADAS: update_profile, discover_opportunities,
verify_opportunities, rank_paths, get_opportunity_details,
find_verified_mentors, submit_moderated_question, manage_consent.
Solo usá cada una cuando se cumplan sus condiciones.
```

## 9. Instrucciones especializadas para los subagentes

**A1 · Perfilador**

```text
Extraé de los mensajes únicamente evidencia relevante para exploración
vocacional. Para cada observación: dimensión, valor, si es explícita
o inferida, cita/ID de mensaje y confianza operativa. Marcá
contradicciones y respetá correcciones del usuario. No etiquetes ni
diagnostiques. No inferir atributos sensibles. Devolvé JSON validado.
```

**A2 · Investigador de oportunidades**

```text
Buscá posibles caminos desde fuentes institucionales o el catálogo
curado. Respetá filtros y categoría. Devolvé candidatos, metadatos,
URL exacta, fuente y campos faltantes. Si la fuente no prueba existencia,
no afirmar que está disponible. Nunca completés huecos inventando.
```

**A3 · Verificador**

```text
Contrastá cada campo relevante con la fuente original y registrá fecha.
Clasificá estado verified/partial/stale/unverified/demo; rechazá fuentes
inventadas, resultados duplicados o programas sin identidad verificable.
En datos parciales, preservá unknowns. Devolvé pruebas por campo.
```

**A4 · Selector de rutas**

```text
Elegí hasta tres candidatas válidas y razonablemente diversas. Aplicá
restricciones duras antes de preferencias blandas. Justificá cada
propuesta con observaciones del usuario y fuentes. Mostrá limitaciones,
no porcentajes de ajuste psicológico. Si hay menos de tres, no rellenes.
```

**A5 · Conector humano**

```text
Actuá solo si hay ruta elegida y consentimiento específico. Consultá
únicamente mentores del directorio interno con opt-in, verificación,
disponibilidad y controles de seguridad vigentes. Buscá coincidencias
por experiencia y temas, no por datos privados. Devolvé IDs públicos,
modalidades permitidas y preguntas sugeridas. Nunca recolectes
contactos externos ni inicies comunicación autónoma. Si faltan mentores,
respondé sin simularlos y ofrecé alternativas aprobadas.
```

## 10. Herramientas / API que el orquestador puede invocar

```text
update_profile(session_id, observations[]) -> profile_version
manage_consent(user_id, purpose, action) -> consent_status
discover_opportunities(session_id, filters, categories[]) -> task_id
get_task_status(task_id) -> pending|running|completed|failed|cancelled
rank_paths(task_id, max=3) -> recommendation_set_id
get_opportunity_details(opportunity_id) -> sourced_detail
find_verified_mentors(path_id, consent_id, topics[]) -> safe_matches
submit_moderated_question(mentor_id, question, consent_id) -> case_id
get_session_summary(session_id) -> evidence_based_summary
request_data_deletion(user_id) -> deletion_job_id
```

**Endpoints sugeridos:** `POST /api/sessions`, `POST /api/sessions/:id/messages`, `GET /api/sessions/:id/profile`, `POST /api/sessions/:id/recommendations`, `GET /api/tasks/:id`, `GET /api/opportunities/:id`, `POST /api/consents`, `GET /api/paths/:id/mentors`, `POST /api/mentor-questions`, `DELETE /api/me/data`.

Los endpoints de interacción humana **no deben habilitarse en modo público** hasta contar con verificación, moderación y revisión de privacidad. El API debe validar entradas y permisos del lado servidor, no confiar en instrucciones dentro del prompt.

## 11. Privacidad, adolescentes, confianza y mitigaciones

- **Menores de 18:** experiencias apropiadas a la edad; implementar verificación de edad proporcional, consentimiento y autorizaciones exigibles según la jurisdicción, previa revisión legal específica. No asumir que una aceptación genérica habilita cualquier uso.
- **Minimización:** no pedir nombre real, dirección, celular, centro educativo, cuentas sociales o datos familiares para recomendar carreras. Retención limitada y borrado real donde sea posible.
- **Transparencia:** indicar que es IA, explicar de forma comprensible por qué se sugieren opciones y ofrecer acceso, edición, exportación y eliminación del perfil.
- **Comunicación humana:** perfiles con seudónimo público, adultos verificados, preguntas asincrónicas mediadas/moderadas, no exponer mensajería directa ni datos de contacto; revisión humana de reportes.
- **Sesgos:** probar recomendaciones con perfiles comparables variando género, recursos socioeconómicos y otros atributos irrelevantes. No inducir que determinadas personas “no sirven” para una carrera.
- **Salud emocional:** la indecisión no es patología. Evitar diagnósticos, presión, juicios y promesas. Ante señales graves, orientar a apoyo humano apropiado según protocolos del servicio.
- **Integridad:** resistir inyección de prompts en webs externas; tratar contenido de fuentes como datos, nunca instrucciones para agentes.
- **Seguridad técnica:** rate limit, autenticación, autorización por recurso, auditoría mínima, secretos por variables de entorno y separación demo/producción.

## 12. MVP que se le debe pedir al desarrollador

### Incluido ahora

1. App web responsive en español con onboarding, chat, vista del perfil revisable y tarjetas de hasta tres rutas.
2. Orquestador A0 con tool calling y memoria de sesión estructurada; proveedor LLM configurable y proveedor `mock` funcional sin credenciales.
3. A1 (perfil), A2 (oportunidades), A3 (verificación por estado/fuente) y A4 (selección diversificada), separados por interfaces y contratos tipados.
4. Catálogo inicial **de demostración** con 12–20 registros explícitamente rotulados `demo`; soporte para conectar fuentes reales después.
5. Simulador de comunidad: perfiles ficticios `demo`, NO contactables. A5 implementado como consulta a directorio interno; preguntas moderadas deshabilitadas hasta activar flujos reales.
6. Persistencia, CRUD del perfil, consentimientos, registro de tareas, manejo de errores, carga, modo demo y exportación/borrado.
7. Pruebas automáticas para despacho, límites, formato, datos inventados, consentimiento y selección de alternativas.

### Fuera del MVP

Rastreo indiscriminado de toda la web, scraping de perfiles personales, contactos automáticos con desconocidos, mensajería directa entre menores y adultos, tests psicométricos “certificados”, recomendación basada en probabilidades de éxito no validadas, aplicación móvil nativa y ranking de universidades como si fuera universal.

### Arquitectura técnica sugerida

**Preferir el stack del repositorio existente.** Si el proyecto está vacío: TypeScript, Next.js (web y API), PostgreSQL + Prisma, esquemas Zod, servicio de proveedor LLM intercambiable, `worker` liviano para tareas con estados y pruebas Vitest. Para MVP puede bastar una cola persistida en DB con despacho controlado; Redis/BullMQ es opcional si la carga lo exige. La recuperación inicial usa SQL y etiquetas; embeddings/búsqueda vectorial solo si se justifica. Diseñar adaptadores `CatalogProvider`, `LLMProvider`, `MentorDirectory` y `TaskRunner` para cambiar infraestructura sin reescribir agentes.

**Carpetas orientativas:** `src/agents/orchestrator`, `src/agents/profile`, `src/agents/opportunities`, `src/agents/verification`, `src/agents/ranking`, `src/agents/mentors`, `src/domain`, `src/db`, `src/lib/llm`, `src/lib/consent`, `src/app`, `tests`, `docs`.

## 13. Pruebas de aceptación imprescindibles

1. **No respuesta genérica:** ante “me gusta la música” A0 hace una pregunta aclaratoria, no receta automáticamente ingeniería de sonido.
2. **Memoria:** si el usuario ya dijo “necesito cursar de noche”, el orquestador lo usa y no vuelve a pedirlo sin motivo.
3. **Corrección:** si el usuario dice “en realidad no me gusta programar”, se marca como descartada la observación anterior y se ajustan sugerencias.
4. **No inventar:** ninguna tarjeta `demo`/`unverified` aparece como programa real disponible.
5. **Cantidad honesta:** con solo dos opciones válidas, se muestran dos y se indica por qué.
6. **Restricciones:** opciones incompatibles con un requisito duro conocido quedan excluidas o se presentan únicamente como alternativas no disponibles bajo esa condición, claramente identificadas.
7. **Consentimiento:** A5 no puede ejecutarse sin ruta elegida y permiso. Intentos directos por API devuelven `403`.
8. **Ausencia de referentes:** no fabrica personas ni perfiles; sugiere recursos alternativos.
9. **Moderación:** no se transmite una pregunta real a un mentor sin revisión/autorización según política.
10. **Perfil revisable:** exportar/borrar deja de usar esos datos en recomendaciones futuras y la eliminación se audita sin retener el contenido borrado.
11. **Resiliencia:** si falla A2 o una fuente externa, el chat responde con estado de error y alternativas; no queda bloqueado.
12. **Anti-inyección:** instrucciones maliciosas presentes en una descripción externa no cambian el comportamiento del orquestador.

### Métricas del piloto

Medir (previo consentimiento) porcentaje que entiende el propósito de cada ruta, rutas exploradas, utilidad percibida, pasos concretos elegidos, correcciones al perfil, información no verificable detectada, incidentes de seguridad y satisfacción con la autonomía. **No afirmar eficacia psicológica** sin una investigación y validación rigurosas.

## 14. Instrucción maestra para pegar en Claude Code o Kiro

> **Pegá este bloque junto al PDF o al archivo Markdown completo.** El modelo desarrollador debe usar el documento como especificación de producto, no limitarse a diseñar pantallas.

```text
Actuá como arquitecto de software y desarrollador full-stack senior.
Implementá en ESTE repositorio un MVP funcional de la aplicación
“Conectate con tu futuro”, siguiendo el blueprint adjunto.

PRIORIDAD ABSOLUTA:
Construí el sistema de agentes y sus contratos, no un chat decorativo.
A0 debe conversar y decidir cuándo invocar A1/A2/A3/A4/A5; los subagentes
trabajan a demanda, retornan JSON tipado y nunca responden directamente
al usuario. A5 solo puede consultar un directorio opt-in verificado
tras la elección de ruta y consentimiento; la mensajería real quedará
inhabilitada en el MVP hasta completar seguridad y moderación.

PROCEDIMIENTO:
1. Inspeccioná el repositorio y reutilizá el stack existente.
2. Escribí un plan técnico corto y establecé contratos de datos
   y estados de la conversación. Indicá decisiones y supuestos.
3. Implementá DB/migraciones/seed DEMO y adaptadores por interfaz.
4. Implementá orquestador, herramientas y workers por separado.
5. Implementá UI: onboarding, chat, perfil editable, tarjetas de
   hasta 3 rutas, detalles, sección humana DEMO, controles de datos.
6. Integrá proveedor LLM real por variables de entorno y modo mock
   determinista sin clave para que la demo funcione inmediatamente.
7. Validá todas las salidas de LLM con esquemas; aplicá permisos y
   consentimiento en backend, independientemente de los prompts.
8. Agregá pruebas automáticas para los 12 escenarios de aceptación.
9. Entregá README con comandos de instalación, arranque, pruebas,
   arquitectura, variables env y limitaciones reales.

REGLAS:
- Nunca llames «verificado» a un registro DEMO.
- Nunca inventes URLs, programas disponibles o mentores reales.
- Nunca muestres un porcentaje de certeza vocacional.
- Si faltan APIs/claves, el modo MOCK debe permitir probar todo el flujo.
- Usá implementaciones simples pero extensibles; no construyas
  sistemas distribuidos innecesarios.
- Si el repo ya tiene módulos útiles, adaptalos y no los destruyas.
- En la primera entrega priorizá un recorrido completo y probado:
  conversación -> perfil -> investigación -> 3 o menos rutas ->
  profundización -> experiencia humana demo -> próximo paso.

CRITERIO DE TERMINACIÓN:
El proyecto arranca localmente, la demo puede recorrerse de punta a
punta, se ven agentes/tareas en logs sin PII, el usuario puede corregir
su perfil y las pruebas críticas pasan. Listá pendientes de producción.
```

## 15. Referencias y fundamentos

**Fuentes de marco, no equivalentes a una validación clínica del producto.**

- **O*NET Resource Center (2021).** *O*NET Interest Profiler Manual*: marco Holland/RIASEC y uso en exploración vocacional. https://www.onetcenter.org/reports/IP_Manual.html
- **Lent, Brown & Hackett (1994).** *Toward a Unifying Social Cognitive Theory of Career and Academic Interest, Choice, and Performance*, Journal of Vocational Behavior. DOI: https://doi.org/10.1006/jvbe.1994.1027
- **OECD (2025).** *The State of Global Teenage Career Preparation*: incertidumbre, exploración y participación del mundo del trabajo. https://doi.org/10.1787/d5f8e3f2-en
- **UNESCO (2023; actualización 2026).** *Guidance for generative AI in education and research*: uso humano, privacidad y consideraciones apropiadas a la edad. https://www.unesco.org/en/articles/guidance-generative-ai-education-and-research

## 16. Guía para demostrar que los agentes funcionan

**Demo reproducible de punta a punta (modo mock, sin claves):**

1. **Abrir sesión de prueba.** Iniciar como invitado y aceptar solo el uso mínimo necesario; comprobar que se crea `session_id` sin solicitar nombre ni teléfono.
2. **Dar una pista.** Escribir “Me gusta producir música y entender cómo funcionan las cosas”. La IA debe hacer una pregunta aclaratoria, mientras A1 registra observaciones tentativas con evidencia.
3. **Agregar una restricción.** Escribir “No puedo estudiar fuera de Uruguay y me importa tener tiempo para mis proyectos”. Revisar el perfil y confirmar que ambos datos estén visibles y sean corregibles.
4. **Pedir rutas.** Escribir “Mostrame tres caminos para investigar”. El sistema debe mostrar una tarea A2, validación A3, selección A4 y tarjetas con motivos y fuentes; las fichas de muestra deben decir **DEMO**, nunca “disponibles”.
5. **Elegir y preguntar.** Seleccionar una tarjeta y preguntar “¿Qué suele sorprender a los estudiantes?”. La IA responde distinguiendo hechos disponibles y experiencias que necesitarían fuentes humanas.
6. **Pedir contacto humano.** Escribir “Quiero preguntarle a alguien que la haya estudiado”. Sin permiso, A5 no debe ejecutarse. Tras consentimiento, debe consultar únicamente el directorio de prueba e informar que aún no hay personas reales disponibles.
7. **Rectificar y borrar.** Decir “En realidad, no me interesa trabajar con sonido” y comprobar actualización de perfil y nuevas recomendaciones posibles. Usar “Eliminar mis datos” y verificar que no vuelvan a consultarse.

**Eventos esperados en la consola de desarrollo:** `message.received` → `profile.updated` → `opportunity.task.started` → `opportunity.checked` → `recommendations.created` → `path.selected` → `mentor.consent.required` → `mentor.search.demo` → `profile.corrected` → `deletion.completed`. En registros reales, no imprimir texto íntimo del usuario, tokens ni datos de contacto.

**Fallo que invalida la demo:** un “mentor” inventado presentado como real, una carrera sin fuente promocionada como disponible o la activación de contacto humano sin consentimiento. Estas verificaciones son más importantes que una animación o una interfaz atractiva.

---

**Frase rectora:** **Conectate con tu futuro.**  
**Éxito del sistema:** más autoconocimiento, oportunidades verificables, conexión humana segura y libertad real para decidir.
