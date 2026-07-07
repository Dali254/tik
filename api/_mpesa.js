/* _mpesa.js — Safaricom Daraja M-Pesa helper
   Supports Buy Goods (CustomerBuyGoodsOnline) where:
     - MPESA_SHORTCODE       = The TILL / Store number  (PartyB)
     - MPESA_BUSINESS_SHORTCODE = Head/Org shortcode for password (BusinessShortCode)
       If MPESA_BUSINESS_SHORTCODE is not set, MPESA_SHORTCODE is used for both.

   "agent number and store number do not match" means these two values
   are different in Safaricom's system but you're sending the same value.
   Set MPESA_BUSINESS_SHORTCODE to the org/head shortcode shown on your
   Daraja portal app, and keep MPESA_SHORTCODE as your actual till number.
*/

const MPESA_ENV           = process.env.MPESA_ENVIRONMENT || 'sandbox';
const CONSUMER_KEY        = process.env.MPESA_CONSUMER_KEY;
const CONSUMER_SECRET     = process.env.MPESA_CONSUMER_SECRET;
const TILL_NUMBER         = process.env.MPESA_SHORTCODE;                    // Store/Till (PartyB)
const BUSINESS_SHORTCODE  = process.env.MPESA_BUSINESS_SHORTCODE || TILL_NUMBER; // Agent/Org (BusinessShortCode)
const PASSKEY             = process.env.MPESA_PASSKEY;
const CALLBACK_URL        = process.env.MPESA_CALLBACK_URL;
const TRANSACTION_TYPE    = process.env.MPESA_TRANSACTION_TYPE || 'CustomerBuyGoodsOnline';

const BASE_URL = MPESA_ENV === 'production'
  ? 'https://api.safaricom.co.ke'
  : 'https://sandbox.safaricom.co.ke';

/* ── OAuth token ── */
async function getAccessToken() {
  const creds = Buffer.from(`${CONSUMER_KEY}:${CONSUMER_SECRET}`).toString('base64');
  let res;
  try {
    res = await fetch(
      `${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
      { headers: { Authorization: `Basic ${creds}` } }
    );
  } catch (networkErr) {
    throw new Error(`OAuth network error: ${networkErr.message}`);
  }

  const rawText = await res.text();
  console.log(`[OAuth] Status ${res.status} | Body: ${rawText}`);

  if (!res.ok) throw new Error(`OAuth ${res.status}: ${rawText}`);

  let data;
  try { data = JSON.parse(rawText); }
  catch (e) { throw new Error(`OAuth response not JSON: ${rawText}`); }

  if (!data.access_token) throw new Error(`OAuth: no access_token — ${rawText}`);
  return data.access_token;
}

/* ── Timestamp + password ──
   Password = base64(BusinessShortCode + Passkey + Timestamp)
   BusinessShortCode here is BUSINESS_SHORTCODE (the "agent" / org shortcode)
   NOT the till number — this is the fix for "agent and store do not match" */
function getTimestampAndPassword() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const ts = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds())
  ].join('');
  const password = Buffer.from(`${BUSINESS_SHORTCODE}${PASSKEY}${ts}`).toString('base64');
  return { timestamp: ts, password };
}

/* ── STK Push ── */
async function stkPush({ phone, amount, description }) {
  const token = await getAccessToken();
  const { timestamp, password } = getTimestampAndPassword();

  const body = {
    BusinessShortCode: BUSINESS_SHORTCODE,   // Agent / org shortcode (password matches this)
    Password:          password,
    Timestamp:         timestamp,
    TransactionType:   TRANSACTION_TYPE,
    Amount:            Math.ceil(Number(amount)),
    PartyA:            phone,                // customer phone 254XXXXXXXXX
    PartyB:            TILL_NUMBER,          // Till / store number
    PhoneNumber:       phone,
    CallBackURL:       CALLBACK_URL,
    AccountReference:  'TikFollowers',
    TransactionDesc:   description || 'TikTok Followers'
  };

  console.log(`[STK Push] → ${BASE_URL}`);
  console.log(`[STK Push] BusinessShortCode (agent)=${BUSINESS_SHORTCODE} | Till (store)=${TILL_NUMBER} | Type=${TRANSACTION_TYPE}`);
  console.log(`[STK Push] Phone=${phone} | Amount=${body.Amount} | Callback=${CALLBACK_URL}`);

  let res;
  try {
    res = await fetch(`${BASE_URL}/mpesa/stkpush/v1/processrequest`, {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
  } catch (networkErr) {
    throw new Error(`STK Push network error: ${networkErr.message}`);
  }

  const rawText = await res.text();
  console.log(`[STK Push] Response ${res.status}: ${rawText}`);

  if (!res.ok) throw new Error(`STK Push HTTP ${res.status}: ${rawText}`);

  let data;
  try { data = JSON.parse(rawText); }
  catch (e) { throw new Error(`STK Push response not JSON: ${rawText}`); }

  return data;
}

/* ── STK Query ── */
async function stkQuery(checkoutRequestId) {
  const token = await getAccessToken();
  const { timestamp, password } = getTimestampAndPassword();

  let res;
  try {
    res = await fetch(`${BASE_URL}/mpesa/stkpushquery/v1/query`, {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        BusinessShortCode: BUSINESS_SHORTCODE,
        Password:          password,
        Timestamp:         timestamp,
        CheckoutRequestID: checkoutRequestId
      })
    });
  } catch (networkErr) {
    throw new Error(`STK Query network error: ${networkErr.message}`);
  }

  const rawText = await res.text();
  console.log(`[STK Query] Response ${res.status}: ${rawText}`);

  if (!res.ok) throw new Error(`STK Query HTTP ${res.status}: ${rawText}`);

  let data;
  try { data = JSON.parse(rawText); }
  catch (e) { throw new Error(`STK Query response not JSON: ${rawText}`); }

  return data;
}

module.exports = { stkPush, stkQuery, getAccessToken };
