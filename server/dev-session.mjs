// Outil de développement : crée une session panel supplémentaire adossée à la session Bbox
// la plus récente (pour tester l'interface dans un autre navigateur). À lancer serveur ARRÊTÉ.
// Usage : node server/dev-session.mjs [--remove]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const file = path.join(process.env.DATA_DIR || path.join(os.homedir(), '.bbox-panel'), 'sessions.json');
const all = JSON.parse(fs.readFileSync(file, 'utf8'));
if (process.argv.includes('--remove')) {
  for (const [k, s] of Object.entries(all)) if (s.dev) delete all[k];
  fs.writeFileSync(file, JSON.stringify(all, null, 1), { mode: 0o600 });
  console.log('sessions de dev supprimées');
  process.exit(0);
}
const latest = Object.values(all).filter((s) => !s.dev).sort((a, b) => b.created - a.created)[0];
if (!latest) { console.error('Aucune session : connecte-toi d’abord dans le panel.'); process.exit(1); }
const sid = crypto.randomBytes(32).toString('base64url');
all[crypto.createHash('sha256').update(sid).digest('hex')] = { ...latest, dev: true, created: Date.now(), expires: Date.now() + 86400_000, ua: 'dev' };
fs.writeFileSync(file, JSON.stringify(all, null, 1), { mode: 0o600 });
console.log(sid);
