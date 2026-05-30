import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PS1 = path.join(__dirname, 'winbridge.ps1');

function run(args) {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PS1, ...args],
      { windowsHide: true, timeout: 8000 },
      (err, stdout) => resolve(stdout || '')
    );
  });
}

// Lista janelas visiveis com titulo: [{ hwnd, title }]
export async function listWindows() {
  const out = await run(['-Action', 'list']);
  try {
    const j = JSON.parse(out);
    const arr = Array.isArray(j) ? j : [j];
    return arr.filter((w) => w && w.title);
  } catch {
    return [];
  }
}

export function focusWindow(hwnd) {
  return run(['-Action', 'focus', '-Hwnd', String(hwnd)]);
}

// Traz de volta a janela do navegador (cockpit 3D) pra frente
export function focusCockpit(match = 'Holo-Screens') {
  return run(['-Action', 'cockpit', '-Match', match]);
}

// Stats do sistema: { cpu, gpu, ramUsed, ramTotal }
export async function getStats() {
  const out = await run(['-Action', 'stats']);
  try { return JSON.parse(out); } catch { return null; }
}
