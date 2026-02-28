# SS TOP-UP - Free Fire Diamond Store

## 📁 ফাইল স্ট্রাকচার
```
sstopup/
├── index.html          ← মেইন ওয়েবসাইট (কাস্টমার দেখবে)
├── admin.html          ← অ্যাডমিন প্যানেল (তোমার জন্য)
├── logo.svg            ← SS TOP-UP লোগো
├── data/
│   ├── prices.json     ← দাম (অ্যাডমিন থেকে চেঞ্জ হবে)
│   └── orders.json     ← অর্ডার লিস্ট
└── README.md           ← এই ফাইল
```

## 🚀 GitHub Pages এ Deploy করার ধাপ

1. তোমার GitHub repo তে যাও: `souravbhuiyan12245-hue/sstopup`
2. সব ফাইল আপলোড করো (index.html, admin.html, logo.svg, data/ ফোল্ডার)
3. Settings → Pages → Source: "main" branch → Save
4. সাইট লাইভ: `https://souravbhuiyan12245-hue.github.io/sstopup/`

## 🔐 অ্যাডমিন প্যানেল

- URL: `https://yourdomain/admin.html`
- ডিফল্ট পাসওয়ার্ড: `admin123`
- **প্রথম কাজ:** Settings → Change Password (নিজের পাসওয়ার্ড সেট করো!)

### অ্যাডমিন প্যানেলে যা যা করতে পারবে:
- ✅ সব অর্ডার দেখা ও ম্যানেজ করা (Complete/Running/Delete)
- ✅ Diamond, Weekly, Monthly, Special সব দাম চেঞ্জ করা
- ✅ Announcement সেট করা
- ✅ পাসওয়ার্ড চেঞ্জ করা

### GitHub Token সেটআপ (দাম সেভ করার জন্য):
1. GitHub → Settings → Developer Settings → Personal Access Tokens → Fine-grained tokens
2. "Generate new token"
3. Repository access: শুধু `sstopup` repo সিলেক্ট করো
4. Permissions: Contents → Read and Write
5. Token কপি করো → Admin Panel → Settings → GitHub Token এ পেস্ট করো

## 💎 ডায়মন্ড কোথা থেকে কিনবে (সস্তায়)

### 🥇 Best Options:
1. **Smile.one** (smile.one) - Reseller apply করো, 10-15% কম দামে পাবে
2. **JollyMax** (jollymax.com) - Reseller program, bulk discount
3. **Codashop** (codashop.com) - Direct topup, reliable
4. **Garena Shell** (shop.garena.com) - Official, bulk কিনলে সস্তা

### 📋 Process:
1. Smile.one/JollyMax এ reseller account খোলো
2. Balance load করো (bKash/card দিয়ে)
3. Customer order আসলে → Admin panel এ দেখো → UID নোট করো
4. Smile.one/Codashop এ গিয়ে UID দিয়ে topup করো
5. Admin panel এ order "Completed" মার্ক করো

### 💡 Tips:
- বেশি কিনলে বেশি ছাড় পাবে
- Facebook groups এ wholesale seller আছে (সাবধান, trust issue)
- Garena Indonesia/Thailand server থেকে সস্তা হয় (VPN দিয়ে)

## 📱 কিভাবে কাজ করবে (Full Flow)

### কাস্টমার সাইড:
1. কাস্টমার সাইটে আসবে → ডায়মন্ড/প্যাকেজ সিলেক্ট করবে
2. UID দিবে → bKash/Nagad দিয়ে পেমেন্ট করবে → TrxID দিবে
3. তোমার Telegram এ নোটিফিকেশন যাবে

### তোমার সাইড:
1. Telegram এ অর্ডার দেখবে
2. Admin panel (admin.html) এ যাবে
3. TrxID চেক করবে (bKash app থেকে)
4. Match হলে → Smile.one/Codashop এ গিয়ে customer UID তে diamond topup
5. Admin panel এ "Completed" মার্ক করবে

## ⚠️ সিকিউরিটি

- অ্যাডমিন পাসওয়ার্ড SHA-256 hash হিসেবে localStorage এ থাকে
- GitHub Token শুধু তোমার browser এ থাকে (কোডে নেই)
- **প্রথম কাজ:** ডিফল্ট পাসওয়ার্ড চেঞ্জ করো!
- Telegram Bot Token কোড এ আছে — এটা public repo তে রাখলে সবাই দেখতে পাবে
  - Fix: repo private রাখো, অথবা environment variable ব্যবহার করো
