import { z } from "zod";
import { systemExec } from "./system.js";

const schema = z.object({
  login: z.union([z.string(), z.number()]),
  password: z.string().min(1),
  server: z.string().min(1),
  windowTitle: z.string().optional().default("MetaTrader 5"),
  delayMs: z.number().int().positive().optional().default(300),
  openShortcut: z.string().optional().default("^l")
});

function escapePowerShell(value) {
  return String(value).replace(/'/g, "''");
}

function escapeSendKeys(value) {
  return String(value).replace(/([+^%~(){}])/g, "{$1}");
}

export async function mt5DesktopLogin(input, policy) {
  const args = schema.parse(input);
  const login = escapeSendKeys(args.login);
  const password = escapeSendKeys(args.password);
  const server = escapeSendKeys(args.server);
  const windowTitle = escapePowerShell(args.windowTitle);
  const delayMs = args.delayMs;
  const openShortcut = escapeSendKeys(args.openShortcut);

  const script = `
$ws = New-Object -ComObject WScript.Shell
$null = $ws.AppActivate('${windowTitle}')
Start-Sleep -Milliseconds ${delayMs}
$ws.SendKeys('${openShortcut}')
Start-Sleep -Milliseconds ${delayMs}
$ws.SendKeys('${login}')
$ws.SendKeys('{TAB}')
$ws.SendKeys('${password}')
$ws.SendKeys('{TAB}')
$ws.SendKeys('${server}')
$ws.SendKeys('{TAB}')
$ws.SendKeys('{ENTER}')
`;

  return await systemExec(
    {
      command: "powershell",
      args: ["-NoProfile", "-Command", script]
    },
    policy
  );
}
