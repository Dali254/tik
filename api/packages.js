/* api/packages.js
   GET  /api/packages  — public, returns active packages
   POST /api/packages  — protected, saves packages (requires ADMIN_PASSWORD)

   Storage: Upstash Redis (key: "packages") → falls back to packages.json
*/
const fs   = require('fs');
const path = require('path');
const { redisGet, redisSet } = require('./_redis');

const PACKAGES_FILE  = path.join(process.cwd(), 'packages.json');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin1234';

function readFile() {
  try { return JSON.parse(fs.readFileSync(PACKAGES_FILE, 'utf8')); }
  catch { return { packages: [] }; }
}

function writeFile(data) {
  try {
    data.updatedAt = new Date().toISOString();
    fs.writeFileSync(PACKAGES_FILE, JSON.stringify(data, null, 2));
  } catch(e) {
    // Vercel filesystem is read-only — Redis is the source of truth there
    console.log('[Packages] File write skipped (read-only FS):', e.message);
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Password');
  if (req.method === 'OPTIONS') return res.status(200).end();

  /* ── GET — public ── */
  if (req.method === 'GET') {
    // Try Redis first (Vercel), then file (cPanel)
    const cached = await redisGet('packages');
    if (cached && cached.packages && cached.packages.length) {
      return res.status(200).json(cached);
    }
    return res.status(200).json(readFile());
  }

  /* ── POST — protected ── */
  if (req.method === 'POST') {
    const pwd = req.headers['x-admin-password'] || (req.body && req.body.adminPassword);
    if (pwd !== ADMIN_PASSWORD) {
      return res.status(401).json({ success: false, message: 'Incorrect password' });
    }

    const { packages } = req.body || {};
    if (!Array.isArray(packages)) {
      return res.status(400).json({ success: false, message: 'packages must be an array' });
    }

    // Validate + normalise
    for (const pkg of packages) {
      if (!pkg.id || !pkg.followers || !pkg.price || !pkg.label) {
        return res.status(400).json({ success: false, message: 'Each package needs id, followers, price, label' });
      }
      pkg.followers = Number(pkg.followers);
      pkg.price     = Number(pkg.price);
      pkg.active    = pkg.active !== false;
    }

    const data = { packages, updatedAt: new Date().toISOString() };

    // Save to Redis (persistent on Vercel) AND file (for cPanel)
    await redisSet('packages', data);
    writeFile(data);

    console.log('[Packages] Saved', packages.length, 'packages');
    return res.status(200).json({ success: true, message: 'Packages saved', packages });
  }

  return res.status(405).json({ success: false, message: 'Method not allowed' });
};
