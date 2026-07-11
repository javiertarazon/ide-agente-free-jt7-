const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createFreeJt7AgentRuntime } = require("../src-js/core/freejt7-agent-runtime");

function createSamplePdf(filePath) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    null,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const content = "BT\n/F1 18 Tf\n40 90 Td\n(Hola PDF Free JT7) Tj\nET";
  objects[3] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const startXref = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Root 1 0 R /Size ${objects.length + 1} >>\nstartxref\n${startXref}\n%%EOF\n`;
  fs.writeFileSync(filePath, pdf, "utf8");
}

async function main() {
  const { dirList, pathStat, pdfExtractText, documentRead, pathSearch } = await import("../servidor mpc free jt7/src/tools/documents.js");
  const { browserOpen, browserSearch, browserOpenFile } = await import("../servidor mpc free jt7/src/tools/browser.js");
  const { desktopOpenPath, desktopRevealPath } = await import("../servidor mpc free jt7/src/tools/desktop.js");

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "freejt7-mcp-tools-"));
  const nested = path.join(root, "docs");
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "freejt7-mcp-outside-"));
  fs.mkdirSync(nested, { recursive: true });
  fs.writeFileSync(path.join(root, "notes.txt"), "hola mundo\n", "utf8");
  const outsideFile = path.join(outsideRoot, "secret.txt");
  fs.writeFileSync(outsideFile, "fuera de policy\n", "utf8");
  const pdfPath = path.join(nested, "sample.pdf");
  createSamplePdf(pdfPath);
  const policy = {
    allowedFileRoots: [root],
    allowedWebDomains: ["*"],
    allowWildcardWebDomains: true,
    allowedBrowserPrograms: [],
    allowedDesktopPrograms: []
  };

  const runtime = createFreeJt7AgentRuntime({
    getWorkspacePath: () => root,
    getProviderConfig: () => ({ provider: "openrouter", model: "demo" }),
    runLocalAgentTask: async () => ({ run: { summary: "local ok" }, final: { summary: "local ok" } }),
    runOpenClawAgentTask: async () => ({ run: { summary: "remote ok" }, final: { summary: "remote ok" } }),
    getMcpServers: () => [{ id: "free-jt7-local", transport: "stdio", enabled: true }],
  });
  const plan = runtime.planTaskExecution("abre sample.pdf, busca free jt7 agent en la web y revela notes.txt en el escritorio", {
    provider: "openrouter",
    model: "demo",
    selectedSkills: [{ id: "document-triage" }],
  });
  assert.equal(plan.capabilityPlan.dispatch.owner, "freejt7-agent-runtime");
  assert.equal(plan.capabilityPlan.dispatch.dispatchTarget, "openclaw-agent-runtime");
  assert.deepStrictEqual(
    plan.capabilityPlan.nativeMcpTools.map((item) => item.family).sort(),
    ["browser", "desktop", "documents"],
  );
  assert.ok(plan.capabilityPlan.dispatch.trace.includes("mcp:free-jt7-local->openclaw-agent-runtime"));
  assert.ok(plan.capabilityPlan.dispatch.trace.includes("mcp-tool:documents->openclaw-agent-runtime"));

  const stat = pathStat({ targetPath: root });
  assert.equal(stat.ok, true);
  assert.equal(stat.kind, "directory");

  const listed = dirList({ dirPath: root, recursive: true, maxDepth: 3, maxEntries: 20 });
  assert.equal(listed.ok, true);
  assert.equal(listed.entries.some((entry) => entry.path === pdfPath), true);

  const pdf = await pdfExtractText({ filePath: pdfPath, maxChars: 5000 });
  assert.equal(pdf.ok, true);
  assert.equal(/Hola PDF Free JT7/i.test(pdf.text), true);
  assert.equal(pdf.pages >= 1, true);

  const jsonPath = path.join(root, "sample.json");
  fs.writeFileSync(jsonPath, JSON.stringify({ ok: true, nested: { value: 7 } }), "utf8");
  const doc = await documentRead({ filePath: jsonPath, maxChars: 5000 });
  assert.equal(doc.ok, true);
  assert.equal(doc.format, "json");
  assert.equal(/"nested"/.test(doc.text), true);

  const searchByName = pathSearch({ rootPath: root, query: "sample", mode: "name", maxResults: 10 });
  assert.equal(searchByName.ok, true);
  assert.equal(searchByName.total >= 2, true);

  const searchByContent = pathSearch({ rootPath: root, query: "hola mundo", mode: "content", maxResults: 10 });
  assert.equal(searchByContent.ok, true);
  assert.equal(searchByContent.total >= 1, true);

  assert.equal(pathStat({ targetPath: outsideFile }, policy).ok, false);
  assert.equal(dirList({ dirPath: outsideRoot }, policy).ok, false);
  assert.equal((await documentRead({ filePath: outsideFile }, policy)).ok, false);
  assert.equal((await pdfExtractText({ filePath: outsideFile }, policy)).ok, false);
  assert.equal(pathSearch({ rootPath: outsideRoot, query: "fuera", mode: "content" }, policy).ok, false);

  const browser = browserOpen({ url: "https://example.com", dryRun: true }, policy);
  assert.equal(browser.ok, true);
  assert.equal(browser.dryRun, true);
  assert.equal(Array.isArray(browser.args), true);

  const browserSearchResult = browserSearch({ query: "free jt7 agent", engine: "duckduckgo", dryRun: true }, policy);
  assert.equal(browserSearchResult.ok, true);
  assert.equal(/duckduckgo/i.test(browserSearchResult.url), true);

  const browserFile = browserOpenFile({ filePath: jsonPath, dryRun: true }, policy);
  assert.equal(browserFile.ok, true);
  assert.equal(String(browserFile.url).startsWith("file://"), true);
  assert.equal(browserOpenFile({ filePath: outsideFile, dryRun: true }, policy).ok, false);

  const openPath = desktopOpenPath({ targetPath: jsonPath, dryRun: true }, policy);
  assert.equal(openPath.ok, true);
  assert.equal(Array.isArray(openPath.args), true);
  assert.equal(desktopOpenPath({ targetPath: outsideFile, dryRun: true }, policy).ok, false);

  const revealPath = desktopRevealPath({ targetPath: jsonPath, dryRun: true }, policy);
  assert.equal(revealPath.ok, true);
  assert.equal(revealPath.reveal, true);
  assert.equal(desktopRevealPath({ targetPath: outsideFile, dryRun: true }, policy).ok, false);

  console.log("mcp_documents_tools_smoke: ok");
}

main().catch((error) => {
  console.error(String(error?.stack || error?.message || error));
  process.exitCode = 1;
});
