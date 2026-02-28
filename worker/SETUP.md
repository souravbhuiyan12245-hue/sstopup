# SS TOP-UP Automation Setup

## কিভাবে সেটআপ করবে (১০ মিনিটে)

### Step 1: Cloudflare Account বানাও (ফ্রি)
1. https://dash.cloudflare.com/sign-up এ যাও
2. Email + password দিয়ে সাইন আপ করো

### Step 2: Worker Deploy করো
1. Cloudflare Dashboard → **Workers & Pages** → **Create Application** → **Create Worker**
2. নাম দাও: `ss-topup-automation`
3. **Deploy** ক্লিক করো
4. **Edit Code** ক্লিক করো
5. সব কোড ডিলিট করে `worker.js` এর কোড পেস্ট করো
6. **Save and Deploy** ক্লিক করো

### Step 3: Telegram Webhook সেটআপ করো
Browser এ এই URL ওপেন করো:
```
https://ss-topup-automation.<তোমার-subdomain>.workers.dev/setup
```
"ok: true" দেখলে সেটআপ হয়ে গেছে!

### Step 4: ওয়েবসাইটে Worker URL অ্যাড করো
Admin Panel → Settings এ Worker URL সেভ করো, অথবা index.html এ WORKER_URL চেঞ্জ করো।

## কিভাবে কাজ করবে

```
Customer অর্ডার করে → Worker → GitHub এ সেভ + Telegram এ Approve/Reject বাটন
                                         ↓
                              তুমি Approve দাও
                                         ↓
                              GitHub এ order "Completed"
                              Customer সাইটে দেখে ✅
```

## Endpoints
- `POST /order` — নতুন অর্ডার (website থেকে)
- `POST /addmoney` — Add Money request
- `POST /webhook` — Telegram callback handler
- `GET /setup` — Telegram webhook সেটআপ
- `GET /health` — Status check

## ফ্রি Limits (Cloudflare Workers)
- 100,000 requests/day — তোমার জন্য যথেষ্ট!
- কোনো টাকা লাগবে না
