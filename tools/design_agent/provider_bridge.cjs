#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { callProvider } = require(path.resolve(__dirname, "../../src-js/core/api-provider-adapter.js"));

function extractFirstJsonObject(text) {
  const source = String(text || "");
  const start = source.indexOf("{");
  if (start === -1) {
    return null;
  }
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }
  return null;
}

async function readStdinJson() {
  const input = await new Promise((resolve, reject) => {
    let buffer = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      buffer += chunk;
    });
    process.stdin.on("end", () => resolve(buffer));
    process.stdin.on("error", reject);
  });
  return JSON.parse(input || "{}");
}

async function main() {
  const input = await readStdinJson();
  const provider = String(input.provider || "").trim();
  const model = String(input.model || "").trim();
  const prompt = String(input.prompt || "").trim();
  if (!provider || provider === "copilot") {
    throw new Error("El provider bridge requiere un proveedor externo configurado.");
  }
  if (!prompt) {
    throw new Error("Falta prompt para construir el storyboard.");
  }

  const providerPrompt = [
    "Devuelve solo JSON válido, sin markdown ni explicaciones.",
    "La estructura debe ser exactamente: {",
    '  "title": string,',
    '  "subtitle": string,',
    '  "call_to_action": string,',
    '  "scenes": [',
    "    {",
    '      "headline": string,',
    '      "body": string,',
    '      "duration_sec": number,',
    '      "background": string,',
    '      "accent": string,',
    '      "bullets": string[]',
    "    }",
    "  ]",
    "}",
    "Genera exactamente 3 escenas, en español, con un tono profesional y accionable.",
    `Solicitud del usuario: ${prompt}`,
  ].join("\n");

  const result = await callProvider(providerPrompt, { provider, model });
  const summary = String(result?.final?.summary || result?.run?.summary || "");
  const rawJson = extractFirstJsonObject(summary);
  if (!rawJson) {
    throw new Error(`El proveedor respondió sin JSON parseable: ${summary.slice(0, 240)}`);
  }
  const storyboard = JSON.parse(rawJson);
  process.stdout.write(JSON.stringify({ storyboard, provider, model }, null, 2));
}

main().catch((error) => {
  process.stderr.write(`${String(error && error.message ? error.message : error)}\n`);
  process.exit(1);
});
