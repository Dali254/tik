/* api/mpesa/callback.js
   POST /api/mpesa/callback — called by Safaricom after PIN entry.
   Always respond 200 immediately, then process asynchronously.
*/
const { redisGet, redisSet } = require('../_redis');
const { deliverFollowers }   = require('../_smm');

module.exports = async function handler(req, res) {
  // Always 200 immediately — Safaricom retries if we don't respond fast
  res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });

  try {
    console.log('[Callback] RAW body:', JSON.stringify(req.body, null, 2));

    const stkCallback =
      req.body?.Body?.stkCallback ||
      req.body?.body?.stkCallback;

    if (!stkCallback) {
      console.warn('[Callback] No stkCallback found');
      return;
    }

    const checkoutId = stkCallback.CheckoutRequestID;
    const resultCode = Number(stkCallback.ResultCode);
    const resultDesc = stkCallback.ResultDesc || '';

    console.log('[Callback] CheckoutID:', checkoutId, '| Code:', resultCode, '| Desc:', resultDesc);

    const existing = (await redisGet('payment:' + checkoutId)) || {};

    if (resultCode === 0) {
      // ── Payment successful ──
      const items   = stkCallback.CallbackMetadata?.Item || [];
      const get     = name => (items.find(i => i.Name === name) || {}).Value;
      const receipt = get('MpesaReceiptNumber');
      const amount  = get('Amount');
      const phone   = get('PhoneNumber');

      console.log('[Callback] SUCCESS — Receipt:', receipt, '| Amount:', amount, '| @' + existing.username);

      // Save success to Redis immediately so the frontend sees it
      const updatedRecord = {
        ...existing,
        status: 'SUCCESS', mpesaReceipt: receipt,
        paidAmount: amount, paidPhone: phone,
        paidAt: Date.now()
      };
      await redisSet('payment:' + checkoutId, updatedRecord, 7200);

      // ── Trigger SMM follower delivery ──
      if (existing.username && existing.followers) {
        try {
          const result = await deliverFollowers({
            username:  existing.username,
            followers: existing.followers,
            orderId:   checkoutId
          });

          if (result.success) {
            // Save the panel order ID so you can track delivery later
            await redisSet('payment:' + checkoutId, {
              ...updatedRecord,
              smmOrderId: result.panelOrderId,
              deliveryStatus: 'ordered'
            }, 7200);
            console.log('[Callback] Delivery ordered — panel ID:', result.panelOrderId);
          } else if (result.skipped) {
            console.log('[Callback] SMM not configured — manual delivery needed for @' + existing.username);
          }
        } catch (smmErr) {
          // Log error but don't affect payment status — delivery can be retried manually
          console.error('[Callback] SMM delivery error:', smmErr.message);
          await redisSet('payment:' + checkoutId, {
            ...updatedRecord,
            deliveryStatus: 'failed',
            deliveryError: smmErr.message
          }, 7200);
        }
      }

    } else {
      // ── Payment failed or cancelled ──
      const status = (resultCode === 1032 || resultCode === 1037) ? 'CANCELLED' : 'FAILED';
      await redisSet('payment:' + checkoutId, {
        ...existing,
        status, resultCode, resultDesc, failedAt: Date.now()
      }, 7200);
    }

  } catch (err) {
    console.error('[Callback] Error:', err.message);
  }
};
