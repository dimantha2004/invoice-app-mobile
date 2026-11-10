// Builds into build/:  node build.mjs [server|app]   (no argument = both)
//   build/server/   API code + node_modules, started with  npm start  (reads ../server.env)
//   build/server.env  backend settings, seeded once from server/.env, never overwritten
//   build/app.env     EXPO_PUBLIC_* values baked into the APK, seeded once from .env
//   build/invoice-app.apk
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { parseEnv } from 'node:util';

const what = process.argv[2];
const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: ['inherit', 'pipe', 'inherit'], encoding: 'utf8' });
const seed = (to, from) => existsSync(to) || cpSync(from, to);
mkdirSync('build', { recursive: true });

if (what !== 'app') {
  rmSync('build/server', { recursive: true, force: true });
  mkdirSync('build/server');
  for (const f of readdirSync('server')) if (/(?<!\.check)\.js$|^package(-lock)?\.json$/.test(f)) cpSync(`server/${f}`, `build/server/${f}`);
  const pkg = JSON.parse(readFileSync('build/server/package.json', 'utf8'));
  pkg.scripts = { start: 'node --env-file=../server.env index.js' };
  writeFileSync('build/server/package.json', JSON.stringify(pkg, null, 2));
  run('npm ci --omit=dev', 'build/server');
  seed('build/server.env', existsSync('server/.env') ? 'server/.env' : 'server/.env.example');
  console.log('server -> build/server  (settings: build/server.env)');
}

if (what !== 'server') {
  seed('build/app.env', '.env');
  // A cloud build can't see local files, so the values go to EAS's "preview" environment (eas.json) before building.
  for (const [name, value] of Object.entries(parseEnv(readFileSync('build/app.env', 'utf8')))) {
    if (name.startsWith('EXPO_PUBLIC_')) run(`npx eas-cli@latest env:set --environment preview --name ${name} --value "${value}" --visibility plaintext --non-interactive`);
  }
  const [build] = JSON.parse(run('npx eas-cli@latest build -p android --profile preview --json --non-interactive --wait'));
  const url = build?.artifacts?.buildUrl;
  if (!url) throw new Error('EAS build finished without an APK link');
  writeFileSync('build/invoice-app.apk', Buffer.from(await (await fetch(url)).arrayBuffer()));
  console.log('app -> build/invoice-app.apk  (settings: build/app.env)');
}
