/* api/_smm.js — SMM Panel follower delivery
   Calls your SMM panel API after a successful M-Pesa payment.

   Env vars needed:
     SMM_API_URL    = https://peakerr.com/api/v2   (or your panel's URL)
     SMM_API_KEY    = your panel API key
     SMM_SERVICE_ID = the service ID from your panel for TikTok followers

   How to find your service ID:
     Call: GET {SMM_API_URL}?key={SMM_API_KEY}&action=services
     Look for TikTok Followers in the response, note the 'service' number.
*/

const SMM_API_URL    = process.env.SMM_API_URL;
const SMM_API_KEY    = process.env.SMM_API_KEY;
const SMM_SERVICE_ID = process.env.SMM_SERVICE_ID;

/* Place a follower order on the SMM panel */
async function deliverFollowers({ username, followers, orderId }) {
  if (!SMM_API_URL || !SMM_API_KEY || !SMM_SERVICE_ID) {
    console.warn('[SMM] Not configured — skipping delivery for @' + username);
    return { skipped: true };
  }

  const tiktokUrl = 'https://www.tiktok.com/@' + username;

  const body = new URLSearchParams({
    key:      SMM_API_KEY,
    action:   'add',
    service:  SMM_SERVICE_ID,
    link:     tiktokUrl,
    quantity: String(followers)
  });

  console.log('[SMM] Placing order: @' + username + ' | ' + followers + ' followers | ref=' + orderId);

  let res;
  try {
    res = await fetch(SMM_API_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    body.toString()
    });
  } catch (networkErr) {
    throw new Error('SMM network error: ' + networkErr.message);
  }

  const raw = await res.text();
  console.log('[SMM] Response:', raw);

  let data;
  try { data = JSON.parse(raw); }
  catch (e) { throw new Error('SMM invalid JSON: ' + raw); }

  if (data.error) {
    throw new Error('SMM panel error: ' + data.error);
  }

  // Success — data.order is the panel's order ID
  console.log('[SMM] Order placed! Panel order ID:', data.order);
  return { success: true, panelOrderId: data.order };
}

/* Check order status (optional — for tracking) */
async function checkOrderStatus(panelOrderId) {
  if (!SMM_API_URL || !SMM_API_KEY) return null;

  const params = new URLSearchParams({
    key:    SMM_API_KEY,
    action: 'status',
    order:  String(panelOrderId)
  });

  const res  = await fetch(SMM_API_URL + '?' + params.toString());
  const data = await res.json();

  // status: Pending | In progress | Partial | Completed | Canceled
  return data;
}

/* List available services (run once to find your TikTok service ID) */
async function listServices() {
  if (!SMM_API_URL || !SMM_API_KEY) return null;
  const res  = await fetch(`${SMM_API_URL}?key=${SMM_API_KEY}&action=services`);
  const data = await res.json();
  return data.filter(s => s.name && s.name.toLowerCase().includes('tiktok'));
}

module.exports = { deliverFollowers, checkOrderStatus, listServices };
