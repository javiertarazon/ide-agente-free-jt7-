import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import { loadPolicy } from "./policy.js";
import { runSelfTest } from "./selftest.js";
import { browserOpen, browserOpenFile, browserSearch } from "./tools/browser.js";
import { dirList, pathStat, pdfExtractText, documentRead, pathSearch } from "./tools/documents.js";
import { webFetch } from "./tools/web.js";
import { scrapeText } from "./tools/scraping.js";
import { systemExec, fileRead, fileWrite } from "./tools/system.js";
import { desktopOpen, desktopOpenPath, desktopRevealPath } from "./tools/desktop.js";
import { youtubeInfo, youtubeDownloadRequest } from "./tools/media.js";
import { mt5DesktopLogin } from "./tools/mt5_desktop.js";
import { createMt5Tools } from "./tools/mt5.js";

const policy = loadPolicy();
const mt5Tools = createMt5Tools(policy);

if (process.argv.includes("--self-test")) {
  const ok = await runSelfTest();
  process.exit(ok ? 0 : 1);
}

const server = new Server(
  {
    name: "free-jt7-mcp-server",
    version: "0.1.0"
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

const tools = {
  jt7_ping: {
    description: "Verifica estado del servidor.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false
    },
    run: async () => ({ ok: true, ts: new Date().toISOString(), mode: policy.mode })
  },
  jt7_web_fetch: {
    description: "Hace fetch HTTP a una URL permitida por politica.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", format: "uri" },
        method: { type: "string" },
        headers: { type: "object", additionalProperties: { type: "string" } },
        body: { type: "string" }
      },
      required: ["url"],
      additionalProperties: false
    },
    run: (args) => webFetch(args, policy)
  },
  jt7_scrape_text: {
    description: "Extrae texto plano desde una pagina web permitida.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", format: "uri" },
        maxChars: { type: "number" }
      },
      required: ["url"],
      additionalProperties: false
    },
    run: (args) => scrapeText(args, policy)
  },
  jt7_browser_open: {
    description: "Abre una URL permitida en navegador por defecto o en uno permitido explicitamente.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", format: "uri" },
        browser: { type: "string" },
        mode: { type: "string", enum: ["default", "new-window", "app"] },
        dryRun: { type: "boolean" }
      },
      required: ["url"],
      additionalProperties: false
    },
    run: (args) => browserOpen(args, policy)
  },
  jt7_browser_search: {
    description: "Abre una búsqueda web en navegador permitido.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        engine: { type: "string", enum: ["google", "bing", "duckduckgo"] },
        browser: { type: "string" },
        mode: { type: "string", enum: ["default", "new-window", "app"] },
        dryRun: { type: "boolean" }
      },
      required: ["query"],
      additionalProperties: false
    },
    run: (args) => browserSearch(args, policy)
  },
  jt7_browser_open_file: {
    description: "Abre un archivo local en un navegador permitido.",
    inputSchema: {
      type: "object",
      properties: {
        filePath: { type: "string" },
        browser: { type: "string" },
        mode: { type: "string", enum: ["default", "new-window", "app"] },
        dryRun: { type: "boolean" }
      },
      required: ["filePath"],
      additionalProperties: false
    },
    run: (args) => browserOpenFile(args, policy)
  },
  jt7_system_exec: {
    description: "Ejecuta comando local permitido por la politica.",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string" },
        args: { type: "array", items: { type: "string" } },
        cwd: { type: "string" },
        timeoutMs: { type: "number" }
      },
      required: ["command"],
      additionalProperties: false
    },
    run: (args) => systemExec(args, policy)
  },
  jt7_desktop_open: {
    description: "Abre un programa de escritorio permitido por la politica.",
    inputSchema: {
      type: "object",
      properties: {
        program: { type: "string" },
        args: { type: "array", items: { type: "string" } }
      },
      required: ["program"],
      additionalProperties: false
    },
    run: (args) => desktopOpen(args, policy)
  },
  jt7_desktop_open_path: {
    description: "Abre un archivo o carpeta local con la aplicación del sistema.",
    inputSchema: {
      type: "object",
      properties: {
        targetPath: { type: "string" },
        dryRun: { type: "boolean" }
      },
      required: ["targetPath"],
      additionalProperties: false
    },
    run: (args) => desktopOpenPath(args, policy)
  },
  jt7_desktop_reveal_path: {
    description: "Revela un archivo o carpeta local en el explorador del sistema.",
    inputSchema: {
      type: "object",
      properties: {
        targetPath: { type: "string" },
        dryRun: { type: "boolean" }
      },
      required: ["targetPath"],
      additionalProperties: false
    },
    run: (args) => desktopRevealPath(args, policy)
  },
  jt7_mt5_desktop_login: {
    description: "Login MT5 por desktop (SendKeys) usando ventana activa.",
    inputSchema: {
      type: "object",
      properties: {
        login: { type: ["string", "number"] },
        password: { type: "string" },
        server: { type: "string" },
        windowTitle: { type: "string" },
        delayMs: { type: "number" },
        openShortcut: { type: "string" }
      },
      required: ["login", "password", "server"],
      additionalProperties: false
    },
    run: (args) => mt5DesktopLogin(args, policy)
  },
  jt7_file_read: {
    description: "Lee un archivo local.",
    inputSchema: {
      type: "object",
      properties: {
        filePath: { type: "string" },
        maxBytes: { type: "number" }
      },
      required: ["filePath"],
      additionalProperties: false
    },
    run: (args) => fileRead(args, policy)
  },
  jt7_file_write: {
    description: "Escribe un archivo local.",
    inputSchema: {
      type: "object",
      properties: {
        filePath: { type: "string" },
        content: { type: "string" },
        overwrite: { type: "boolean" }
      },
      required: ["filePath", "content"],
      additionalProperties: false
    },
    run: (args) => fileWrite(args, policy)
  },
  jt7_path_stat: {
    description: "Inspecciona una ruta local y devuelve metadatos basicos.",
    inputSchema: {
      type: "object",
      properties: {
        targetPath: { type: "string" }
      },
      required: ["targetPath"],
      additionalProperties: false
    },
    run: (args) => pathStat(args, policy)
  },
  jt7_dir_list: {
    description: "Lista el contenido de un directorio local con soporte opcional recursivo.",
    inputSchema: {
      type: "object",
      properties: {
        dirPath: { type: "string" },
        maxEntries: { type: "number" },
        recursive: { type: "boolean" },
        maxDepth: { type: "number" }
      },
      required: ["dirPath"],
      additionalProperties: false
    },
    run: (args) => dirList(args, policy)
  },
  jt7_pdf_extract_text: {
    description: "Extrae texto y metadatos basicos de un archivo PDF local.",
    inputSchema: {
      type: "object",
      properties: {
        filePath: { type: "string" },
        maxChars: { type: "number" },
        password: { type: "string" }
      },
      required: ["filePath"],
      additionalProperties: false
    },
    run: (args) => pdfExtractText(args, policy)
  },
  jt7_document_read: {
    description: "Lee y normaliza documentos locales de texto/JSON/HTML/CSV/PDF.",
    inputSchema: {
      type: "object",
      properties: {
        filePath: { type: "string" },
        maxChars: { type: "number" }
      },
      required: ["filePath"],
      additionalProperties: false
    },
    run: (args) => documentRead(args, policy)
  },
  jt7_path_search: {
    description: "Busca por nombre de archivo o por contenido dentro de una ruta local.",
    inputSchema: {
      type: "object",
      properties: {
        rootPath: { type: "string" },
        query: { type: "string" },
        mode: { type: "string", enum: ["content", "name"] },
        maxResults: { type: "number" }
      },
      required: ["rootPath", "query"],
      additionalProperties: false
    },
    run: (args) => pathSearch(args, policy)
  },
  jt7_youtube_info: {
    description: "Obtiene metadatos de una URL de YouTube via oEmbed.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", format: "uri" }
      },
      required: ["url"],
      additionalProperties: false
    },
    run: (args) => youtubeInfo(args)
  },
  jt7_youtube_download_request: {
    description: "Gestiona solicitud de descarga de YouTube bajo politica y derechos.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", format: "uri" },
        hasRights: { type: "boolean" },
        reason: { type: "string" }
      },
      required: ["url", "hasRights"],
      additionalProperties: false
    },
    run: (args) => youtubeDownloadRequest(args, policy)
  },
  ...mt5Tools
};

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: Object.entries(tools).map(([name, tool]) => ({
      name,
      description: tool.description,
      inputSchema: tool.inputSchema
    }))
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  const tool = tools[name];

  if (!tool) {
    return {
      content: [{ type: "text", text: `Tool no encontrada: ${name}` }],
      isError: true
    };
  }

  try {
    const result = await tool.run(args);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
    };
  } catch (err) {
    return {
      content: [{ type: "text", text: `Error en ${name}: ${err.message}` }],
      isError: true
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
