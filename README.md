# TikTok Followers — Buy Followers via M-Pesa

A clean, mobile-first web app that lets users:
1. Enter a TikTok username and verify their account
2. Choose a follower package (100 – 50,000 followers)
3. Pay securely via M-Pesa STK Push
4. See a "Wait 24 hours" confirmation screen

---

## Project Structure

```
tiktok-followers/
├── index.html              ← Frontend (single page app)
├── css/style.css           ← Styles
├── js/
│   ├── app.js              ← UI logic, packages, M-Pesa flow
│   └── profile.js          ← TikTok profile lookup
├── api/
│   ├── _mpesa.js           ← M-Pesa Daraja API helper
│   └── mpesa/
│       ├── stkpush.js      ← POST /api/mpesa/stkpush
│       ├── callback.js     ← POST /api/mpesa/callback (Safaricom → you)
│       └── status.js       ← GET  /api/mpesa/status?id=...
├── server.js               ← Express server for cPanel
├── vercel.json             ← Vercel deployment config
├── package.json
├── manifest.json           ← PWA manifest
├── .env.example            ← Rename to .env with real credentials
└── README.md
```

---

## M-Pesa Credentials

### Where to get them
1. Go to [https://developer.safaricom.co.ke](https://developer.safaricom.co.ke)
2. Create an account and log in
3. Create a new App — it gives you `Consumer Key` and `Consumer Secret`
4. For testing, use the **Sandbox** shortcode `174379` and the sandbox passkey
5. For production, apply for a **Lipa Na M-Pesa Online** account from Safaricom

---

## Deploy on Vercel

### 1. Install Vercel CLI
```bash
npm i -g vercel
```

### 2. Set environment variables in Vercel Dashboard
Go to: **Project → Settings → Environment Variables** and add:

| Variable Name           | Value                          |
|-------------------------|--------------------------------|
| `MPESA_ENVIRONMENT`     | `sandbox` or `production`      |
| `MPESA_CONSUMER_KEY`    | From Safaricom Developer Portal|
| `MPESA_CONSUMER_SECRET` | From Safaricom Developer Portal|
| `MPESA_SHORTCODE`       | Your Paybill/Till number       |
| `MPESA_PASSKEY`         | From Safaricom Developer Portal|
| `MPESA_CALLBACK_URL`    | `https://yourproject.vercel.app/api/mpesa/callback` |

### 3. Deploy
```bash
vercel --prod
```

> **Note:** Vercel reads environment variables from your project settings automatically — no `.env` file is needed on Vercel.

---

## Deploy on cPanel

### 1. Upload files
Upload all project files to your cPanel hosting (e.g. via File Manager or FTP to `public_html/followers/` or a Node.js app directory).

### 2. Create the `.env` file
Copy `.env.example` to `.env` in the project root and fill in your real credentials:

```env
MPESA_ENVIRONMENT=production
MPESA_CONSUMER_KEY=xxxxxxxxxxxxxxxxx
MPESA_CONSUMER_SECRET=xxxxxxxxxxxxxxxxx
MPESA_SHORTCODE=123456
MPESA_PASSKEY=your_passkey_here
MPESA_CALLBACK_URL=https://yourdomain.com/api/mpesa/callback
PORT=3000
```

### 3. Install dependencies
In cPanel Terminal or SSH:
```bash
cd /home/yourusername/tiktok-followers
npm install
```

### 4. Start with Node.js App Manager (cPanel)
- In cPanel → **Setup Node.js App**
- Set Application Root: `/home/yourusername/tiktok-followers`
- Application URL: your domain
- Application startup file: `server.js`
- Click **Create** / **Restart**

Or via PM2 (SSH):
```bash
npm install -g pm2
pm2 start server.js --name tiktok-followers
pm2 save
pm2 startup
```

---

## M-Pesa Flow

```
User taps "Pay via M-Pesa"
         ↓
POST /api/mpesa/stkpush   ← your server calls Safaricom API
         ↓
Safaricom sends STK Push to user's phone (PIN prompt)
         ↓
User enters M-Pesa PIN
         ↓
Safaricom calls POST /api/mpesa/callback  ← server receives result
         ↓
Frontend polls GET /api/mpesa/status?id=... every 5s
         ↓
SUCCESS → show "Purchase completed, wait 24 hours"
FAILED  → show error toast
```

---

## Production Notes

- Replace `global.__pendingPayments` (in-memory) with a real database (Redis/MySQL/PostgreSQL) for production
- The callback URL **must be HTTPS** and publicly accessible — Safaricom cannot reach `localhost`
- For Sandbox testing, use Safaricom test phone `254708374149` and PIN `1234`
- Follower delivery: integrate your actual follower-delivery service in `callback.js` where indicated by the TODO comment

---

## Follower Packages

| Package   | Followers | Price (KES) |
|-----------|-----------|-------------|
| Starter   | 100       | KES 50      |
| Basic     | 500       | KES 200     |
| Popular ⭐ | 1,000    | KES 350     |
| Growth    | 2,000     | KES 620     |
| Best Value 💎| 5,000  | KES 1,400   |
| Pro       | 10,000    | KES 2,500   |
| Elite     | 25,000    | KES 5,500   |
| Mega 🔥   | 50,000    | KES 9,500   |

---

## Admin Panel — Edit Packages

Access the admin panel at `/admin` (e.g. `https://yourdomain.com/admin`).

Default password: set `ADMIN_PASSWORD` in your `.env` / Vercel env vars.

**What you can do:**
- Change follower counts and prices for any package
- Add or delete packages
- Mark packages as inactive (hidden from users)
- Add badges like "Popular", "Best Value", "🔥 Mega"
- Drag to reorder packages
- Changes take effect immediately on the live site

---

## M-Pesa Till (Buy Goods) Fix

The app now uses `CustomerBuyGoodsOnline` (Till) instead of `CustomerPayBillOnline` (Paybill):
- `PartyB` = your Till number (same as `MPESA_SHORTCODE`)
- Set `MPESA_TRANSACTION_TYPE=CustomerBuyGoodsOnline` in your env vars
