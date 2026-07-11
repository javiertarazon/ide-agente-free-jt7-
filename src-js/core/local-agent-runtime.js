'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const SAFE_COMMANDS = Object.freeze([
  {
    label: 'git status --short',
    command: 'git',
    args: ['status', '--short'],
  },
  {
    label: 'node --version',
    command: process.execPath,
    args: ['--version'],
  },
]);

const DEFAULT_MAX_READ_BYTES = 128 * 1024;
const DEFAULT_MAX_WRITE_BYTES = 256 * 1024;
const SAFE_VERIFY_COMMANDS = new Set(['git', 'node', 'npm']);
const SYSTEM_PACKAGES = Object.freeze({
  git: Object.freeze({
    binary: 'git',
    versionArgs: ['--version'],
    installers: Object.freeze({
      apt: { command: 'apt-get', args: ['install', '-y', 'git'] },
      dnf: { command: 'dnf', args: ['install', '-y', 'git'] },
      yum: { command: 'yum', args: ['install', '-y', 'git'] },
      pacman: { command: 'pacman', args: ['-S', '--noconfirm', 'git'] },
      apk: { command: 'apk', args: ['add', 'git'] },
      brew: { command: 'brew', args: ['install', 'git'] },
    }),
  }),
});

const COMMON_EXECUTABLE_DIRS = Object.freeze([
  '/usr/local/bin',
  '/usr/bin',
  '/bin',
  '/usr/sbin',
  '/sbin',
]);

function truncate(text, max = 4000) {
  const value = String(text || '');
  return value.length > max ? `${value.slice(0, max)}\n...<truncated>` : value;
}

function extractFocusedText(goal) {
  const focused = extractFocusedGoal(goal);
  return focused || summarizeGoal(goal);
}

function canResolveLocalGoal(goal) {
  const focused = String(extractFocusedText(goal) || '').toLowerCase();
  if (!focused) {
    return false;
  }
  if (/\b(funciona|hola|gracias|continua|continuar)\b/.test(focused) && focused.split(/\s+/).length <= 4) {
    return false;
  }
  if (/\bporque\b.*\bagente\b|\bpor que\b.*\bagente\b|\bno estas usando el agente\b/.test(focused)) {
    return false;
  }
  return /package\.json|readme|\.md\b|\.json\b|\.js\b|\.ts\b|\barchivo\b|\bruta\b|\bpath\b|\bworkspace\b|\brepositorio\b|\brepo\b|\bproyecto\b|\bbuild\b|\bbundle\b|\bcompil|\btest\b|\bprueba\b|\bverifica|\bverificaci|\blint\b|\binstala\b|\binstall\b|\bgit\b|\blee\b|\bread\b|\bescribe\b|\bwrite\b|\bedita\b|\bedit\b|\bparche\b|\bpatch\b|\bdiff\b|\blog\b|\bstatus\b|\bdoctor\b|\bdiagnost|\bcarpeta\b|\bdirectorio\b|\bmkdir\b|\bcrear\b|\bcrea\b|\blista\b|\bls\b|\binspecciona\b|\brevisa\b/i.test(focused);
}

function normalizeRelativePath(filePath) {
  return String(filePath || '').replace(/\\/g, '/').replace(/^\/+/, '').trim();
}

function resolveWorkspacePath(workspacePath, filePath) {
  const root = path.resolve(workspacePath || process.cwd());
  const relative = normalizeRelativePath(filePath);
  if (!relative || relative.includes('\0')) {
    throw new Error('Ruta de workspace invalida.');
  }
  const resolved = path.resolve(root, relative);
  const rootWithSep = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (resolved !== root && !resolved.startsWith(rootWithSep)) {
    throw new Error(`Ruta fuera del workspace bloqueada: ${filePath}`);
  }
  return { root, relative, resolved };
}

function getActionList(options = {}) {
  if (Array.isArray(options.actions)) {
    return options.actions.filter(Boolean);
  }

  const actions = [];
  for (const filePath of Array.isArray(options.readFiles) ? options.readFiles : []) {
    actions.push({ type: 'read', path: filePath });
  }
  for (const item of Array.isArray(options.writeFiles) ? options.writeFiles : []) {
    if (item && typeof item === 'object') {
      actions.push({ type: 'write', path: item.path, content: item.content });
    }
  }
  for (const item of Array.isArray(options.verificationCommands) ? options.verificationCommands : []) {
    actions.push({ type: 'verify', ...(typeof item === 'string' ? { command: item } : item) });
  }
  return actions;
}

function isSafeVerifySpec(spec = {}) {
  const command = String(spec.command || '').trim();
  const args = Array.isArray(spec.args) ? spec.args.map((item) => String(item)) : [];
  const base = path.basename(command).replace(/\.cmd$/i, '').replace(/\.exe$/i, '');
  if (!SAFE_VERIFY_COMMANDS.has(base) && command !== process.execPath) {
    return { ok: false, reason: `Comando no permitido para verificacion local: ${command || '(vacio)'}` };
  }
  if (base === 'node' || command === process.execPath) {
    if (args.some((arg) => ['-e', '--eval', '-p', '--print'].includes(arg))) {
      return { ok: false, reason: 'Node eval/print bloqueado en verificacion local.' };
    }
  }
  if (base === 'npm') {
    const first = args[0] || '';
    if (!['test', 'run', '--version', '-v'].includes(first)) {
      return { ok: false, reason: 'npm solo permite test/run/version en verificacion local.' };
    }
    if (first === 'run' && !args[1]) {
      return { ok: false, reason: 'npm run requiere nombre de script.' };
    }
  }
  if (base === 'git') {
    const first = args[0] || '';
    if (!['status', 'diff', 'rev-parse'].includes(first)) {
      return { ok: false, reason: 'git solo permite status/diff/rev-parse en verificacion local.' };
    }
  }
  return { ok: true, command, args };
}

function runVerificationCommand(spec, cwd) {
  const normalized = typeof spec === 'string' ? { command: spec, args: [] } : (spec || {});
  const safety = isSafeVerifySpec(normalized);
  if (!safety.ok) {
    return {
      command: String(normalized.command || '').trim(),
      exitCode: 1,
      blocked: true,
      output: safety.reason,
    };
  }
  return runSafeCommand({
    label: [safety.command, ...safety.args].filter(Boolean).join(' '),
    command: safety.command === 'node' ? process.execPath : safety.command,
    args: safety.command === 'node' ? safety.args : safety.args,
  }, cwd);
}

function readWorkspaceFile(workspacePath, action = {}) {
  const { relative, resolved } = resolveWorkspacePath(workspacePath, action.path || action.filePath);
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) {
    throw new Error(`No es archivo legible: ${relative}`);
  }
  const maxBytes = Math.max(1, Number(action.maxBytes || DEFAULT_MAX_READ_BYTES));
  const fd = fs.openSync(resolved, 'r');
  try {
    const size = Math.min(stat.size, maxBytes);
    const buffer = Buffer.alloc(size);
    fs.readSync(fd, buffer, 0, size, 0);
    return {
      path: relative,
      bytes: stat.size,
      truncated: stat.size > maxBytes,
      content: buffer.toString('utf8'),
    };
  } finally {
    fs.closeSync(fd);
  }
}

function writeWorkspaceFile(workspacePath, action = {}) {
  const { relative, resolved } = resolveWorkspacePath(workspacePath, action.path || action.filePath);
  const content = String(action.content ?? '');
  const maxBytes = Math.max(1, Number(action.maxBytes || DEFAULT_MAX_WRITE_BYTES));
  if (Buffer.byteLength(content, 'utf8') > maxBytes) {
    throw new Error(`Escritura bloqueada por tamano maximo: ${relative}`);
  }
  const exists = fs.existsSync(resolved);
  const previous = exists ? fs.readFileSync(resolved, 'utf8') : null;
  if (exists && action.overwrite === false) {
    throw new Error(`Escritura bloqueada porque el archivo existe: ${relative}`);
  }
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, content, 'utf8');
  const readback = fs.readFileSync(resolved, 'utf8');
  if (readback !== content) {
    if (previous !== null) {
      fs.writeFileSync(resolved, previous, 'utf8');
    }
    throw new Error(`Readback de escritura fallo: ${relative}`);
  }
  return {
    path: relative,
    bytes: Buffer.byteLength(content, 'utf8'),
    created: !exists,
    verified: true,
  };
}

function resolveFlexiblePath(workspacePath, targetPath, options = {}) {
  const raw = String(targetPath || '').trim();
  if (!raw || raw.includes('\0')) {
    throw new Error('Ruta invalida.');
  }
  if (path.isAbsolute(raw)) {
    const resolved = path.resolve(raw);
    if (!options.allowAbsolute) {
      throw new Error(`Ruta absoluta bloqueada: ${raw}`);
    }
    return {
      root: '',
      relative: raw,
      resolved,
      absolute: true,
    };
  }
  return {
    ...resolveWorkspacePath(workspacePath, raw),
    absolute: false,
  };
}

function createDirectory(workspacePath, action = {}) {
  const target = resolveFlexiblePath(workspacePath, action.path || action.dirPath, {
    allowAbsolute: action.allowAbsolute !== false,
  });
  const existed = fs.existsSync(target.resolved);
  if (existed && !fs.statSync(target.resolved).isDirectory()) {
    throw new Error(`La ruta existe pero no es un directorio: ${target.relative}`);
  }
  fs.mkdirSync(target.resolved, { recursive: true });
  const stat = fs.statSync(target.resolved);
  if (!stat.isDirectory()) {
    throw new Error(`No se pudo verificar el directorio creado: ${target.relative}`);
  }
  return {
    path: target.absolute ? target.resolved : target.relative,
    created: !existed,
    verified: true,
  };
}

function inspectPath(workspacePath, action = {}) {
  const target = resolveFlexiblePath(workspacePath, action.path || action.dirPath || action.filePath, {
    allowAbsolute: action.allowAbsolute !== false,
  });
  const exists = fs.existsSync(target.resolved);
  if (!exists) {
    return {
      path: target.absolute ? target.resolved : target.relative,
      exists: false,
      kind: 'missing',
      entries: [],
    };
  }
  const stat = fs.statSync(target.resolved);
  if (stat.isDirectory()) {
    const entries = fs.readdirSync(target.resolved, { withFileTypes: true })
      .slice(0, 20)
      .map((entry) => `${entry.isDirectory() ? 'dir' : entry.isFile() ? 'file' : 'other'}:${entry.name}`);
    return {
      path: target.absolute ? target.resolved : target.relative,
      exists: true,
      kind: 'dir',
      entries,
    };
  }
  return {
    path: target.absolute ? target.resolved : target.relative,
    exists: true,
    kind: 'file',
    entries: [],
  };
}

function executeLocalActions(workspacePath, options = {}) {
  const actions = getActionList(options);
  const reads = [];
  const writes = [];
  const dirActions = [];
  const inspections = [];
  const verificationResults = [];
  const systemActions = [];
  const failures = [];

  for (const action of actions) {
    const type = String(action.type || action.kind || '').trim().toLowerCase();
    try {
      if (type === 'read' || type === 'readfile') {
        reads.push(readWorkspaceFile(workspacePath, action));
        continue;
      }
      if (type === 'write' || type === 'writefile') {
        writes.push(writeWorkspaceFile(workspacePath, action));
        continue;
      }
      if (type === 'mkdir' || type === 'create_dir' || type === 'create_directory') {
        dirActions.push(createDirectory(workspacePath, action));
        continue;
      }
      if (type === 'inspect_path' || type === 'list_path' || type === 'stat_path') {
        inspections.push(inspectPath(workspacePath, action));
        continue;
      }
      if (type === 'verify' || type === 'verification' || type === 'command') {
        verificationResults.push(runVerificationCommand(action, workspacePath));
        continue;
      }
      if (type === 'system_install' || type === 'install_package') {
        systemActions.push(installSystemPackage(workspacePath, action));
        continue;
      }
      if (type) {
        failures.push({ type, error: `Accion local no soportada: ${type}` });
      }
    } catch (error) {
      failures.push({
        type: type || 'unknown',
        path: String(action.path || action.filePath || ''),
        error: String(error && error.message ? error.message : error),
      });
    }
  }

  return { reads, writes, dirActions, inspections, verificationResults, systemActions, failures };
}

function listWorkspace(workspacePath, maxEntries = 80) {
  const root = path.resolve(workspacePath || process.cwd());
  const entries = fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => !['.git', 'node_modules', 'dist'].includes(entry.name))
    .slice(0, maxEntries)
    .map((entry) => ({
      name: entry.name,
      kind: entry.isDirectory() ? 'dir' : entry.isFile() ? 'file' : 'other',
    }));
  return {
    root,
    entries,
    files: entries.filter((entry) => entry.kind === 'file').length,
    dirs: entries.filter((entry) => entry.kind === 'dir').length,
  };
}

function readPackageSummary(workspacePath) {
  const packagePath = path.join(path.resolve(workspacePath || process.cwd()), 'package.json');
  if (!fs.existsSync(packagePath)) {
    return null;
  }
  try {
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    return {
      name: pkg.name || '',
      version: pkg.version || '',
      scripts: Object.keys(pkg.scripts || {}).sort(),
    };
  } catch (error) {
    return { error: String(error && error.message ? error.message : error) };
  }
}

function runSafeCommand(spec, cwd) {
  try {
    const result = spawnSync(spec.command, spec.args, {
      cwd,
      encoding: 'utf8',
      timeout: 15000,
      windowsHide: true,
    });
    return {
      command: spec.label,
      exitCode: typeof result.status === 'number' ? result.status : 1,
      output: truncate(`${result.stdout || ''}${result.stderr || ''}`.trim(), 2000),
    };
  } catch (error) {
    return {
      command: spec.label,
      exitCode: 1,
      output: String(error && error.message ? error.message : error),
    };
  }
}

function findExecutable(command, cwd) {
  const lookup = spawnSync(process.platform === 'win32' ? 'where' : 'which', [command], {
    cwd,
    encoding: 'utf8',
    timeout: 5000,
    windowsHide: true,
  });
  let resolvedPath = String(lookup.stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) || '';
  if (!resolvedPath && process.platform !== 'win32') {
    const home = process.env.HOME || '';
    const candidates = [
      path.join(home, '.local', 'bin', command),
      path.join(home, '.local', 'nodejs', 'current', 'bin', command),
      ...COMMON_EXECUTABLE_DIRS.map((dir) => path.join(dir, command)),
    ];
    resolvedPath = candidates.find((candidate) => {
      try {
        return Boolean(candidate) && fs.existsSync(candidate) && fs.statSync(candidate).isFile();
      } catch (_) {
        return false;
      }
    }) || '';
  }
  if (!resolvedPath && process.platform !== 'win32') {
    const shellLookup = spawnSync('bash', ['-lc', `command -v ${command}`], {
      cwd,
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true,
    });
    resolvedPath = String(shellLookup.stdout || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) || '';
  }
  return {
    ok: Boolean(resolvedPath),
    path: resolvedPath,
    output: truncate(`${lookup.stdout || ''}${lookup.stderr || ''}`.trim(), 1000),
  };
}

function findAvailablePackageManager(cwd) {
  const managers = [
    { key: 'apt', command: 'apt-get' },
    { key: 'dnf', command: 'dnf' },
    { key: 'yum', command: 'yum' },
    { key: 'pacman', command: 'pacman' },
    { key: 'apk', command: 'apk' },
    { key: 'brew', command: 'brew' },
  ];
  for (const manager of managers) {
    if (findExecutable(manager.command, cwd).ok) {
      return manager.key;
    }
  }
  return '';
}

function runSystemInstallCommand(installer, cwd) {
  const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;
  let command = installer.command;
  let args = installer.args.slice();

  if (!isRoot && command !== 'brew') {
    if (!findExecutable('sudo', cwd).ok) {
      return {
        command: [command, ...args].join(' '),
        exitCode: 1,
        blocked: true,
        output: 'Instalacion bloqueada: se requieren privilegios de administrador y sudo no esta disponible.',
      };
    }
    command = 'sudo';
    args = ['-n', installer.command, ...installer.args];
  }

  return runSafeCommand({
    label: [command, ...args].join(' '),
    command,
    args,
  }, cwd);
}

function installSystemPackage(workspacePath, action = {}) {
  const cwd = path.resolve(workspacePath || process.cwd());
  const packageName = String(action.package || action.name || '').trim().toLowerCase();
  const spec = SYSTEM_PACKAGES[packageName];

  if (!spec) {
    return {
      package: packageName || '(vacio)',
      status: 'blocked',
      changed: false,
      output: `Paquete no soportado por el runtime local: ${packageName || '(vacio)'}`,
    };
  }

  const before = findExecutable(spec.binary, cwd);
  if (before.ok) {
    const version = runSafeCommand({
      label: `${before.path || spec.binary} ${spec.versionArgs.join(' ')}`,
      command: before.path || spec.binary,
      args: spec.versionArgs,
    }, cwd);
    return {
      package: packageName,
      status: 'already_installed',
      changed: false,
      binaryPath: before.path,
      command: version.command,
      exitCode: version.exitCode,
      output: version.output || before.output,
    };
  }

  const managerKey = findAvailablePackageManager(cwd);
  const installer = managerKey ? spec.installers[managerKey] : null;
  if (!installer) {
    return {
      package: packageName,
      status: 'blocked',
      changed: false,
      output: 'Instalacion bloqueada: no se encontro un gestor de paquetes soportado.',
    };
  }

  const installResult = runSystemInstallCommand(installer, cwd);
  const after = findExecutable(spec.binary, cwd);
  const version = after.ok
    ? runSafeCommand({
      label: `${after.path || spec.binary} ${spec.versionArgs.join(' ')}`,
      command: after.path || spec.binary,
      args: spec.versionArgs,
    }, cwd)
    : null;

  return {
    package: packageName,
    status: after.ok ? 'installed' : (installResult.blocked ? 'blocked' : 'failed'),
    changed: after.ok,
    manager: managerKey || 'unknown',
    binaryPath: after.path,
    command: installResult.command,
    exitCode: installResult.exitCode,
    blocked: Boolean(installResult.blocked),
    output: version?.output || installResult.output,
  };
}

function summarizeGoal(goal) {
  return String(goal || '').replace(/\s+/g, ' ').trim();
}

function extractFocusedGoal(goal) {
  const raw = String(goal || '');
  const currentRequestMatches = Array.from(raw.matchAll(/Solicitud actual:\s*([^\r\n]+)/gi));
  const latestCurrentRequest = currentRequestMatches.length
    ? currentRequestMatches[currentRequestMatches.length - 1][1]
    : '';
  if (latestCurrentRequest) {
    return summarizeGoal(latestCurrentRequest);
  }

  const objectiveMatches = Array.from(raw.matchAll(/Objetivo solicitado:\s*([^\r\n]+)/gi));
  const latestObjective = objectiveMatches.length
    ? objectiveMatches[objectiveMatches.length - 1][1]
    : '';
  if (latestObjective) {
    return summarizeGoal(latestObjective);
  }

  const compact = summarizeGoal(raw);
  if (!compact) {
    return '';
  }
  if (compact.length > 320) {
    return `${compact.slice(0, 320)}...`;
  }
  return compact;
}

function parseReferencedPaths(goal) {
  const matches = String(goal || '').match(/(?:[A-Za-z0-9_./-]+\.[A-Za-z0-9_-]+)/g) || [];
  return Array.from(new Set(matches.map((item) => normalizeRelativePath(item)).filter(Boolean)));
}

function parseAbsolutePathCandidates(goal) {
  const source = String(goal || '');
  const matches = source.match(/\/[^\n"`]+/g) || [];
  return Array.from(new Set(matches
    .map((item) => item.replace(/[),.;:!?]+$/g, '').trim())
    .filter((item) => item.startsWith('/'))));
}

function parseCreateDirectoryIntent(goal) {
  const source = String(goal || '');
  const patterns = [
    /directorio siguiente:\s*(\/[^\n]+?)\s*el nombre de la car\w*ta\s+sera\s+([^\n]+)/i,
    /directorio siguiente:\s*(\/[^\n]+?)\s*el nombre de la car\w*ta\s+será\s+([^\n]+)/i,
    /(?:crea|crear|cree|crees|quecrees|mkdir)\s+(?:una\s+)?(?:carpeta|directorio).+?(?:en|dentro de)\s*(\/[^\n]+?)\s*(?:con nombre|llamada|que se llame|nombrada)\s+([^\n]+)/i,
  ];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (!match) continue;
    const parent = String(match[1] || '').trim().replace(/[),.;:!?]+$/g, '');
    const name = String(match[2] || '').trim().replace(/^[`"' ]+|[`"',.;:!? ]+$/g, '');
    if (path.isAbsolute(parent) && name) {
      return path.join(parent, name);
    }
  }
  const directTarget = source.match(/crea(?:r)?\s+(?:una\s+)?(?:carpeta|directorio)\s+(\/[^\n]+)/i);
  if (directTarget) {
    return String(directTarget[1] || '').trim().replace(/[),.;:!?]+$/g, '');
  }
  return '';
}

function hasCreateDirectoryIntent(goal) {
  const source = String(goal || '');
  return /\b(crea|crear|cree|crees|quecrees|mkdir)\b/.test(source)
    && /\b(carpeta|directorio)\b/.test(source);
}

function isIncompleteCreateDirectoryIntent(goal) {
  const focusedGoal = extractFocusedText(goal);
  if (!hasCreateDirectoryIntent(focusedGoal)) {
    return false;
  }
  return !parseCreateDirectoryIntent(focusedGoal);
}

function fileExistsInWorkspace(workspacePath, relativePath) {
  try {
    const { resolved } = resolveWorkspacePath(workspacePath, relativePath);
    return fs.existsSync(resolved) && fs.statSync(resolved).isFile();
  } catch {
    return false;
  }
}

function addHeuristicVerify(actions, addedCommands, command, args) {
  const key = [command, ...(args || [])].join(' ');
  if (addedCommands.has(key)) {
    return;
  }
  addedCommands.add(key);
  actions.push({ type: 'verify', command, args });
}

function inferHeuristicActions(workspacePath, goal, packageSummary, options = {}) {
  if (getActionList(options).length > 0) {
    return [];
  }

  const focusedGoal = extractFocusedText(goal);
  const normalizedGoal = String(focusedGoal || '').toLowerCase();
  const actions = [];
  const addedReads = new Set();
  const addedCommands = new Set();
  const referencedPaths = parseReferencedPaths(focusedGoal);
  for (const relativePath of referencedPaths) {
    if (!addedReads.has(relativePath) && fileExistsInWorkspace(workspacePath, relativePath)) {
      addedReads.add(relativePath);
      actions.push({ type: 'read', path: relativePath });
    }
  }

  if (normalizedGoal.includes('package.json') && fileExistsInWorkspace(workspacePath, 'package.json') && !addedReads.has('package.json')) {
    addedReads.add('package.json');
    actions.push({ type: 'read', path: 'package.json' });
  }
  if ((normalizedGoal.includes('readme') || normalizedGoal.includes('README')) && fileExistsInWorkspace(workspacePath, 'README.md') && !addedReads.has('README.md')) {
    addedReads.add('README.md');
    actions.push({ type: 'read', path: 'README.md' });
  }

  const scripts = Array.isArray(packageSummary?.scripts) ? packageSummary.scripts : [];
  const wantsValidation = /(test|tests|smoke|prueba|pruebas|valid|verif|check|comprob)/.test(normalizedGoal);
  const wantsBuild = /(build|bundle|compil|empaquet)/.test(normalizedGoal);
  const wantsLint = /lint/.test(normalizedGoal);
  const wantsGitInstall = /\b(instala|instalar|install|instale|setup)\b/.test(normalizedGoal) && /\bgit\b/.test(normalizedGoal);
  const wantsDirectoryInspect = /\b(revisa|revise|inspecciona|inspeccione|lista|ls|verifica|verifique)\b/.test(normalizedGoal) && /\b(carpeta|directorio|ruta)\b/.test(normalizedGoal);

  const requestedDirectory = parseCreateDirectoryIntent(focusedGoal);
  if (requestedDirectory) {
    actions.push({ type: 'mkdir', path: requestedDirectory, allowAbsolute: true });
  }

  const absolutePaths = parseAbsolutePathCandidates(focusedGoal);
  if (wantsDirectoryInspect && absolutePaths.length > 0) {
    for (const candidate of absolutePaths.slice(0, 3)) {
      actions.push({ type: 'inspect_path', path: candidate, allowAbsolute: true });
    }
  }

  if (wantsGitInstall) {
    actions.push({ type: 'system_install', package: 'git' });
  }

  if (wantsValidation) {
    if (scripts.includes('test')) {
      addHeuristicVerify(actions, addedCommands, 'npm', ['test']);
    } else if (scripts.includes('smoke')) {
      addHeuristicVerify(actions, addedCommands, 'npm', ['run', 'smoke']);
    }
  }
  if (wantsBuild) {
    if (scripts.includes('build:bundle')) {
      addHeuristicVerify(actions, addedCommands, 'npm', ['run', 'build:bundle']);
    } else if (scripts.includes('build')) {
      addHeuristicVerify(actions, addedCommands, 'npm', ['run', 'build']);
    }
  }
  if (wantsLint && scripts.includes('lint')) {
    addHeuristicVerify(actions, addedCommands, 'npm', ['run', 'lint']);
  }

  return actions;
}

function deriveLocalActions(goal, options = {}) {
  const workspacePath = path.resolve(options.workspacePath || process.cwd());
  const packageSummary = readPackageSummary(workspacePath);
  return inferHeuristicActions(workspacePath, goal, packageSummary, {
    ...options,
    actions: [],
    readFiles: [],
    writeFiles: [],
    verificationCommands: [],
  });
}

function summarizeReadResult(read) {
  const firstLine = String(read.content || '').split(/\r?\n/).map((line) => line.trim()).find(Boolean) || 'sin contenido visible';
  return `${read.path}: ${truncate(firstLine, 160)}`;
}

function summarizeVerifyResult(result) {
  const headline = String(result.output || '').split(/\r?\n/).map((line) => line.trim()).find(Boolean) || 'sin salida';
  return `${result.command} (exit=${result.exitCode}): ${truncate(headline, 160)}`;
}

function summarizeSystemAction(result) {
  const headline = String(result.output || '').split(/\r?\n/).map((line) => line.trim()).find(Boolean) || 'sin salida';
  const binaryInfo = result.binaryPath ? ` (${result.binaryPath})` : '';
  return `${result.package}: ${result.status}${binaryInfo}: ${truncate(headline, 160)}`;
}

function summarizeCapabilityDispatch(capabilityPlan = null) {
  if (!capabilityPlan || typeof capabilityPlan !== 'object') {
    return '';
  }
  const dispatch = capabilityPlan.dispatch && typeof capabilityPlan.dispatch === 'object'
    ? capabilityPlan.dispatch
    : null;
  if (!dispatch) {
    return '';
  }
  const parts = [
    `owner=${String(dispatch.owner || 'unknown')}`,
    `target=${String(dispatch.dispatchTarget || 'n/a')}`,
    `skills=${Array.isArray(capabilityPlan.selectedSkills) ? capabilityPlan.selectedSkills.length : 0}`,
    `mcp=${Array.isArray(capabilityPlan.mcpServers) ? capabilityPlan.mcpServers.filter((item) => item && item.enabled !== false).length : 0}`,
    `tools=${Array.isArray(capabilityPlan.plannedActions) ? capabilityPlan.plannedActions.length : 0}`,
  ];
  const trace = Array.isArray(dispatch.trace) ? dispatch.trace.slice(0, 6).join(', ') : '';
  return `${parts.join(' | ')}${trace ? ` | trace=${trace}` : ''}`;
}

function summarizeInspection(result) {
  if (!result.exists) {
    return `${result.path}: missing`;
  }
  if (result.kind === 'dir') {
    return `${result.path}: dir (${result.entries.length} entradas visibles)`;
  }
  return `${result.path}: file`;
}

function classifyFallbackReason(fallbackReason) {
  const text = String(fallbackReason || '').trim();
  if (!text) {
    return { kind: 'none', detail: '' };
  }
  if (/\b403\b|status code 403|auth|api key|token expired|incorrect/i.test(text)) {
    return {
      kind: 'auth',
      detail: 'El proveedor activo rechazo la ejecucion del motor agente por autenticacion o permisos del modelo.',
    };
  }
  if (/network connection error|econn|enotfound|timeout|socket hang up/i.test(text)) {
    return {
      kind: 'network',
      detail: 'El motor agente no pudo completar la llamada remota por un fallo de red o timeout.',
    };
  }
  if (/loopback|start the gateway|gateway|1006|bind:/i.test(text)) {
    return {
      kind: 'gateway',
      detail: 'El runtime de OpenClaw no quedo operativo a tiempo y la solicitud degrado a herramientas locales.',
    };
  }
  return {
    kind: 'generic',
    detail: 'El motor agente principal no estuvo disponible y la solicitud paso a la ruta local segura.',
  };
}

function buildGoalAwareSummary(goal, context = {}) {
  const goalText = extractFocusedGoal(goal);
  const lines = [];
  if (goalText) {
    lines.push(`Objetivo solicitado: ${goalText}`);
  }

  if (/(proveedor|provider|modelo|model|runtime|backend)/i.test(goalText)) {
    lines.push(`Contexto de ejecucion local: proveedor ${context.provider || 'local'}, modelo ${context.model || 'freejt7-local-tools'}, runtime local.`);
  }

  if (Array.isArray(context.heuristicActions) && context.heuristicActions.length > 0) {
    const heuristicLabels = context.heuristicActions.map((action) => {
      if (action.type === 'read') {
        return `leer ${action.path}`;
      }
      if (action.type === 'verify') {
        return [action.command, ...(action.args || [])].join(' ');
      }
      return action.type;
    });
    lines.push(`Acciones inferidas desde el objetivo: ${heuristicLabels.join(', ')}.`);
  } else if (isIncompleteCreateDirectoryIntent(goalText)) {
    lines.push('La solicitud pide crear una carpeta, pero no incluye una ruta completa o una ruta base con nombre para ejecutarla localmente.');
  }

  if (Array.isArray(context.reads) && context.reads.length > 0) {
    lines.push(`Archivos inspeccionados: ${context.reads.map((item) => summarizeReadResult(item)).join(' | ')}`);
  }

  if (Array.isArray(context.verificationResults) && context.verificationResults.length > 0) {
    lines.push(`Verificaciones ejecutadas: ${context.verificationResults.map((item) => summarizeVerifyResult(item)).join(' | ')}`);
  }

  if ((!context.reads || context.reads.length === 0) && (!context.verificationResults || context.verificationResults.length === 0)) {
    lines.push('No hubo suficientes senales en el objetivo para inferir una accion local mas profunda; se mantuvo una auditoria basica del workspace.');
  }

  return lines;
}

function buildConversationalSummary(goal, context = {}) {
  const goalText = extractFocusedGoal(goal);
  const provider = String(context.provider || 'local').trim() || 'local';
  const model = String(context.model || 'freejt7-local-tools').trim() || 'freejt7-local-tools';
  const fallbackReason = String(context.fallbackReason || '').trim();
  const packageSummary = context.packageSummary || null;
  const workspace = context.workspace || {};
  const reads = Array.isArray(context.reads) ? context.reads : [];
  const writes = Array.isArray(context.writes) ? context.writes : [];
  const dirActions = Array.isArray(context.dirActions) ? context.dirActions : [];
  const inspections = Array.isArray(context.inspections) ? context.inspections : [];
  const failures = Array.isArray(context.failures) ? context.failures : [];
  const verificationResults = Array.isArray(context.verificationResults) ? context.verificationResults : [];
  const systemActions = Array.isArray(context.systemActions) ? context.systemActions : [];
  const heuristicActions = Array.isArray(context.heuristicActions) ? context.heuristicActions : [];
  const paragraphs = [];
  const fallbackInfo = classifyFallbackReason(fallbackReason);

  if (!dirActions.length && !inspections.length && !writes.length && !systemActions.length && !failures.length && isIncompleteCreateDirectoryIntent(goalText)) {
    return [
      'Necesito la ruta completa de la carpeta, o una ruta base y el nombre, para poder crearla.',
      'Ejemplo: `crea la carpeta /ruta/proyecto/tmp` o `crea una carpeta en /ruta/proyecto con nombre prueba 3`.',
    ].join('\n\n');
  }

  if (dirActions.length > 0 && failures.length === 0) {
    const created = dirActions[0];
    const actionLine = created.created
      ? `La carpeta \`${created.path}\` fue creada y verificada.`
      : `La carpeta \`${created.path}\` ya existia y verifique que sigue disponible.`;
    const notes = [actionLine];
    if (fallbackReason) {
      notes.push('La ejecucion salio por herramientas locales porque el motor agente no estuvo disponible.');
    }
    return notes.join('\n\n');
  }

  if (inspections.length > 0 && failures.length === 0) {
    const inspection = inspections[0];
    if (!inspection.exists) {
      return `Revise \`${inspection.path}\` y esa ruta no existe en este momento.`;
    }
    if (inspection.kind === 'dir') {
      const entries = inspection.entries.slice(0, 8).join(', ');
      return entries
        ? `Revise \`${inspection.path}\`. Existe y contiene: ${entries}.`
        : `Revise \`${inspection.path}\`. Existe, pero no tiene entradas visibles en el limite inspeccionado.`;
    }
    return `Revise \`${inspection.path}\`. La ruta existe y corresponde a un archivo.`;
  }

  if (systemActions.length > 0 && failures.length === 0) {
    const systemAction = systemActions[0];
    if (systemAction.status === 'already_installed') {
      const notes = [`${systemAction.package} ya estaba instalado${systemAction.binaryPath ? ` en \`${systemAction.binaryPath}\`` : ''}. No ejecute una instalacion redundante.`];
      if (fallbackReason) {
        notes.push('La ejecucion salio por herramientas locales porque el motor agente no estuvo disponible.');
      }
      return notes.join('\n\n');
    }
    if (systemAction.status === 'installed') {
      return `Instale ${systemAction.package} y verifique que quedo disponible.`;
    }
    if (systemAction.status === 'blocked' || systemAction.blocked) {
      if (/sudo|contraseñ|contrasena|password/i.test(String(systemAction.output || ''))) {
        return `No pude completar la instalacion de ${systemAction.package} porque el host exigio una contraseña sudo interactiva.`;
      }
      return `No pude completar la instalacion de ${systemAction.package}. El bloqueo vino del host o del gestor de paquetes.`;
    }
  }

  const intro = fallbackReason
    ? `Free JT7 respondio con la ruta local de herramientas porque el motor principal no estuvo disponible: ${fallbackReason}.`
    : 'Free JT7 respondio con la ruta local de herramientas.';
  paragraphs.push(intro);

  if (goalText) {
    paragraphs.push(`Solicitud atendida: ${goalText}`);
  }

  if (fallbackInfo.detail && /(por que|porque).*\bagente\b|\bno estas usando el agente\b/i.test(goalText)) {
    paragraphs.push(`Motivo operativo: ${fallbackInfo.detail}`);
  }

  if (/(proveedor|provider|modelo|model|runtime|backend)/i.test(goalText)) {
    paragraphs.push(`Ruta activa visible: proveedor ${provider}, modelo ${model}, backend local.`);
  }

  const evidence = [];
  if (packageSummary && !packageSummary.error) {
    const scriptCount = Array.isArray(packageSummary.scripts) ? packageSummary.scripts.length : 0;
    evidence.push(`proyecto npm ${packageSummary.name || 'sin nombre'} ${packageSummary.version || ''}`.trim());
    if (scriptCount) {
      evidence.push(`${scriptCount} scripts disponibles`);
    }
  }
  if (workspace.root) {
    evidence.push(`${Number(workspace.dirs || 0)} directorios y ${Number(workspace.files || 0)} archivos directos visibles`);
  }
  if (reads.length) {
    evidence.push(`lecturas: ${reads.map((item) => item.path).slice(0, 4).join(', ')}`);
  }
  if (writes.length) {
    evidence.push(`escrituras verificadas: ${writes.map((item) => item.path).slice(0, 4).join(', ')}`);
  }
  if (dirActions.length) {
    evidence.push(`directorios: ${dirActions.map((item) => item.path).slice(0, 4).join(', ')}`);
  }
  if (inspections.length) {
    evidence.push(`rutas inspeccionadas: ${inspections.map((item) => summarizeInspection(item)).slice(0, 3).join('; ')}`);
  }
  if (verificationResults.length) {
    const okCount = verificationResults.filter((item) => Number(item.exitCode) === 0).length;
    evidence.push(`verificaciones: ${okCount}/${verificationResults.length} OK`);
  }
  if (systemActions.length) {
    evidence.push(`sistema: ${systemActions.map((item) => summarizeSystemAction(item)).join('; ')}`);
  }
  if (evidence.length) {
    paragraphs.push(`Evidencia breve: ${evidence.join('; ')}.`);
  }

  if (failures.length) {
    paragraphs.push(`Atencion: ${failures.length} accion local fue bloqueada o fallo. Revisa el inspector de tareas para el detalle tecnico.`);
  }

  const hasResolvedSystemAction = systemActions.some((item) => item.status === 'already_installed' || item.status === 'installed');

  if (systemActions.some((item) => item.status === 'already_installed')) {
    const packages = systemActions
      .filter((item) => item.status === 'already_installed')
      .map((item) => item.package)
      .join(', ');
    paragraphs.push(`Resultado: ${packages} ya estaba instalado. No ejecute una instalacion redundante.`);
  } else if (systemActions.some((item) => item.status === 'installed')) {
    const packages = systemActions
      .filter((item) => item.status === 'installed')
      .map((item) => item.package)
      .join(', ');
    paragraphs.push(`Resultado: instalacion completada para ${packages}.`);
  } else if (systemActions.some((item) => item.status === 'blocked' || item.blocked)) {
    const sudoBlocked = systemActions.some((item) => /sudo|contraseñ|contrasena|password/i.test(String(item.output || '')));
    if (sudoBlocked) {
      paragraphs.push('Resultado: no pude completar la instalacion de sistema porque el host exigio una contraseña sudo interactiva.');
    } else {
      paragraphs.push('Resultado: la instalacion de sistema fue bloqueada por privilegios o gestor no disponible. El inspector contiene el motivo exacto.');
    }
  }

  if (hasResolvedSystemAction && /\bgit\b/i.test(goalText)) {
    paragraphs.push('Siguiente paso ejecutable: ya puedes usar `git --version` o continuar con la operacion Git que necesitabas.');
  } else if (systemActions.some((item) => item.status === 'blocked' || item.blocked) && /\bgit\b/i.test(goalText)) {
    paragraphs.push('Siguiente paso ejecutable: abre una terminal del sistema con privilegios y ejecuta la instalacion, o corrige el PATH del host si Git ya existe fuera del entorno de la extension.');
  } else if (heuristicActions.length) {
    const labels = heuristicActions.map((action) => {
      if (action.type === 'read') return `leer ${action.path}`;
      if (action.type === 'verify') return [action.command, ...(action.args || [])].join(' ');
      return String(action.type || 'accion');
    });
    paragraphs.push(`Siguiente paso ejecutable inferido: ${labels.slice(0, 4).join(', ')}.`);
  } else if (/(proveedor|provider|modelo|model|runtime|backend)/i.test(goalText)) {
    paragraphs.push('Siguiente paso ejecutable: cambia proveedor/modelo desde el inspector lateral o ejecuta una prueba de proveedor para confirmar disponibilidad real.');
  } else if (!reads.length && !writes.length && verificationResults.length <= SAFE_COMMANDS.length) {
    paragraphs.push('Siguiente paso ejecutable: concreta el archivo, prueba o cambio esperado para que el agente pueda pasar de auditoria basica a accion verificable.');
  }

  return paragraphs.filter(Boolean).join('\n\n');
}

async function runLocalAgentTask(goal, options = {}) {
  const workspacePath = path.resolve(options.workspacePath || process.cwd());
  const provider = String(options.provider || 'local').trim() || 'local';
  const model = String(options.model || 'freejt7-local-tools').trim() || 'freejt7-local-tools';
  const technicalSummaryLines = [];
  const verification = [];
  const toolResults = [];
  const workspace = listWorkspace(workspacePath);
  const packageSummary = readPackageSummary(workspacePath);
  const heuristicActions = inferHeuristicActions(workspacePath, goal, packageSummary, options);
  const actionResults = executeLocalActions(workspacePath, {
    ...options,
    actions: [...getActionList(options), ...heuristicActions],
  });
  for (const spec of SAFE_COMMANDS) {
    toolResults.push(runSafeCommand(spec, workspacePath));
  }

  technicalSummaryLines.push('Free JT7 ejecuto una ruta local de agente con herramientas basicas, sin depender de Copilot ni OpenClaw.');
  if (options.fallbackReason) {
    technicalSummaryLines.push(`Motivo del fallback local: ${String(options.fallbackReason).trim()}`);
  }
  const capabilityDispatchSummary = summarizeCapabilityDispatch(options.capabilityPlan || null);
  if (capabilityDispatchSummary) {
    technicalSummaryLines.push(`Dispatch nativo del runtime: ${capabilityDispatchSummary}`);
  }
  technicalSummaryLines.push(`Workspace: ${workspace.root}`);
  technicalSummaryLines.push(`Contenido directo visible: ${workspace.dirs} directorios y ${workspace.files} archivos.`);
  if (packageSummary && !packageSummary.error) {
    technicalSummaryLines.push(`Proyecto npm: ${packageSummary.name || 'sin nombre'} ${packageSummary.version || ''}`.trim());
    if (packageSummary.scripts.length) {
      technicalSummaryLines.push(`Scripts detectados: ${packageSummary.scripts.slice(0, 12).join(', ')}`);
    }
  }
  if (actionResults.reads.length) {
    technicalSummaryLines.push(`Lecturas workspace-safe: ${actionResults.reads.map((item) => item.path).join(', ')}.`);
  }
  if (actionResults.writes.length) {
    technicalSummaryLines.push(`Escrituras workspace-safe verificadas: ${actionResults.writes.map((item) => item.path).join(', ')}.`);
  }
  if (actionResults.dirActions.length) {
    technicalSummaryLines.push(`Directorios verificados: ${actionResults.dirActions.map((item) => item.path).join(', ')}.`);
  }
  if (actionResults.inspections.length) {
    technicalSummaryLines.push(`Rutas inspeccionadas: ${actionResults.inspections.map((item) => summarizeInspection(item)).join(' | ')}.`);
  }
  if (actionResults.systemActions.length) {
    technicalSummaryLines.push(`Acciones de sistema: ${actionResults.systemActions.map((item) => summarizeSystemAction(item)).join(' | ')}`);
  }
  if (actionResults.failures.length) {
    technicalSummaryLines.push(`Acciones locales bloqueadas/fallidas: ${actionResults.failures.length}.`);
  }
  technicalSummaryLines.push(...buildGoalAwareSummary(goal, {
    provider,
    model,
    heuristicActions,
    reads: actionResults.reads,
    verificationResults: [...toolResults, ...actionResults.verificationResults],
    systemActions: actionResults.systemActions,
  }));
  const visibleSummary = buildConversationalSummary(goal, {
    provider,
    model,
    fallbackReason: options.fallbackReason,
    workspace,
    packageSummary,
    heuristicActions,
    reads: actionResults.reads,
    dirActions: actionResults.dirActions,
    inspections: actionResults.inspections,
    writes: actionResults.writes,
    failures: actionResults.failures,
    verificationResults: [...toolResults, ...actionResults.verificationResults],
    systemActions: actionResults.systemActions,
  });
  const technicalSummary = technicalSummaryLines.join('\n');

  verification.push('LocalAgent: listado de workspace ejecutado.');
  if (capabilityDispatchSummary) {
    verification.push(`LocalAgent: runtime dispatch ${capabilityDispatchSummary}.`);
  }
  for (const read of actionResults.reads) {
    verification.push(`LocalAgent: lectura workspace-safe ${read.path}${read.truncated ? ' (truncada)' : ''}.`);
  }
  for (const write of actionResults.writes) {
    verification.push(`LocalAgent: escritura verificada por readback ${write.path}.`);
  }
  for (const dirAction of actionResults.dirActions) {
    verification.push(`LocalAgent: directorio ${dirAction.path} ${dirAction.created ? 'creado' : 'ya existente'} y verificado.`);
  }
  for (const inspection of actionResults.inspections) {
    verification.push(`LocalAgent: inspeccion ${inspection.path} exists=${inspection.exists} kind=${inspection.kind}.`);
  }
  for (const result of toolResults) {
    verification.push(`LocalAgent: ${result.command} exit=${result.exitCode}.`);
  }
  for (const result of actionResults.verificationResults) {
    verification.push(`LocalAgent: verificacion ${result.command} exit=${result.exitCode}${result.blocked ? ' blocked' : ''}.`);
  }
  for (const result of actionResults.systemActions) {
    verification.push(`LocalAgent: system_install ${result.package} status=${result.status}${result.exitCode !== undefined ? ` exit=${result.exitCode}` : ''}.`);
  }
  for (const failure of actionResults.failures) {
    verification.push(`LocalAgent: accion ${failure.type} fallida/bloqueada ${failure.path || ''}: ${failure.error}`.trim());
  }

  return {
    provider,
    model,
    executionMode: 'agent',
    executionRoute: 'local-agent-tools',
    local: {
      goal: String(goal || ''),
      workspace,
      packageSummary,
      toolResults,
      heuristicActions,
      actions: actionResults,
      technicalSummary,
    },
    run: {
      status: 'completed',
      summary: visibleSummary,
      provider,
      model,
    },
    final: {
      status: 'completed',
      summary: visibleSummary,
      changedFiles: [
        ...actionResults.writes.map((item) => item.path),
        ...actionResults.dirActions.map((item) => item.path),
      ],
      verification,
      residualRisks: [
        'La ruta local ejecuta herramientas deterministas basicas; para edicion compleja sigue siendo necesario un motor agente completo o una fase de implementacion especifica.',
      ],
    },
  };
}

module.exports = {
  runLocalAgentTask,
  canResolveLocalGoal,
  deriveLocalActions,
  resolveWorkspacePath,
  readWorkspaceFile,
  writeWorkspaceFile,
  runVerificationCommand,
};
