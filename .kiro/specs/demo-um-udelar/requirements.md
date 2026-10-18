# Requirements Document — Demo Rumbo (Etapa 1 + Etapa 2 reducida)

## Introduction

Rumbo es una app de exploración vocacional para jóvenes de Uruguay (16 a 20 años aprox.). Esta spec define la **demo para la presentación**:

> Conversar con una IA → conocerse mejor → recibir un perfil vocacional → ver carreras reales de UM y Udelar → explorar una → abrir la página oficial.

**Problema que motiva la spec (P0):** el motor actual (`src/lib/engine/planner.ts` + `src/knowledge/rubric.v1.json`) ofrece cerrar recién a los 30 mensajes y fuerza el cierre a los 40.

- Simulado con usuarios guionados, el mejor caso hace **19 preguntas**.
- Con respuestas vagas, resúmenes rechazados o el LLM caído, llega a **40 preguntas sin cerrar**.
- El detalle está en `auditoria.md` (en esta misma carpeta), sección P0.

**Decisión del equipo para la presentación:**

- **Máximo 8 preguntas** de la IA, con un objetivo de 5 a 7.
- **Todas las preguntas traen opciones para tocar.** Cuando la persona no sabe qué responder, se le ofrecen **hasta 8 opciones** y la charla avanza igual.

**Fuera de alcance:** comunidad, mentores, mensajería y contactos (Etapa 3). También la voz en vivo, el feed de noticias, el grafo O\*NET, las becas y convocatorias, importar CV y el comparador. Nada de eso se borra: solo se oculta.

Glosario:

- **Pregunta de la IA**: un mensaje del asistente que contiene un "?". Incluye el saludo, el mini-resumen y la oferta de cierre.
- **Casillero imprescindible**: dato sin el cual el perfil no es útil (E1, E2, E3).
- **Casillero complementario**: dato que mejora el perfil pero puede faltar (C1, C2, C3).
- **Respuesta sin información**: respuesta vacía, evasiva ("no sé", "depende", "ni idea", "qué se yo", "paso") o que el analizador no pudo procesar.

---

## Requirements

### Requirement 1 — Presupuesto de preguntas

**User Story:** Como joven que prueba Rumbo en una presentación, quiero una charla corta, para recibir mi perfil en pocos minutos sin aburrirme.

#### Acceptance Criteria

1. El sistema DEBE contar `questionsAsked` como la cantidad de mensajes de la IA con "?" en la sesión.
2. CUANDO `questionsAsked` llega a 8, ENTONCES el sistema DEBE cerrar la entrevista en ese mismo turno, sin hacer otra pregunta.
3. El sistema DEBE apuntar a cerrar entre la pregunta 5 y la 7 cuando la persona responde con información.
4. Ningún camino del código puede producir una novena pregunta de la IA en la fase de entrevista.
5. La UI DEBE mostrar el progreso ("Pregunta N de 8 como máximo").

### Requirement 2 — Siempre hay opciones para responder

**User Story:** Como joven que no sabe qué contestar, quiero opciones para tocar, para no trabarme y que la charla siga.

#### Acceptance Criteria

1. Cada pregunta de la IA DEBE venir con 3 a 6 opciones de respuesta en botones, más el campo de texto libre ("O escribilo con tus palabras").
2. CUANDO la respuesta anterior fue una respuesta sin información, ENTONCES la siguiente pregunta DEBE ofrecer **hasta 8 opciones** concretas y distintas entre sí.
3. CUANDO la persona vuelve a responder sin información a una pregunta con opciones, ENTONCES el sistema NO DEBE insistir con el mismo tema y DEBE pasar al siguiente casillero (o cerrar, según el Requirement 3).
4. Las opciones DEBEN salir de un banco versionado (`src/knowledge/options.v1.json`) para que funcionen sin LLM; el LLM solo redacta el texto de la pregunta.
5. Cada opción del banco DEBE tener asociada la evidencia que genera (indicador de la rúbrica, área o valor), para que al tocarla se registre sin llamar al analizador.
6. Los textos de las opciones DEBEN pasar las mismas guardas que los mensajes (sin carreras, instituciones, diagnósticos ni etiquetas de personalidad).
7. Siempre DEBE haber una opción "Ninguna de estas" o "Prefiero no decir", que cuenta como respuesta sin información.

### Requirement 3 — Suficiencia y cierre determinista

**User Story:** Como equipo, queremos que la IA sepa cuándo tiene lo suficiente, para que cierre por criterio y no por cansancio.

#### Acceptance Criteria

1. El sistema DEBE evaluar estos casilleros en cada turno, con código puro:
   - **E1** Punto de partida: hay evidencia N0.* **o** ya se preguntó una vez.
   - **E2** Intereses: ≥2 evidencias de interés a favor (N1/N2/N3) que apunten a la **misma área**. Las opciones tocadas cuentan.
   - **E3** Lo que le importa: ≥1 N4.VALOR.
   - **C1** Restricciones prácticas (N4.BARRERA o "ninguna").
   - **C2** Rechazos (N3.RECHAZO).
   - **C3** Un episodio concreto (evidencia `concrete: true`).
2. El planificador DEBE aplicar estas reglas **en este orden** y quedarse con la primera que se cumpla:
   1. La persona pidió el perfil → `CLOSE`.
   2. `questionsAsked >= 8` → `CLOSE`.
   3. E1+E2+E3 cumplidos, ≥1 complementario y `questionsAsked >= 5` → `CLOSE`.
   4. E1+E2+E3 cumplidos y `questionsAsked >= 4` → `OFFER_CLOSE`, **una sola vez**, con los botones "Ver mi perfil" y "Una pregunta más". Si elige seguir, el turno siguiente cierra.
   5. `stall >= 2` (dos respuestas sin información seguidas) y `questionsAsked >= 4` → `CLOSE` con perfil **provisional**.
   6. En cualquier otro caso, preguntar por el casillero imprescindible faltante de mayor prioridad (E1 → E2 → E3). Si no falta ninguno, por el complementario (C1 → C2 → C3).
3. CUANDO el cierre ocurre sin E1+E2+E3, ENTONCES el perfil DEBE marcarse `provisional: true` y decir qué falta.
4. El sistema DEBE guardar `closeReason` con uno de estos valores: `user`, `budget`, `sufficient`, `offer_accepted`, `stalled`, `llm_failures`.

### Requirement 4 — Perfil a pedido en cualquier momento

**User Story:** Como joven, quiero poder pedir mi perfil cuando quiera, para no sentirme atrapado.

#### Acceptance Criteria

1. El botón "Ver mi perfil ahora" DEBE estar visible desde la primera pregunta.
2. CUANDO el texto de la persona expresa intención de terminar ("ver mi perfil", "terminar", "ya está", "basta", "quiero el resultado", "cortemos"), ENTONCES el sistema DEBE cerrar como si hubiera tocado el botón.
3. El cierre a pedido NO DEBE llamar al LLM (ni al analizador ni al entrevistador).
4. CUANDO la persona pide el perfil con menos de 2 respuestas con información, ENTONCES el sistema DEBE entregar un perfil provisional que diga honestamente que conoce poco y ofrezca seguir.

### Requirement 5 — Sin ciclos

**User Story:** Como equipo, queremos que sea imposible quedar atrapado en preguntas, confirmaciones o niveles, para que la demo no se arruine.

#### Acceptance Criteria

1. Cada indicador de la rúbrica DEBE preguntarse como máximo 1 vez, más 1 profundización.
2. La profundización ("contame una vez puntual…") solo DEBE ocurrir si la respuesta tuvo información pero no fue concreta. **Nunca** después de una respuesta sin información ni de "no me interesa".
3. El sistema DEBE hacer como máximo **un** mini-resumen de hipótesis en toda la charla, y solo si `questionsAsked <= 5`. Si la persona lo rechaza, el sistema registra su corrección y **no vuelve a resumir**.
4. NO DEBE existir avance por niveles bloqueante: ningún casillero puede impedir pasar a otro.
5. En cada turno, o aumenta la cobertura de casilleros, o aumenta `stall`. Esto se verifica con pruebas.

### Requirement 6 — Resiliencia ante fallos del LLM

**User Story:** Como presentadores, queremos que un fallo de Gemini no frene la demo, para poder mostrarla aunque la red o la cuota fallen.

#### Acceptance Criteria

1. Cada llamada al LLM DEBE tener un timeout de 12 s, con 1 reintento como máximo por turno. El turno completo debe resolverse en menos de 45 s.
2. CUANDO el analizador falla, ENTONCES el turno DEBE contar como respuesta sin información (`stall += 1`, `llmFailures += 1`) y el entrevistador DEBE usar plantilla.
3. CUANDO hay 2 fallos seguidos del LLM, ENTONCES el sistema DEBE ofrecer cerrar con lo que tiene (`closeReason: llm_failures` si acepta o llega al tope).
4. Las respuestas por opción (botón) NO DEBEN depender del LLM para registrar evidencia.
5. El cierre y la devolución DEBEN generarse sin LLM.

### Requirement 7 — Devolución (perfil) clara y honesta

**User Story:** Como joven, quiero una devolución humana y comprensible, para sentir que me escucharon y saber qué hacer con eso.

#### Acceptance Criteria

1. La devolución DEBE tener estas secciones:
   - "Lo que observé": 2 a 4 afirmaciones, cada una con la cita o la opción elegida que la sostiene.
   - "Lo que te importa".
   - "Para tener en cuenta" (restricciones).
   - "Lo que todavía no sé": un ítem por cada casillero no cumplido.
2. Cada afirmación de "Lo que observé" DEBE tener `evidenceIds` existentes en la sesión.
3. En modo demo, los porcentajes RIASEC NO DEBEN mostrarse. Se muestra "Lo que más apareció" en lenguaje llano.
4. CUANDO el perfil es provisional, ENTONCES DEBE verse un sello "Perfil provisional: charlamos poco".
5. La persona DEBE poder marcar cualquier ítem como "No es así" (el panel actual se mantiene).
6. NO DEBE atribuirse inteligencia, capacidad ni aptitudes no medidas, y DEBE mantenerse el aviso "Esto refleja lo que charlamos, no es un test".

### Requirement 8 — Catálogo curado UM + Udelar

**User Story:** Como equipo, queremos un catálogo pequeño y verificable, para no inventar carreras ni datos.

#### Acceptance Criteria

1. El catálogo DEBE vivir en `src/data/catalog.um-udelar.v1.json`, con entre 12 y 15 carreras de Udelar y UM.
2. Cada registro DEBE tener:
   - `institution`, `title`, `official_url` (dominio `udelar.edu.uy` o `um.edu.uy`), `checked_at` (fecha) y `checked_by`;
   - `summary_plain`, `areas` (etiqueta editorial), `activity_tags` y `unknowns`.
3. Los datos académicos (duración, créditos, sede, requisitos, costo) solo DEBEN aparecer en `facts` si figuran en la página oficial, con `source_url` y `checked_at`.
4. Un registro sin `checked_at` NO DEBE mostrarse.
5. Ningún dato del catálogo puede ser generado por un LLM. La carga y la verificación son manuales.
6. Una prueba sin red DEBE validar el esquema, los dominios oficiales y las fechas.

### Requirement 9 — Recomendaciones relevantes sin inventar compatibilidad

**User Story:** Como joven, quiero ver algunas carreras reales relacionadas con lo que conté, para saber por dónde empezar a investigar.

#### Acceptance Criteria

1. En modo demo (`CATALOG_MODE=demo-um-udelar`), el único proveedor DEBE ser el catálogo curado. Quedan apagados `demoCatalog`, `onetCatalog` y `officialCatalog`.
2. Solo DEBEN entrar carreras conectadas con ≥1 evidencia del perfil (área destacada o tag de actividad que coincide).
3. El sistema DEBE mostrar entre 3 y 5 carreras si pasan el umbral, menos si no, y **nunca rellenar**.
4. CUANDO no pasa ninguna, ENTONCES DEBE decir "Todavía no tengo suficiente para sugerirte carreras" y ofrecer hasta 2 preguntas más.
5. Cada tarjeta DEBE mostrar: qué es, por qué aparece (cita o elección de la persona), qué podría no gustarle, institución y "validado el dd/mm/aaaa".
6. NO DEBE mostrarse ningún porcentaje ni puntaje.
7. DEBE haber como máximo 2 carreras con la misma área principal.

### Requirement 10 — Ficha de la carrera, enlace oficial y fin de la demo

**User Story:** Como joven, quiero entender de qué se trata una carrera y llegar a su página oficial, para seguir investigando por mi cuenta.

#### Acceptance Criteria

1. Al elegir una carrera, la ficha DEBE mostrar:
   - `summary_plain`;
   - los `facts` con su fuente y fecha;
   - los `unknowns` como "Consultalo en la página oficial";
   - el botón "Ir a la página oficial ↗" (nueva pestaña, `rel="noopener noreferrer"`).
2. La caja "Preguntale a Rumbo sobre esta ficha" (`askAboutPath`) DEBE responder solo con datos de la ficha.
3. CUANDO la persona abre el enlace oficial, ENTONCES DEBE verse la pantalla "Fin del recorrido de la demo", con la encuesta corta y "Explorar otra carrera".
4. La sección de mentores NO DEBE verse (`MENTORS_ENABLED=false`).

### Requirement 11 — Calidad, pruebas y reglas del equipo

**User Story:** Como equipo, queremos pruebas automáticas que demuestren que no hay ciclos, para presentar con confianza.

#### Acceptance Criteria

1. DEBEN existir pruebas automáticas para:
   - nadie queda atrapado (200 conversaciones al azar con semilla fija + 7 personajes);
   - tope de 8;
   - respuestas ambiguas sin repetición;
   - cierre anticipado;
   - perfil a pedido;
   - fallo del LLM;
   - evidencia separada de lo desconocido;
   - perfil → carreras.
2. `npm test`, `npx tsc --noEmit` y `npm run lint` DEBEN pasar antes de cada PR.
3. Cambiar el criterio implica crear `rubric.v2.json` y `options.v1.json` nuevos. `rubric.v1.json` no se edita (regla de AGENTS.md).
4. Cada tarea va en su rama `<nombre>/<tema>` y su PR. Solo martotrigo mergea.
5. No se commitean `.env.local` ni claves.
