#!/usr/bin/env node
// One generation call: run a prompt through `codex exec` and the built-in `$imagegen` skill,
// land exactly one PNG in a run directory, and record what it cost.
//
// The route and its constraints are measured, not guessed
// (`.scratch/COOP-001-apartment/research/codex-imagegen.md`, 2026-09-12):
//
//   - `codex exec` loads user config and skills, and runs read-only by default. The generation
//     itself is a model-side tool and works read-only, but Codex's own copy of the PNG out of
//     `$CODEX_HOME/generated_images/<thread>/` is a shell step, so `--sandbox workspace-write`
//     is required or the copy fails with exit 1.
//   - Codex runs that shell step through PowerShell 7, not Git Bash. This wrapper never asks it
//     to run anything but the copy, and it can recover the image itself when the copy did not
//     happen at all.
//   - There is no `--ask-for-approval` flag on `codex exec` in 0.154.0.
//   - The built-in tool exposes no size, format or output-path control, and one image per turn:
//     never `n`, never two assets in one prompt.
//
// Usage:
//
//   node scripts/art/codex-imagegen.mjs \
//     --prompt <file> --out-dir <dir> --run-id <id> \
//     [--ref <image>]... [--name strip-raw.png] [--timeout <ms>] [--codex <path>]
//
// Everything for one attempt lands in `<out-dir>/<run-id>/`: the resolved `prompt.txt`, the
// image, `events.jsonl`, `err.txt`, `last.txt` and `usage.json`.
//
// The prompt file may carry slots, which are substituted before the run and recorded resolved:
// `{{OUTPUT_PATH}}` (absolute path the prompt must tell Codex to copy the PNG to),
// `{{OUTPUT_DIR}}`, `{{RUN_ID}}`, and `{{REF_1}}`..`{{REF_N}}` for the `--ref` paths in order.
// Any `{{...}}` left unresolved is a hard error: a template slot that reaches the image model as
// literal braces is a wasted generation.
//
// Exit codes: 0 an image arrived; 2 bad arguments or a missing input; 3 the run finished with no
// image; 4 `codex` could not be run at all.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_NAME = 'strip-raw.png';
const DEFAULT_TIMEOUT = 15 * 60 * 1000;

export function parseArguments(argv) {
  const options = {
    prompt: null, outDir: null, runId: 'attempt-1', refs: [],
    name: DEFAULT_NAME, timeout: DEFAULT_TIMEOUT, codex: null, dryRun: false,
  };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    const next = () => {
      const value = argv[++index];
      if (value === undefined) throw new Error(`${argument} needs a value.`);
      return value;
    };
    if (argument === '--prompt') options.prompt = next();
    else if (argument === '--out-dir') options.outDir = next();
    else if (argument === '--run-id') options.runId = next();
    else if (argument === '--ref' || argument === '-i') options.refs.push(next());
    else if (argument === '--name') options.name = next();
    else if (argument === '--timeout') options.timeout = Number(next());
    else if (argument === '--codex') options.codex = next();
    else if (argument === '--dry-run') options.dryRun = true;
    else throw new Error(`Unknown argument ${argument}.`);
  }
  if (!options.prompt) throw new Error('--prompt <file> is required.');
  if (!options.outDir) throw new Error('--out-dir <dir> is required.');
  if (!/^[A-Za-z0-9._-]+$/.test(options.runId)) throw new Error('--run-id must be a plain file name.');
  if (!Number.isFinite(options.timeout) || options.timeout <= 0) throw new Error('--timeout must be a positive number of milliseconds.');
  return options;
}

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

/**
 * Find something Node can actually spawn.
 *
 * `codex` on PATH here is an npm shim: a `sh` script on POSIX and a `codex.cmd` batch file on
 * Windows, and since the CVE-2024-27980 mitigation Node refuses to spawn a `.cmd` at all without
 * a shell (`EINVAL`). Running it through a shell would then hand every path with a space in it to
 * `cmd.exe` to requote, so instead this walks the shim back to the JavaScript it calls and spawns
 * that with this process's own Node. Returns `{ command, prefix, label }`.
 */
export function resolveCodex(explicit) {
  const direct = explicit || process.env.CODEX_BIN;
  if (direct) return { command: direct, prefix: [], label: direct };
  if (process.platform !== 'win32') return { command: 'codex', prefix: [], label: 'codex' };
  const candidates = ['codex.exe', 'codex.cmd', 'codex.bat'];
  for (const directory of (process.env.PATH ?? '').split(delimiter)) {
    if (!directory) continue;
    for (const candidate of candidates) {
      const path = join(directory, candidate);
      if (!existsSync(path)) continue;
      if (candidate === 'codex.exe') return { command: path, prefix: [], label: path };
      const entry = join(directory, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
      if (existsSync(entry)) return { command: process.execPath, prefix: [entry], label: entry };
      return { command: path, prefix: [], label: path, shell: true };
    }
  }
  throw new Error('No codex on PATH. Codex CLI is the only image-generation route on this machine.');
}

export function codexHome() {
  return process.env.CODEX_HOME || join(homedir(), '.codex');
}

/** Fill `{{SLOT}}`s and refuse to hand the model a template that still has holes in it. */
export function fillSlots(template, slots) {
  const filled = template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (whole, key) => (key in slots ? slots[key] : whole));
  const left = [...new Set([...filled.matchAll(/\{\{([A-Z0-9_]+)\}\}/g)].map((match) => match[1]))];
  if (left.length > 0) throw new Error(`Prompt still carries unfilled slots: ${left.join(', ')}.`);
  return filled;
}

/** Pull the thread id, the usage block and any source path out of the `--json` event stream. */
export function readEvents(text) {
  const result = { threadId: null, usage: null, sourcePath: null, agentMessages: [], commands: [] };
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    if (event.type === 'thread.started' && event.thread_id) result.threadId = event.thread_id;
    if (event.type === 'turn.completed' && event.usage) result.usage = event.usage;
    if (event.type === 'item.completed' && event.item?.type === 'agent_message') result.agentMessages.push(event.item.text ?? '');
    if (event.type === 'item.completed' && event.item?.type === 'command_execution') {
      result.commands.push({ command: event.item.command ?? '', exitCode: event.item.exit_code ?? null });
    }
  }
  const haystack = [...result.agentMessages, ...result.commands.map((command) => command.command)].join('\n');
  const match = haystack.match(/[A-Za-z]:[\\/](?:[^\\/\n"']+[\\/])*generated_images[\\/][^\\/\n"']+[\\/][^\s\\/\n"']+\.png/);
  if (match) result.sourcePath = match[0].replace(/\\\\/g, '\\');
  return result;
}

/** Newest PNG under `$CODEX_HOME/generated_images/<thread>/`, the documented default location. */
export function newestGenerated(threadId) {
  if (!threadId) return null;
  const directory = join(codexHome(), 'generated_images', threadId);
  if (!existsSync(directory)) return null;
  const files = readdirSync(directory)
    .filter((file) => file.toLowerCase().endsWith('.png'))
    .map((file) => join(directory, file))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return files[0] ?? null;
}

export function main(argv = process.argv.slice(2)) {
  let options;
  try { options = parseArguments(argv); } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return 2;
  }

  const promptPath = resolve(options.prompt);
  if (!existsSync(promptPath)) { process.stderr.write(`No prompt file at ${promptPath}.\n`); return 2; }
  const refs = options.refs.map((ref) => resolve(ref));
  for (const ref of refs) {
    if (!existsSync(ref)) { process.stderr.write(`No reference image at ${ref}.\n`); return 2; }
  }

  const runDir = resolve(options.outDir, options.runId);
  mkdirSync(runDir, { recursive: true });
  const imagePath = join(runDir, options.name);
  const eventsPath = join(runDir, 'events.jsonl');
  const errPath = join(runDir, 'err.txt');
  const lastPath = join(runDir, 'last.txt');
  const usagePath = join(runDir, 'usage.json');
  const resolvedPromptPath = join(runDir, 'prompt.txt');

  const slots = { OUTPUT_PATH: imagePath, OUTPUT_DIR: runDir, RUN_ID: options.runId };
  refs.forEach((ref, index) => { slots[`REF_${index + 1}`] = ref; });
  let prompt;
  try { prompt = fillSlots(readFileSync(promptPath, 'utf8'), slots); } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return 2;
  }
  writeFileSync(resolvedPromptPath, prompt);

  let binary;
  try { binary = resolveCodex(options.codex); } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return 4;
  }
  const args = [
    ...binary.prefix,
    'exec', '--skip-git-repo-check', '-C', runDir,
    '--sandbox', 'workspace-write', '--json', '-o', lastPath,
  ];
  for (const ref of refs) args.push('-i', ref);

  if (options.dryRun) {
    process.stdout.write(`${JSON.stringify({ codex: binary, args, promptPath: resolvedPromptPath, imagePath }, null, 2)}\n`);
    return 0;
  }

  const startedAt = new Date();
  const started = Date.now();
  const run = spawnSync(binary.command, args, {
    input: prompt,
    encoding: 'utf8',
    timeout: options.timeout,
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
    shell: binary.shell === true,
  });
  const wallClockMs = Date.now() - started;
  const finishedAt = new Date();

  writeFileSync(eventsPath, run.stdout ?? '');
  writeFileSync(errPath, run.stderr ?? '');

  if (run.error) {
    process.stderr.write(`Could not run ${binary.label}: ${run.error.message}\n`);
    return 4;
  }

  const events = readEvents(run.stdout ?? '');
  const lastMessage = existsSync(lastPath) ? readFileSync(lastPath, 'utf8') : '';
  if (!events.sourcePath && lastMessage) {
    const fallback = readEvents(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: lastMessage } }));
    events.sourcePath = fallback.sourcePath;
  }

  // Codex copies the PNG itself when the prompt tells it to and the sandbox allows it. When it
  // did not, fetch it: the thread id names the directory the built-in tool writes into.
  let recovered = false;
  if (!existsSync(imagePath)) {
    const source = (events.sourcePath && existsSync(events.sourcePath))
      ? events.sourcePath
      : newestGenerated(events.threadId);
    if (source && existsSync(source)) {
      copyFileSync(source, imagePath);
      recovered = true;
      if (!events.sourcePath) events.sourcePath = source;
    }
  }

  const arrived = existsSync(imagePath);
  const record = {
    runId: options.runId,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    wallClockMs,
    exitCode: run.status,
    codex: { binary: binary.label, args, version: codexVersion(binary) },
    prompt: { source: promptPath, resolved: resolvedPromptPath, sha256: sha256(resolvedPromptPath) },
    references: refs.map((ref) => ({ path: ref, sha256: sha256(ref) })),
    threadId: events.threadId,
    sourcePath: events.sourcePath,
    copiedByWrapper: recovered,
    image: arrived ? { path: imagePath, bytes: statSync(imagePath).size, sha256: sha256(imagePath) } : null,
    usage: events.usage,
    lastMessage: lastMessage.trim(),
  };
  writeFileSync(usagePath, `${JSON.stringify(record, null, 2)}\n`);

  if (!arrived) {
    process.stderr.write(`No image arrived for run ${options.runId}. Codex exited ${run.status}; see ${eventsPath}.\n`);
    return 3;
  }
  process.stdout.write(
    `${options.runId}: ${imagePath} (${record.image.bytes} bytes), ${Math.round(wallClockMs / 1000)} s, `
    + `thread ${events.threadId ?? 'unknown'}${recovered ? ', copied by the wrapper' : ''}\n`,
  );
  return 0;
}

function codexVersion(binary) {
  const run = spawnSync(binary.command, [...binary.prefix, '--version'], {
    encoding: 'utf8', timeout: 60_000, windowsHide: true, shell: binary.shell === true,
  });
  return (run.stdout ?? '').trim() || null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exit(main());
  } catch (error) {
    process.stderr.write(`codex-imagegen: ${error.message}\n`);
    process.exit(2);
  }
}

export { DEFAULT_NAME, DEFAULT_TIMEOUT };
