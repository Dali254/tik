/* api/mpesa/stkpush.js  POST /api/mpesa/stkpush */
const { stkPush }             = require('../_mpesa');
const { redisSet }            = require('../_redis');

function normalizePhone(raw) {
  var s = String(raw || '').replace(/[\s\-\(\)\+]/g, '');
  if (s.startsWith('0')   && s.length === 10) return '254' + s.slice(1);
  if (s.startsWith('254') && s.length === 12) return s;
  return null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')
    return res.status(405).json({ success: false, message: 'Method not allowed' });

  const { phone, amount, followers, username, packageId } = req.body || {};
  if (!phone || !amount || !followers || !username)
    return res.status(400).json({ success: false, message: 'Missing fields' });

  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone)
    return res.status(400).json({
      success: false,
      message: `Invalid phone "${phone}". Use 07XXXXXXXX, 01XXXXXXXX, or 254XXXXXXXXX`
    });

  let result;
  try {
    result = await stkPush({
      phone:       normalizedPhone,
      amount:      Number(amount),
      description: `${followers} Followers @${username}`
    });
  } catch (err) {
    console.error('[STK Push Error]', err.message);
    return res.status(500).json({
      success: false,
      message: err.message,
      debug: {
        environment:       process.env.MPESA_ENVIRONMENT,
        shortcode:         process.env.MPESA_SHORTCODE,
        businessShortcode: process.env.MPESA_BUSINESS_SHORTCODE,
        transactionType:   process.env.MPESA_TRANSACTION_TYPE || 'CustomerBuyGoodsOnline',
        callbackUrl:       process.env.MPESA_CALLBACK_URL
      }
    });
  }

  if (result.ResponseCode === '0') {
    const checkoutId = result.CheckoutRequestID;
    const record = {
      status: 'PENDING', phone: normalizedPhone,
      amount, followers, username, packageId,
      merchantRequestId: result.MerchantRequestID,
      checkoutRequestId: checkoutId,
      createdAt: Date.now()
    };
    // Store in Redis with 2-hour TTL (Vercel-safe + cPanel)
    await redisSet('payment:' + checkoutId, record, 7200);

    return res.status(200).json({
      success: true, checkoutRequestId: checkoutId,
      message: result.CustomerMessage || 'STK Push sent'
    });
  }

  return res.status(200).json({
    success: false,
    message: [
      result.CustomerMessage, result.ResponseDescription,
      result.errorMessage, result.errorCode ? `[${result.errorCode}]` : null
    ].filter(Boolean).join(' — ') || 'M-Pesa request rejected',
    safaricomResponse: result
  });
};
