# Auditoria tecnica del router Copilot

Fecha de analisis: 2026-04-15
Archivo auditado: `src-js/copilot_router.runtime.js`

## Resumen

El router implementa un pipeline razonable de planificacion, ejecucion y sintesis sobre `@github/copilot-sdk`, pero hoy delega demasiada confianza en la salida del modelo y en una politica de permisos muy abierta. No hay un problema unico de rotura inmediata; el riesgo principal es una combinacion de sobrepermisos, persistencia poco filtrada y validacion debil de lo que el propio modelo afirma haber hecho.

## Hallazgos principales

### 1. Autoaprobacion demasiado amplia

El router autoaprueba tools cuando `autoApproveSafeTools` esta activo y solo bloquea unos pocos patrones destructivos por substring en shell.

Impacto:

- cualquier comando no coincidente con la lista minima pasa por aprobado
- el control no valida contexto, argumentos ni efecto real
- la seguridad depende mas del prompt y del modelo que de una politica robusta

Riesgo: alto

## 2. El ejecutor recibe el set completo de herramientas

En la fase de ejecucion, `sendSession(... allowTools: true)` deja las tools del SDK disponibles para la subtarea. Planner y synthesis van sin tools, pero el ejecutor si puede operar sobre el workspace con amplio margen.

Impacto:

- una tarea mal planificada puede ejecutar cambios amplios
- el filtro de permisos no distingue por tipo de archivo, directorio o superficie afectada

Riesgo: alto

## 3. Validacion debil de JSON y de resultados declarados por el modelo

El router usa `parseJsonResponse` con una extraccion tolerante de JSON y aplica fallback si el parseo falla. Despues usa directamente campos como `files`, `verification`, `residualRisks`, `changedFiles` y `summary` sin comprobacion estructural ni verificacion externa.

Impacto:

- el modelo puede declarar archivos o verificaciones no ejecutadas
- el router puede marcar una corrida como completada a partir de una sintesis formalmente valida pero materialmente falsa

Riesgo: medio

## 4. Quality gate nominal, no ejecutado

`run.quality_gate.passed` depende de `final.status === "completed"`. No existe una reejecucion interna de validaciones ni comprobacion independiente de `verification`.

Impacto:

- la calidad queda determinada por texto generado, no por evidencia dura

Riesgo: medio

## 5. Persistencia extensa sin redaccion equivalente a la CLI Python

El router escribe planner, executor y synthesis completos en `copilot-agent/runs/*.events.jsonl` y `*.json`. A diferencia de `skills_manager.py`, aqui no hay una fase de redaccion sensible antes de persistir outputs del modelo.

Impacto:

- prompts, rutas, fragmentos de codigo o datos sensibles pueden quedar almacenados en el workspace
- el riesgo sube si el modelo copia tokens, secrets o comandos con credenciales

Riesgo: medio

## 6. Precedencia silenciosa entre configuracion del repo y del editor

`mergeRouterConfig` mezcla `.github/free-jt7-model-routing.json` con settings `freejt7.copilotRouter.*` del editor usando fallback por valor truthy.

Impacto:

- el override del editor puede cambiar planner o ejecutores sin trazabilidad explicita en UI
- diagnosticar diferencias entre equipos se vuelve dificil

Riesgo: medio

## 7. Ejecucion secuencial y sin control de explosion del plan

El plan puede devolver un numero arbitrario de tareas y se ejecutan de forma secuencial. No hay limite superior ni recorte por complejidad.

Impacto:

- prompts largos o planes inflados pueden disparar latencia y coste
- la robustez depende del buen comportamiento del planner

Riesgo: bajo

## Recomendaciones priorizadas

1. Sustituir el filtro de `isDestructiveShell` por una allowlist real de tools/comandos/directorios y no solo patrones por texto.
2. Aplicar validacion estricta de esquema al JSON de planner, executor y synthesis.
3. Ejecutar una fase de verificacion real antes de marcar `quality_gate.passed=true`.
4. Redactar outputs persistidos del router con reglas equivalentes a `_redact_sensitive` de `skills_manager.py`.
5. Registrar explicitamente en cada run la fuente final de cada modelo: repo, editor o variable de entorno.
6. Limitar el numero maximo de tareas y el tamaño de outputs aceptados por cada fase.

## Estado actual recomendado

El router es util y ya operativo, pero debe tratarse como un orquestador con guardrails parciales, no como un pipeline formalmente asegurado. Para uso cotidiano es suficiente con autenticacion valida de Copilot y criterio en los prompts; para uso mas autonomo conviene endurecer permisos, verificacion y persistencia.