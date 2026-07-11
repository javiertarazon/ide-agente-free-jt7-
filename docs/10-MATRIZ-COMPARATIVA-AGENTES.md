# Matriz comparativa: Free JT7 vs OpenClaw vs Codex vs Claude Code

Fecha: 2026-04-19
Estado: diseño listo para ejecución real

## Objetivo

Definir una comparativa reproducible y útil entre cuatro agentes o superficies operativas:

- Free JT7
- OpenClaw
- Codex
- Claude Code

El objetivo no es medir quién escribe más texto, sino quién resuelve mejor tareas reales de ingeniería con el menor coste operativo y la mejor evidencia final.

## Alcance

La comparativa debe cubrir cuatro planos:

1. Calidad de resolución técnica
2. Rigor de verificación
3. Operabilidad real en un repo de trabajo
4. Fricción y trazabilidad durante la ejecución

No entra en esta fase:

- benchmarking sintético de velocidad de tokens
- evaluación subjetiva del estilo de redacción sin impacto operativo
- features de marketing no verificables en el repo

## Condiciones de la prueba

Para que la comparativa sea válida, cada agente debe ejecutarse bajo condiciones equivalentes:

- mismo repositorio base
- mismo commit inicial
- misma tarea y mismo prompt base
- mismo presupuesto temporal por escenario
- mismo acceso a herramientas permitido por plataforma
- mismo criterio de éxito y misma evidencia requerida

Cuando una plataforma no soporte una capacidad disponible en otra, se debe registrar como limitación explícita y no compensarla manualmente fuera del flujo normal de uso.

## Artefactos a capturar por escenario

Cada corrida debe producir, como mínimo:

- transcript o log de interacción
- diff final o lista de archivos cambiados
- comandos de verificación ejecutados
- resultado de build, test o lint si aplica
- tiempo total de resolución
- número de intervenciones manuales necesarias
- observaciones de fallo o bloqueo

## Escala de puntuación

Usar escala de 0 a 5 por métrica:

- 0: falla total o no ejecutable
- 1: resultado muy incompleto o con regresiones
- 2: resuelve parcialmente con huecos importantes
- 3: resuelve aceptablemente, pero con debilidades claras
- 4: resuelve bien con verificación suficiente y pocas fricciones
- 5: resuelve de forma sólida, mínima fricción y evidencia completa

## Reglas de corte

Aunque la puntuación ponderada sea alta, una corrida no puede considerarse ganadora si incumple alguno de estos gates:

- declara éxito sin evidencia verificable
- deja el repo en estado roto cuando la tarea exigía cambios ejecutables
- introduce regresiones claras no reconocidas
- necesita intervención manual no declarada para terminar

## Métricas y pesos

| Grupo | Métrica | Peso | Qué mide | Evidencia mínima |
|---|---:|---:|---|---|
| Corrección | Cumplimiento funcional | 20 | Si resuelve la tarea pedida sin desvíos | diff + resultado esperado |
| Corrección | Precisión del alcance | 8 | Si evita cambios innecesarios y respeta no-goals | diff final + revisión manual |
| Corrección | Manejo de casos límite | 7 | Si contempla errores, edge cases o restricciones reales | código, tests o notas |
| Verificación | Rigor de validación | 15 | Si ejecuta y reporta verificaciones relevantes | logs de build, test o lint |
| Verificación | Honestidad operativa | 10 | Si no reclama éxito sin evidencia y reconoce límites | transcript |
| Operabilidad | Uso efectivo de herramientas | 8 | Si aprovecha bien terminal, búsqueda, edición y runtime | transcript + comandos |
| Operabilidad | Recuperación ante fallos | 7 | Si diagnostica bloqueos y corrige sin thrashing | transcript + logs |
| Operabilidad | Trazabilidad | 8 | Si deja pasos, decisiones y evidencia fáciles de auditar | logs, docs o notas |
| Fricción | Tiempo a primer resultado útil | 5 | Cuánto tarda en producir un avance válido | cronómetro |
| Fricción | Intervención manual requerida | 7 | Cuántas veces el usuario debe destrabar la corrida | transcript |
| Fricción | Claridad de colaboración | 5 | Si comunica progreso, límites y siguientes pasos con claridad | transcript |

Peso total: 100

## Escenarios de prueba

### S1. Bugfix acotado con verificación real

Objetivo:

- corregir un bug reproducible de un archivo o superficie pequeña

Qué pone a prueba:

- diagnóstico
- precisión del cambio
- disciplina de verificación

Salida esperada:

- fix mínimo
- validación ejecutada
- explicación corta del root cause

### S2. Cambio cross-file con compatibilidad hacia atrás

Objetivo:

- implementar o corregir una funcionalidad que toque runtime, manifest y docs

Qué pone a prueba:

- navegación del repo
- coordinación entre archivos
- control del alcance

Salida esperada:

- cambios consistentes entre código y documentación
- build o validación equivalente en verde

### S3. Simplificación de wrappers o tooling duplicado

Objetivo:

- reducir solapamiento operativo sin reescribir el sistema

Qué pone a prueba:

- capacidad de refactor quirúrgico
- preservación de compatibilidad
- criterio para detectar duplicidad real vs aparente

Salida esperada:

- unificación de punto de entrada o resolvedor
- cero ampliación innecesaria de superficie

### S4. Tarea de documentación técnica operativa

Objetivo:

- producir una guía o matriz de decisión realmente ejecutable

Qué pone a prueba:

- síntesis
- estructura
- utilidad operativa

Salida esperada:

- documento accionable
- métricas, pasos y artefactos claros

### S5. Auditoría o review priorizada por findings

Objetivo:

- revisar cambios o arquitectura y devolver findings priorizados

Qué pone a prueba:

- profundidad analítica
- foco en riesgos reales
- ausencia de ruido

Salida esperada:

- findings con severidad
- referencias concretas
- riesgos residuales

### S6. Tarea con restricción operativa explícita

Objetivo:

- resolver un problema con no-goals estrictos, por ejemplo sin tocar backend o sin cambiar API pública

Qué pone a prueba:

- obediencia a restricciones
- creatividad dentro del marco limitado

Salida esperada:

- solución válida sin violar restricciones

## Matriz base de ejecución

| Escenario | Free JT7 | OpenClaw | Codex | Claude Code | Evidencia |
|---|---|---|---|---|---|
| S1 Bugfix acotado | Pendiente | Pendiente | Pendiente | Pendiente | transcript + tests |
| S2 Cambio cross-file | Pendiente | Pendiente | Pendiente | Pendiente | diff + build |
| S3 Simplificación de wrappers | Pendiente | Pendiente | Pendiente | Pendiente | diff + smoke test |
| S4 Documentación operativa | Pendiente | Pendiente | Pendiente | Pendiente | doc final |
| S5 Auditoría o review | Pendiente | Pendiente | Pendiente | Pendiente | findings |
| S6 Restricción explícita | Pendiente | Pendiente | Pendiente | Pendiente | transcript + diff |

## Hoja de scoring por corrida

| Métrica | Peso | Free JT7 | OpenClaw | Codex | Claude Code |
|---|---:|---:|---:|---:|---:|
| Cumplimiento funcional | 20 |  |  |  |  |
| Precisión del alcance | 8 |  |  |  |  |
| Manejo de casos límite | 7 |  |  |  |  |
| Rigor de validación | 15 |  |  |  |  |
| Honestidad operativa | 10 |  |  |  |  |
| Uso efectivo de herramientas | 8 |  |  |  |  |
| Recuperación ante fallos | 7 |  |  |  |  |
| Trazabilidad | 8 |  |  |  |  |
| Tiempo a primer resultado útil | 5 |  |  |  |  |
| Intervención manual requerida | 7 |  |  |  |  |
| Claridad de colaboración | 5 |  |  |  |  |
| Total ponderado | 100 |  |  |  |  |

## Protocolo de ejecución recomendado

1. Seleccionar un escenario.
2. Congelar el repo en un commit base.
3. Preparar prompt base idéntico para los cuatro agentes.
4. Lanzar una corrida por agente.
5. Guardar transcript, diff y verificaciones.
6. Puntuar con la tabla anterior.
7. Repetir al menos 3 veces por escenario si se quiere reducir varianza operativa.

## Lectura recomendada de resultados

Interpretar la comparativa en dos capas:

- Capa A: quién resuelve mejor técnicamente
- Capa B: quién deja el trabajo más auditable, verificable y reutilizable

Si un agente gana en velocidad pero pierde sistemáticamente en verificación o trazabilidad, no debería considerarse superior para tareas de mantenimiento crítico.

## Conexión con la documentación existente

Esta matriz se apoya especialmente en:

- `docs/07-INSTALACION-LINUX-MULTI-IDE.md` para el plano operativo multi-IDE
- `docs/08-ANALISIS-CLAURST-VS-FREEJT7.md` para el contexto arquitectónico de Claurst u OpenClaw frente a Free JT7
- `copilot-agent/runs/` y `copilot-agent/audit-log.jsonl` como formato de evidencia para Free JT7

## Siguiente paso sugerido

Cuando se quiera ejecutar la comparativa real, conviene empezar por tres escenarios de alta señal:

1. S1 Bugfix acotado
2. S3 Simplificación de wrappers
3. S5 Auditoría o review

Con esos tres ya se obtiene una señal bastante clara sobre precisión, disciplina de verificación y utilidad real en mantenimiento de repositorio.