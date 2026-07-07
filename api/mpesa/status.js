/* api/mpesa/status.js
   GET /api/mpesa/status?id=CHECKOUT_REQUEST_ID

   1. Reads from Redis (set by callback — Vercel-safe)
   2. Falls back to Safaricom STK Query if Redis has no result yet
   3. Only returns FAILED/CANCELLED for definitive Safaricom codes
*/
const { stkQuery }            = require('../_mpesa');
const { redisGet, redisSet }  = require('../_redis');

const CANCELLED_CODES = new Set([1032, 1037]);
const FAILED_CODES    = new Set([2001, 1025, 1026, 4001, 9999]);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const checkoutId = (req.query || {}).id;
  if (!checkoutId)
    return res.status(400).json({ status: 'ERROR', message: 'Missing id' });

  /* ── 1. Check Redis (fastest, set by callback) ── */
  const record = await redisGet('payment:' + checkoutId);
  if (record && record.status && record.status !== 'PENDING') {
    console.log('[Status] Redis hit:', record.status);
    return res.status(200).json({
      status:    record.status,
      message:   record.resultDesc || '',
      followers: record.followers,
      username:  record.username
    });
  }

  /* ── 2. Query Safaricom directly ── */
  let result;
  try {
    result = await stkQuery(checkoutId);
  } catch (err) {
    console.log('[Status] stkQuery error → PENDING:', err.message);
    return res.status(200).json({ status: 'PENDING', message: 'Checking…' });
  }

  console.log('[Status] Safaricom:', JSON.stringify(result));

  if (result.errorCode || result.errorcode)
    return res.status(200).json({ status: 'PENDING', message: result.errorMessage || 'Processing' });

  if (result.ResultCode === undefined && result.resultCode === undefined)
    return res.status(200).json({ status: 'PENDING', message: 'Awaiting response' });

  const code = Number(result.ResultCode ?? result.resultCode);
  const desc = result.ResultDesc || result.resultDesc || '';

  if (code === 0) {
    if (record) await redisSet('payment:' + checkoutId, { ...record, status: 'SUCCESS' }, 7200);
    return res.status(200).json({ status: 'SUCCESS', followers: record?.followers, username: record?.username });
  }
  if (CANCELLED_CODES.has(code)) {
    if (record) await redisSet('payment:' + checkoutId, { ...record, status: 'CANCELLED', resultDesc: desc }, 7200);
    return res.status(200).json({ status: 'CANCELLED', message: desc, code });
  }
  if (FAILED_CODES.has(code)) {
    if (record) await redisSet('payment:' + checkoutId, { ...record, status: 'FAILED', resultDesc: desc }, 7200);
    return res.status(200).json({ status: 'FAILED', message: desc, code });
  }

  // Unknown code — stay PENDING, keep polling
  console.log('[Status] Unknown code', code, '→ PENDING');
  return res.status(200).json({ status: 'PENDING', message: 'Processing…', code });
};
