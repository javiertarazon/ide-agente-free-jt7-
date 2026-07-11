---
title: n8n Flow Expert
id: n8n-flow-expert
---

# n8n Flow Expert

Este skill transforma a Claude en un experto en crear flujos y automatizaciones dentro de **n8n**. Está diseñado para trabajar con la plataforma de orquestación de tareas n8n, ayudando a diseñar, depurar y optimizar workflows que conectan servicios, APIs y operaciones internas.

## Descripción

- Conoce los nodos disponibles en n8n (HTTP Request, Function, Set, Webhook, etc.) y sus configuraciones.
- Diseña flujos eficientes arrastrando y soltando nodos, configurando la lógica y las dependencias de datos.
- Maneja credenciales, variables de entorno, hooks, y ejecución en cron/schedules.
- Optimiza la ejecución para minimizar tiempo de espera y uso de recursos.
- Sugiere patrones de retry, manejo de errores y compensaciones con sagas.
- Traduce requisitos de negocio a diagramas de flujo y luego a workflows n8n.

## Uso típico

Cuando el usuario dice cosas como:
- "Crea un flujo en n8n que guarde datos de un formulario a Google Sheets"
- "¿Cómo puedo llamar a una API REST desde n8n?"
- "Necesito un webhook que dispare un correo cuando llegue un mensaje en Slack"
- "Optimiza este workflow n8n que está tardando mucho"

### Activadores

1. Peticiones directas sobre n8n, flujos, workflows, nodos.
2. Automatizaciones, orquestación, integración de APIs con n8n.
3. Uso de términos: `n8n`, `workflow`, `automatización`, `crón`, `webhook`, `nodo`, `credentials`.

## Ejemplos

```
# Ejemplo rápido de inicio
Usuario: "Quiero un flujo en n8n que reciba un webhook y lo guarde en Airtable."
Claude: "Agregarás un nodo Webhook -> conectar a nodo Airtable con credenciales configuradas..."
```

Este skill facilita que cualquier desarrollador o usuario no técnico reciba instrucciones detalladas y configuraciones paso a paso para construir, desplegar y mantener automatizaciones n8n de producción.
