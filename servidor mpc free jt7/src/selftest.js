import { loadPolicy } from "./policy.js";
import { dirList, pathStat, pathSearch } from "./tools/documents.js";

export async function runSelfTest() {
  try {
    const policy = loadPolicy();
    const checks = [
      ["mode", typeof policy.mode === "string"],
      ["allowedCommands", Array.isArray(policy.allowedCommands)],
      ["allowedDesktopPrograms", Array.isArray(policy.allowedDesktopPrograms)],
      ["pathStat", pathStat({ targetPath: process.cwd() }).ok === true],
      ["dirList", dirList({ dirPath: process.cwd(), maxEntries: 5 }).ok === true],
      ["pathSearch", pathSearch({ rootPath: process.cwd(), query: "package", mode: "name", maxResults: 5 }).ok === true]
    ];

    let ok = true;
    for (const [name, pass] of checks) {
      if (!pass) ok = false;
      console.log(`[self-test] ${name}: ${pass ? "OK" : "FAIL"}`);
    }
    return ok;
  } catch (err) {
    console.error(`[self-test] error: ${err.message}`);
    return false;
  }
}
