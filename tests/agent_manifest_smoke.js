const assert = require("assert");
const fs = require("fs");
const path = require("path");

const AGENT_DIR = path.join(__dirname, "..", ".github", "agents");
const REQUIRED_KEYS = ["name", "description", "tools", "argument-hint", "user-invokable"];
const ALLOWED_TOOLS = new Set(["read", "edit", "search", "execute", "agent"]);

function readFrontmatter(filePath) {
  const text = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  assert(match, `${path.basename(filePath)} debe comenzar con frontmatter YAML`);
  return match[1];
}

function parseFrontmatter(frontmatter) {
  const result = {};
  for (const rawLine of frontmatter.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const separatorIndex = line.indexOf(":");
    assert(separatorIndex > 0, `Linea de frontmatter invalida: ${line}`);
    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (value.startsWith("[") && value.endsWith("]")) {
      value = value
        .slice(1, -1)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => item.replace(/^['\"]|['\"]$/g, ""));
    } else if (value === "true" || value === "false") {
      value = value === "true";
    }
    result[key] = value;
  }
  return result;
}

for (const fileName of fs.readdirSync(AGENT_DIR).filter((name) => name.endsWith(".agent.md"))) {
  const filePath = path.join(AGENT_DIR, fileName);
  const frontmatter = parseFrontmatter(readFrontmatter(filePath));

  for (const key of REQUIRED_KEYS) {
    assert(frontmatter[key] !== undefined, `${fileName} debe declarar ${key}`);
  }

  assert(Array.isArray(frontmatter.tools), `${fileName} debe declarar tools como lista inline`);
  assert(frontmatter.tools.length > 0, `${fileName} debe declarar al menos una tool`);
  for (const toolName of frontmatter.tools) {
    assert(ALLOWED_TOOLS.has(toolName), `${fileName} usa una tool no soportada: ${toolName}`);
  }
}

console.log("agent-manifest-smoke: ok");