/**
 * Checks that the AI-facing documentation is true.
 *
 *   npm run docs:check
 *
 * It fails when:
 *   1. a generated file in docs/ai/generated is out of date (run `npm run docs:facts`)
 *   2. a path in backticks or a relative link in a document does not exist
 *   3. a module folder has no README, or AGENTS.md does not link to a module README
 *   4. `npm run <name>` in a document names a script that does not exist
 *   5. a dependency rule that the documents state is broken in the code
 */
import fs from 'node:fs';
import path from 'node:path';
import { build } from './docs-facts';

const ROOT = path.resolve(__dirname, '..');
const problems: string[] = [];
const fail = (m: string) => problems.push(m);
const exists = (p: string) => fs.existsSync(path.join(ROOT, p));
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function walk(dir: string, keep: (f: string) => boolean, out: string[] = []): string[] {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return out;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    if (['node_modules', '.next', 'dist', 'release', '.venv', '__pycache__', '.git', 'resources', 'test-results'].includes(e.name)) continue;
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(p, keep, out);
    else if (keep(p)) out.push(p);
  }
  return out;
}

// ── the documents that this script reads ─────────────────────────────────────────────────────────────────────────────
const MODULE_READMES = [
  'core/services/matching', 'core/services/graduation', 'core/services/scheduling', 'core/services/plannerImport', 'core/services/copilot',
  'core/services/classEstimation', 'core/services/portal', 'core/services/scrapper', 'core/services/export',
  'core/db', 'core/shared', 'runtime', 'electron', 'web', 'web/app/api', 'web/styles', 'student',
].map((d) => `${d}/README.md`);

const docs = [
  'AGENTS.md', 'CLAUDE.md', 'README.md',
  ...walk('docs/ai', (f) => f.endsWith('.md') && !f.startsWith('docs/ai/generated/')),
  ...MODULE_READMES,
].filter((f) => exists(f));

// ── 1. generated files ───────────────────────────────────────────────────────────────────────────────────────────────
async function generated() {
  const files = await build();
  for (const [name, text] of Object.entries(files)) {
    const file = `docs/ai/generated/${name}`;
    if (!exists(file)) fail(`${file} is missing. Run: npm run docs:facts`);
    else if (read(file) !== text) fail(`${file} is out of date. Run: npm run docs:facts`);
  }
}

// ── 2. paths and links ───────────────────────────────────────────────────────────────────────────────────────────────
// Paths that are made at run time, or live outside the repository, or are ignored by Git.
const SKIP_PREFIX = ['userData/', 'node_modules/', 'dist/', 'release/', 'resources/', 'test-students/', '.vercel/', '.venv/', 'tests/scenarios/RESULTS', 'core/services/plannerImport/.venv', 'web/.next', 'docs/ai/generated/', '__pycache__'];
const FILE_EXT = /\.(ts|tsx|js|mjs|json|md|yml|yaml|sql|py|css|prisma|html|sh)$/;
function looksLikePath(t: string): boolean {
  if (/[\s<>*$|{}]|\.\.\.|^https?:|^@|^~|^\/|^\.\//.test(t)) return false;
  if (/(^|\/)\.env/.test(t) || /ROUTING-.*RESULTS/.test(t)) return false;
  if (SKIP_PREFIX.some((p) => t.startsWith(p))) return false;
  return t.includes('/') && (FILE_EXT.test(t) || t.endsWith('/'));
}
function checkPaths() {
  for (const doc of docs) {
    const text = read(doc);
    const dir = path.dirname(doc);
    for (const m of text.matchAll(/`([^`\n]+)`/g)) {
      const t = m[1].replace(/:\d+$/, '').replace(/\(\)$/, '');
      // a module README may name a path from the repository root or from its own folder
      if (looksLikePath(t) && !exists(t) && !exists(`${dir}/${t}`)) fail(`${doc}: the path \`${t}\` does not exist`);
    }
    for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      const target = m[1].split('#')[0];
      if (!target || /^(https?:|mailto:)/.test(target)) continue;
      const resolved = path.normalize(path.join(dir, target)).split(path.sep).join('/');
      if (SKIP_PREFIX.some((p) => resolved.startsWith(p) && !resolved.startsWith('docs/ai/generated/'))) continue;
      if (!exists(resolved)) fail(`${doc}: the link (${m[1]}) does not resolve`);
    }
  }
}

// ── 3. module READMEs ────────────────────────────────────────────────────────────────────────────────────────────────
function checkModules() {
  for (const e of fs.readdirSync(path.join(ROOT, 'core/services'), { withFileTypes: true })) {
    if (e.isDirectory() && !exists(`core/services/${e.name}/README.md`)) fail(`core/services/${e.name} has no README.md`);
  }
  const agents = read('AGENTS.md');
  for (const r of MODULE_READMES) {
    if (!exists(r)) fail(`${r} is missing`);
    else if (!agents.includes(`(${r})`)) fail(`AGENTS.md does not link to ${r}`);
  }
}

// ── 4. npm scripts that the documents name ───────────────────────────────────────────────────────────────────────────
function checkScripts() {
  const scripts = new Set([...Object.keys(JSON.parse(read('package.json')).scripts), ...Object.keys(JSON.parse(read('student/package.json')).scripts)]);
  for (const doc of docs) {
    for (const m of read(doc).matchAll(/npm run ([a-z][\w:-]*)/g)) {
      if (!scripts.has(m[1])) fail(`${doc}: \`npm run ${m[1]}\` is not a script in package.json`);
    }
  }
}

// ── 5. dependency rules ──────────────────────────────────────────────────────────────────────────────────────────────
const SRC = (f: string) => /\.(ts|tsx|js|mjs)$/.test(f) && !/\.d\.ts$/.test(f);
const importsOf = (src: string) => [...src.matchAll(/(?:from\s+|import\s*\(\s*|require\(\s*)['"]([^'"]+)['"]/g)].map((m) => m[1]);
function checkImports() {
  for (const f of [...walk('web', SRC), ...walk('core', SRC)]) {
    for (const spec of importsOf(read(f))) {
      if (spec === 'electron') fail(`${f} imports electron. Only electron/ and runtime/ may.`);
    }
  }
  for (const f of walk('core', SRC)) {
    for (const spec of importsOf(read(f))) {
      if (/^(\.\.\/)+(web|electron)(\/|$)/.test(spec) || /^@\/|^@student\//.test(spec)) fail(`${f} imports ${spec}. core/ must not import web/, electron/ or student/.`);
    }
  }
  const IMPURE = /^(node:)?(fs|fs\/promises|child_process|http|https|net|os)$/;
  for (const f of walk('core/shared', SRC)) {
    for (const spec of importsOf(read(f))) {
      if (IMPURE.test(spec) || /(^|\/)db(\/|$)/.test(spec) || /^@local\/prisma-client/.test(spec)) fail(`${f} imports ${spec}. core/shared must stay pure.`);
    }
  }
  for (const f of walk('student', (x) => SRC(x) && !/^student\/(tests|node_modules)\//.test(x))) {
    for (const spec of importsOf(read(f))) {
      const core = /^@core\/(.*)$/.exec(spec)?.[1] ?? (/^(\.\.\/)+core\/(.*)$/.exec(spec)?.[2]);
      if (core && !/^(shared|services\/scheduling)(\/|$)/.test(core)) fail(`${f} imports ${spec}. student/ may import only core/shared and core/services/scheduling.`);
    }
  }
}

(async () => {
  await generated();
  checkPaths();
  checkModules();
  checkScripts();
  checkImports();
  if (problems.length) {
    console.error(`docs:check found ${problems.length} problem(s):\n` + problems.map((p) => `  - ${p}`).join('\n'));
    process.exit(1);
  }
  console.log(`docs:check passed (${docs.length} documents).`);
})().catch((e) => { console.error(e); process.exit(1); });
