import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { z } from "zod";
import { isPathAllowed } from "../policy.js";

const statSchema = z.object({
  targetPath: z.string().min(1)
});

const listSchema = z.object({
  dirPath: z.string().min(1),
  maxEntries: z.number().int().positive().optional().default(200),
  recursive: z.boolean().optional().default(false),
  maxDepth: z.number().int().min(0).optional().default(2)
});

const pdfSchema = z.object({
  filePath: z.string().min(1),
  maxChars: z.number().int().positive().optional().default(20000),
  password: z.string().optional()
});

const docSchema = z.object({
  filePath: z.string().min(1),
  maxChars: z.number().int().positive().optional().default(30000)
});

const searchSchema = z.object({
  rootPath: z.string().min(1),
  query: z.string().min(1),
  mode: z.enum(["content", "name"]).optional().default("content"),
  maxResults: z.number().int().positive().optional().default(100)
});

function normalizePath(inputPath) {
  return path.resolve(String(inputPath || ""));
}

function denyIfPathNotAllowed(targetPath, policy) {
  if (!policy) {
    return null;
  }
  const access = isPathAllowed(targetPath, policy);
  return access.ok ? null : {
    ok: false,
    targetPath: access.target,
    error: access.error,
    allowedFileRoots: access.roots
  };
}

function buildStatPayload(targetPath, stats) {
  return {
    ok: true,
    targetPath,
    exists: true,
    kind: stats.isDirectory() ? "directory" : stats.isFile() ? "file" : "other",
    size: Number(stats.size || 0),
    mtime: stats.mtime?.toISOString?.() || null,
    ctime: stats.ctime?.toISOString?.() || null,
    atime: stats.atime?.toISOString?.() || null,
  };
}

export function pathStat(input, policy) {
  const args = statSchema.parse(input);
  const targetPath = normalizePath(args.targetPath);
  const denied = denyIfPathNotAllowed(targetPath, policy);
  if (denied) {
    return { ...denied, exists: fs.existsSync(targetPath) };
  }
  if (!fs.existsSync(targetPath)) {
    return {
      ok: false,
      targetPath,
      exists: false,
      error: "Ruta no existe"
    };
  }
  return buildStatPayload(targetPath, fs.statSync(targetPath));
}

function walkDirectory(dirPath, options, depth = 0, collector = []) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (collector.length >= options.maxEntries) {
      break;
    }
    const absolutePath = path.join(dirPath, entry.name);
    const stats = fs.statSync(absolutePath);
    collector.push({
      name: entry.name,
      path: absolutePath,
      kind: entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "other",
      size: Number(stats.size || 0),
      mtime: stats.mtime?.toISOString?.() || null,
      depth
    });
    if (options.recursive && entry.isDirectory() && depth < options.maxDepth && collector.length < options.maxEntries) {
      walkDirectory(absolutePath, options, depth + 1, collector);
    }
  }
  return collector;
}

export function dirList(input, policy) {
  const args = listSchema.parse(input);
  const dirPath = normalizePath(args.dirPath);
  const denied = denyIfPathNotAllowed(dirPath, policy);
  if (denied) {
    return { ...denied, dirPath };
  }
  if (!fs.existsSync(dirPath)) {
    return { ok: false, dirPath, error: "Directorio no existe" };
  }
  const stats = fs.statSync(dirPath);
  if (!stats.isDirectory()) {
    return { ok: false, dirPath, error: "La ruta indicada no es un directorio" };
  }

  const entries = walkDirectory(dirPath, args);
  return {
    ok: true,
    dirPath,
    recursive: args.recursive,
    maxDepth: args.maxDepth,
    total: entries.length,
    truncated: entries.length >= args.maxEntries,
    entries
  };
}

function extractPdfTextHeuristic(buffer) {
  const raw = buffer.toString("latin1");
  const chunks = [];
  const regex = /\(([^()]*(?:\\.[^()]*)*)\)\s*Tj/g;
  let match;
  while ((match = regex.exec(raw)) !== null) {
    chunks.push(
      match[1]
        .replace(/\\([\\()])/g, "$1")
        .replace(/\\r/g, "\r")
        .replace(/\\n/g, "\n")
        .replace(/\\t/g, "\t")
        .replace(/\\([0-7]{3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)))
    );
  }
  return chunks.join("\n").replace(/\u0000/g, "").trim();
}

function extractPdfTextWithPdftotext(filePath) {
  const result = spawnSync("pdftotext", ["-layout", filePath, "-"], {
    encoding: "utf8",
    timeout: 15000,
    windowsHide: true
  });
  if (result.error || result.status !== 0) {
    return null;
  }
  return String(result.stdout || "").trim();
}

function htmlToText(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTextDocument(filePath, maxChars) {
  const ext = path.extname(filePath).toLowerCase();
  const raw = fs.readFileSync(filePath, "utf8");
  let text = raw;
  let format = ext.replace(/^\./, "") || "text";

  if (ext === ".json") {
    format = "json";
    try {
      text = JSON.stringify(JSON.parse(raw), null, 2);
    } catch (_) {}
  } else if (ext === ".html" || ext === ".htm") {
    format = "html";
    text = htmlToText(raw);
  } else if (ext === ".csv") {
    format = "csv";
  } else if (ext === ".md" || ext === ".txt" || ext === ".log" || ext === ".yaml" || ext === ".yml" || ext === ".xml") {
    format = ext.replace(/^\./, "");
  }

  return {
    ok: true,
    filePath,
    format,
    text: text.slice(0, maxChars),
    truncated: text.length > maxChars
  };
}

export async function documentRead(input, policy) {
  const args = docSchema.parse(input);
  const filePath = normalizePath(args.filePath);
  const denied = denyIfPathNotAllowed(filePath, policy);
  if (denied) {
    return { ...denied, filePath };
  }
  if (!fs.existsSync(filePath)) {
    return { ok: false, filePath, error: "Documento no existe" };
  }
  const stats = fs.statSync(filePath);
  if (!stats.isFile()) {
    return { ok: false, filePath, error: "La ruta indicada no es un archivo" };
  }
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".pdf") {
    return pdfExtractText({ filePath, maxChars: args.maxChars }, policy);
  }
  return normalizeTextDocument(filePath, args.maxChars);
}

function searchWithRipgrep(rootPath, query, mode, maxResults) {
  const args = mode === "name"
    ? ["--files", rootPath]
    : ["-n", "--no-heading", "--color", "never", query, rootPath];
  const first = spawnSync("rg", args, {
    encoding: "utf8",
    timeout: 15000,
    windowsHide: true
  });
  const raw = String(first.stdout || "");
  if ((first.error && !raw) || (first.status !== 0 && first.status !== 1)) {
    return null;
  }
  let lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (mode === "name") {
    lines = lines.filter((line) => line.toLowerCase().includes(query.toLowerCase()));
  }
  return lines.slice(0, maxResults).map((line) => {
    if (mode === "name") {
      return { path: line };
    }
    const match = line.match(/^(.*?):(\d+):(.*)$/);
    if (!match) {
      return { path: line, line: null, preview: "" };
    }
    return {
      path: match[1],
      line: Number(match[2]),
      preview: match[3].trim()
    };
  });
}

function walkForNameMatches(rootPath, query, maxResults, collector = []) {
  const entries = fs.readdirSync(rootPath, { withFileTypes: true });
  for (const entry of entries) {
    if (collector.length >= maxResults) {
      break;
    }
    const absolutePath = path.join(rootPath, entry.name);
    if (entry.name.toLowerCase().includes(query.toLowerCase())) {
      collector.push({ path: absolutePath });
    }
    if (entry.isDirectory()) {
      walkForNameMatches(absolutePath, query, maxResults, collector);
    }
  }
  return collector;
}

function walkForContentMatches(rootPath, query, maxResults, collector = []) {
  const entries = fs.readdirSync(rootPath, { withFileTypes: true });
  const needle = query.toLowerCase();
  for (const entry of entries) {
    if (collector.length >= maxResults) {
      break;
    }
    const absolutePath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      walkForContentMatches(absolutePath, query, maxResults, collector);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    try {
      const text = fs.readFileSync(absolutePath, "utf8");
      const index = text.toLowerCase().indexOf(needle);
      if (index >= 0) {
        const before = text.slice(0, index).split(/\r?\n/);
        const line = before.length;
        const preview = text.split(/\r?\n/)[line - 1] || "";
        collector.push({ path: absolutePath, line, preview: preview.trim() });
      }
    } catch (_) {}
  }
  return collector;
}

export function pathSearch(input, policy) {
  const args = searchSchema.parse(input);
  const rootPath = normalizePath(args.rootPath);
  const denied = denyIfPathNotAllowed(rootPath, policy);
  if (denied) {
    return { ...denied, rootPath };
  }
  if (!fs.existsSync(rootPath)) {
    return { ok: false, rootPath, error: "Ruta raiz no existe" };
  }
  const stats = fs.statSync(rootPath);
  if (!stats.isDirectory()) {
    return { ok: false, rootPath, error: "La ruta raiz no es un directorio" };
  }

  const rgResults = searchWithRipgrep(rootPath, args.query, args.mode, args.maxResults);
  const results = rgResults || (args.mode === "name"
    ? walkForNameMatches(rootPath, args.query, args.maxResults)
    : walkForContentMatches(rootPath, args.query, args.maxResults));

  return {
    ok: true,
    rootPath,
    query: args.query,
    mode: args.mode,
    total: results.length,
    truncated: results.length >= args.maxResults,
    engine: rgResults ? "ripgrep" : "fallback",
    results
  };
}

export async function pdfExtractText(input, policy) {
  const args = pdfSchema.parse(input);
  const filePath = normalizePath(args.filePath);
  const denied = denyIfPathNotAllowed(filePath, policy);
  if (denied) {
    return { ...denied, filePath };
  }
  if (!fs.existsSync(filePath)) {
    return { ok: false, filePath, error: "PDF no existe" };
  }

  const buffer = fs.readFileSync(filePath);
  const pdftotextText = extractPdfTextWithPdftotext(filePath);
  const rawText = pdftotextText || extractPdfTextHeuristic(buffer);
  const pageMatches = buffer.toString("latin1").match(/\/Type\s*\/Page\b/g);
  return {
    ok: Boolean(rawText),
    filePath,
    text: rawText.slice(0, args.maxChars),
    truncated: rawText.length > args.maxChars,
    pages: Number(pageMatches?.length || 0),
    extractor: pdftotextText ? "pdftotext" : "heuristic",
    info: {},
    error: rawText ? undefined : "No se pudo extraer texto util del PDF con los extractores disponibles"
  };
}
