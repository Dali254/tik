/* server.js — cPanel / Node.js hosting server
   Run: node server.js  (or via PM2: pm2 start server.js --name tiktok-followers)
   Reads: .env in project root (dotenv)
*/

require('dotenv').config();   // loads .env automatically for cPanel

const express = require('express');
const path    = require('path');
const app     = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files
app.use(express.static(path.join(__dirname)));

// ── M-Pesa routes ──────────────────────────────────────────
const stkpushHandler  = require('./api/mpesa/stkpush');
const callbackHandler = require('./api/mpesa/callback');
const statusHandler   = require('./api/mpesa/status');
const packagesHandler = require('./api/packages');

// Adapt serverless-style handlers to Express middleware
function adapt(fn) {
  return function(req, res) {
    req.query = req.query || {};
    fn(req, res);
  };
}

app.post('/api/mpesa/stkpush',  adapt(stkpushHandler));
app.post('/api/mpesa/callback', adapt(callbackHandler));
app.get ('/api/mpesa/status',   adapt(statusHandler));
app.get ('/api/packages',       adapt(packagesHandler));
app.post('/api/packages',       adapt(packagesHandler));

// ── SPA fallback ────────────────────────────────────────────
app.get('*', function(req, res) {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ── Start ────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
  console.log(`TikTok Followers server running on port ${PORT}`);
  console.log(`M-Pesa environment: ${process.env.MPESA_ENVIRONMENT || 'sandbox'}`);
});
