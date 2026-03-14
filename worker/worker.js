// SS TOP-UP Automation Worker
// Deploy on Cloudflare Workers (FREE)
// Set these as Environment Variables in Cloudflare Dashboard:
// TG_BOT_TOKEN, TG_CHAT_ID, GH_TOKEN, GH_REPO, API_KEY

const TG_API_BASE = 'https://api.telegram.org/bot';
const GH_ORDERS_PATH = 'data/orders.json';

// UTF-8 safe base64 decode/encode
function b64decode(str) {
  return decodeURIComponent(escape(atob(str)));
}
function b64encode(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

const ALLOWED_ORIGINS = [
  'https://souravbhuiyan12245-hue.github.io',
  'https://ss-topup.is-a.dev',
  'http://localhost',
  'http://127.0.0.1',
  'https://web.telegram.org',
  'https://webk.telegram.org',
  'https://webz.telegram.org'
];

function getCorsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = ALLOWED_ORIGINS.some(o => origin.startsWith(o));
  return {
    'Access-Control-Allow-Origin': allowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, X-Admin-Key',
  };
}

// Auth check for admin endpoints
function isAuthorized(request, env) {
  const apiKey = request.headers.get('X-API-Key') || new URL(request.url).searchParams.get('key');
  return apiKey === env.API_KEY;
}

// ===== GitHub: Read orders =====
async function getOrders(env) {
  const r = await fetch(`https://api.github.com/repos/${env.GH_REPO}/contents/${GH_ORDERS_PATH}`, {
    headers: { 'Authorization': `token ${env.GH_TOKEN}`, 'User-Agent': 'SS-TopUp-Worker' }
  });
  if (!r.ok) return { orders: [], sha: '' };
  const data = await r.json();
  const content = b64decode(data.content);
  return { orders: JSON.parse(content), sha: data.sha };
}

// ===== GitHub: Save orders =====
async function saveOrders(orders, sha, env) {
  const content = b64encode(JSON.stringify(orders, null, 2));
  const r = await fetch(`https://api.github.com/repos/${env.GH_REPO}/contents/${GH_ORDERS_PATH}`, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${env.GH_TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'SS-TopUp-Worker'
    },
    body: JSON.stringify({ message: 'Order update via automation', content, sha })
  });
  return r.ok;
}

// Escape MarkdownV2
function esc(str) {
  if (!str) return '';
  return String(str).replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

// ===== Telegram: Send order with buttons =====
async function sendTelegramOrder(order, orderIndex, env, orders) {
  // Check if this UID has ordered before (duplicate UID warning)
  let uidWarning = '';
  if (orders && order.uid) {
    const prevOrders = orders.filter(o => o.uid === order.uid && o.status !== 'Rejected' && orders.indexOf(o) !== orderIndex);
    if (prevOrders.length >= 2) {
      uidWarning = `\n\n⚠️ *সতর্কতা:* এই UID থেকে আগে ${prevOrders.length}টি অর্ডার আছে\\!`;
    }
  }
  
  const payIcon = (order.payment || '').toLowerCase() === 'nagad' ? '🟠' : '🟣';
  const msg = `🛒 *নতুন অর্ডার\\!* \\#${orderIndex + 1}\n` +
    `━━━━━━━━━━━━━━━━━━━\n\n` +
    `👤 *${esc(order.name || 'Unknown')}*\n` +
    `🎮 UID: \`${esc(order.uid)}\`\n` +
    `📦 ${esc(order.item)} — *৳${order.price}*\n` +
    `${payIcon} ${esc(order.payment)} \\| 📱 \`${esc(order.phone)}\`\n\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `🧾 *TrxID:*\n\`${esc(order.trxId)}\`\n` +
    `━━━━━━━━━━━━━━━━━━━\n\n` +
    `📅 ${esc(order.date)}` + uidWarning +
    `\n\n🟡 *Status: Pending*`;

  await fetch(`${TG_API_BASE}${env.TG_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: env.TG_CHAT_ID,
      text: msg,
      parse_mode: 'MarkdownV2',
      reply_markup: { inline_keyboard: [
        [{ text: '🔍 Verify TrxID', web_app: { url: `https://souravbhuiyan12245-hue.github.io/sstopup/verify.html?order=${orderIndex}` } }],
        [
          { text: '✅ Done', callback_data: `approve_${orderIndex}` },
          { text: '▶️ Running', callback_data: `running_${orderIndex}` },
          { text: '❌ Reject', callback_data: `reject_${orderIndex}` }
        ],
        [{ text: '🗑 Delete', callback_data: `delete_${orderIndex}` }]
      ]}
    })
  });
}

// ===== Telegram: Send Add Money with buttons =====
async function sendTelegramAddMoney(data, orderIndex, env) {
  const msg = `💰 *Add Money\\!* \\#${orderIndex + 1}\n\n` +
    `💵 Amount: ৳${data.amount}\n` +
    `💳 Payment: ${esc(data.payment)}\n` +
    `📱 Phone: \`${esc(data.phone)}\`\n` +
    `🧾 TrxID: \`${esc(data.trxId)}\`\n` +
    `📅 ${esc(data.date)}`;

  await fetch(`${TG_API_BASE}${env.TG_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: env.TG_CHAT_ID,
      text: msg,
      parse_mode: 'MarkdownV2',
      reply_markup: { inline_keyboard: [[
        { text: '✅ Approve', callback_data: `approve_${orderIndex}` },
        { text: '❌ Reject', callback_data: `reject_${orderIndex}` }
      ]]}
    })
  });
}

// ===== Handle Telegram Callback (Approve/Reject/Verify) =====
async function handleCallback(callbackQuery, env) {
  const data = callbackQuery.data;
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  const [action, indexStr] = data.split('_');
  const index = parseInt(indexStr);

  const { orders, sha } = await getOrders(env);
  if (index >= orders.length) {
    await answerCb(callbackQuery.id, '❌ Order not found!', env);
    return;
  }

  // ===== Show TrxID Popup =====
  if (action === 'showtrx') {
    const order = orders[index];
    const customerTrx = order.trxId || 'N/A';
    const payment = (order.payment || 'bkash').toUpperCase();
    await answerCb(callbackQuery.id, 
      `🧾 TrxID: ${customerTrx}\n\n💳 ${payment}\n📱 ${order.phone || 'N/A'}\n💰 ৳${order.price}\n\nbKash/Nagad app এ check করো!`, 
      env);
    return;
  }

  if (action === 'approve') {
    orders[index].status = 'Completed';
    orders[index].approvedAt = new Date().toISOString();
  } else if (action === 'running') {
    orders[index].status = 'Running';
    orders[index].runningAt = new Date().toISOString();
  } else if (action === 'delete') {
    orders[index].status = 'Deleted';
    orders[index].deletedAt = new Date().toISOString();
  } else {
    orders[index].status = 'Rejected';
    orders[index].rejectedAt = new Date().toISOString();
  }

  const saved = await saveOrders(orders, sha, env);
  if (saved) {
    const statusMap = {
      approve: { emoji: '✅', st: 'DONE', color: '🟢' },
      running: { emoji: '▶️', st: 'RUNNING', color: '🔵' },
      reject: { emoji: '❌', st: 'REJECTED', color: '🔴' },
      delete: { emoji: '🗑', st: 'DELETED', color: '⚫' }
    };
    const s = statusMap[action] || statusMap.reject;
    
    // Update message with new status
    const updatedText = callbackQuery.message.text
      .replace(/🟡 Status: Pending/, `${s.color} Status: ${s.st}`)
      .replace(/🟢 Status: DONE/, `${s.color} Status: ${s.st}`)
      .replace(/🔵 Status: RUNNING/, `${s.color} Status: ${s.st}`)
      .replace(/🔴 Status: REJECTED/, `${s.color} Status: ${s.st}`)
      + (action !== 'running' ? '' : '');
    
    // Running still shows buttons, others remove buttons
    const replyMarkup = action === 'running' ? {
      inline_keyboard: [
        [{ text: '🔍 Verify TrxID', callback_data: `verify_${index}` }],
        [
          { text: '✅ Done', callback_data: `approve_${index}` },
          { text: '❌ Reject', callback_data: `reject_${index}` }
        ]
      ]
    } : undefined;
    
    await fetch(`${TG_API_BASE}${env.TG_BOT_TOKEN}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text: updatedText,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {})
      })
    });
    await answerCb(callbackQuery.id, `${s.emoji} Order ${s.st}!`, env);
  } else {
    await answerCb(callbackQuery.id, '❌ Failed! Try again.', env);
  }
}

// ===== Handle Web App Data (from Mini App verify) =====
async function handleWebAppData(message, env) {
  try {
    const data = JSON.parse(message.web_app_data.data);
    const { action, orderIndex, verified } = data;
    const chatId = message.chat.id;
    
    const { orders, sha } = await getOrders(env);
    if (orderIndex >= orders.length) return;
    
    const order = orders[orderIndex];
    
    if (action === 'approve') {
      orders[orderIndex].status = 'Completed';
      orders[orderIndex].approvedAt = new Date().toISOString();
    } else if (action === 'running') {
      orders[orderIndex].status = 'Running';
      orders[orderIndex].runningAt = new Date().toISOString();
    } else if (action === 'reject') {
      orders[orderIndex].status = 'Rejected';
      orders[orderIndex].rejectedAt = new Date().toISOString();
    }
    
    const saved = await saveOrders(orders, sha, env);
    if (saved) {
      const verifyText = verified ? '✅ TrxID Verified' : '⚠️ TrxID Not Verified';
      const statusMap = { approve: '✅ DONE', running: '▶️ RUNNING', reject: '❌ REJECTED' };
      const st = statusMap[action] || action;
      
      await fetch(`${TG_API_BASE}${env.TG_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: `${st} — Order #${orderIndex + 1}\n\n👤 ${order.name}\n🎮 UID: ${order.uid}\n📦 ${order.item} — ৳${order.price}\n\n${verifyText}`
        })
      });
    }
  } catch(e) { console.log('WebApp data error:', e.message); }
}

// ===== Handle Verify Reply (admin pastes real TrxID) =====
async function handleVerifyReply(message, env) {
  const replyTo = message.reply_to_message;
  if (!replyTo || !replyTo.text) return;
  
  // Check if the replied message is a verify prompt
  const verifyMatch = replyTo.text.match(/TrxID Verify — Order #(\d+)/);
  if (!verifyMatch) return;
  
  const orderIndex = parseInt(verifyMatch[1]) - 1;
  const realTrxId = (message.text || '').trim();
  const chatId = message.chat.id;
  
  if (!realTrxId) {
    await fetch(`${TG_API_BASE}${env.TG_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: '❌ TrxID খালি! আবার চেষ্টা করো।' })
    });
    return;
  }
  
  const { orders } = await getOrders(env);
  if (orderIndex >= orders.length) {
    await fetch(`${TG_API_BASE}${env.TG_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: '❌ Order not found!' })
    });
    return;
  }
  
  const order = orders[orderIndex];
  const customerTrx = (order.trxId || '').trim().toUpperCase();
  const adminTrx = realTrxId.toUpperCase();
  
  const matched = customerTrx === adminTrx;
  
  let resultMsg;
  if (matched) {
    resultMsg = `✅ *MATCHED\\!* 🎉\n\n` +
      `📦 Order \\#${orderIndex + 1} — ${esc(order.item)}\n` +
      `👤 ${esc(order.name)} — UID: \`${esc(order.uid)}\`\n` +
      `💰 ৳${order.price}\n\n` +
      `🧾 Customer: \`${esc(order.trxId)}\`\n` +
      `🔍 bKash/Nagad: \`${esc(realTrxId)}\`\n\n` +
      `✅ TrxID মিলে গেছে\\! এখন অর্ডার Approve করো\\.`;
  } else {
    resultMsg = `❌ *NOT MATCHED\\!* ⚠️\n\n` +
      `📦 Order \\#${orderIndex + 1} — ${esc(order.item)}\n` +
      `👤 ${esc(order.name)} — UID: \`${esc(order.uid)}\`\n` +
      `💰 ৳${order.price}\n\n` +
      `🧾 Customer: \`${esc(order.trxId)}\`\n` +
      `🔍 bKash/Nagad: \`${esc(realTrxId)}\`\n\n` +
      `❌ TrxID মিলেনি\\! Reject করো অথবা আবার verify করো\\.`;
  }
  
  await fetch(`${TG_API_BASE}${env.TG_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: resultMsg,
      parse_mode: 'MarkdownV2',
      reply_markup: { inline_keyboard: [
        [
          { text: '✅ Done', callback_data: `approve_${orderIndex}` },
          { text: '▶️ Running', callback_data: `running_${orderIndex}` },
          { text: '❌ Reject', callback_data: `reject_${orderIndex}` }
        ],
        [{ text: '🔍 আবার Verify', callback_data: `verify_${orderIndex}` }]
      ]}
    })
  });
}

async function answerCb(id, text, env) {
  await fetch(`${TG_API_BASE}${env.TG_BOT_TOKEN}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: id, text, show_alert: true })
  });
}

// ===== Weekly Limit: Special offer items that are limited to once per week per UID =====
const WEEKLY_LIMITED_ITEMS = ['1X Weekly', 'Monthly'];

function isWithinLastWeek(dateStr) {
  try {
    const orderDate = new Date(dateStr);
    if (isNaN(orderDate.getTime())) return false;
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return orderDate >= weekAgo;
  } catch (e) { return false; }
}

function checkWeeklyLimit(orders, uid, item) {
  if (!WEEKLY_LIMITED_ITEMS.includes(item)) return { allowed: true };
  
  for (const o of orders) {
    if (o.uid === uid && o.item === item && o.status !== 'Rejected' && isWithinLastWeek(o.date)) {
      return { 
        allowed: false, 
        message: `⛔ এই সপ্তাহে আপনি ইতিমধ্যে "${item}" কিনেছেন। পরের সপ্তাহে আবার কিনতে পারবেন।`,
        lastOrderDate: o.date
      };
    }
  }
  return { allowed: true };
}

// ===== TrxID Duplicate Check =====
function isDuplicateTrxId(orders, trxId) {
  if (!trxId) return false;
  const normalized = trxId.trim().toUpperCase();
  return orders.some(o => o.trxId && o.trxId.trim().toUpperCase() === normalized && o.status !== 'Rejected');
}

// ===== Rate Limiting (max 5 orders per hour per phone) =====
function isRateLimited(orders, phone) {
  if (!phone) return false;
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  let count = 0;
  for (const o of orders) {
    if (o.phone === phone && new Date(o.date) >= oneHourAgo) {
      count++;
      if (count >= 5) return true;
    }
  }
  return false;
}

// ===== Input Validation =====
function validateOrder(d) {
  if (!d.uid || d.uid.length < 5 || d.uid.length > 15) return 'UID ৫-১৫ ডিজিট হতে হবে';
  if (!/^\d+$/.test(d.uid)) return 'UID শুধু নম্বর হতে হবে';
  if (!d.phone || !/^01\d{9}$/.test(d.phone)) return 'সঠিক ফোন নম্বর দাও (01XXXXXXXXX)';
  if (!d.trxId || d.trxId.length < 4) return 'সঠিক Transaction ID দাও';
  if (!d.item) return 'Item select করো';
  if (!d.price || d.price <= 0) return 'Invalid price';
  return null;
}

// ===== Main Handler =====
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const cors = getCorsHeaders(request);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    // Admin auth check (key from env variable)
    function isAdmin(req) {
      const key = req.headers.get('X-Admin-Key');
      return key && key === env.ADMIN_KEY;
    }

    // POST /ai/chat — Gemini proxy for English practice (no key needed on frontend)
    if (url.pathname === '/ai/chat' && request.method === 'POST') {
      try {
        if (!env.GEMINI_KEY) {
          return new Response(JSON.stringify({ error: 'GEMINI_KEY not set in worker env' }), {
            status: 500, headers: { ...cors, 'Content-Type': 'application/json' }
          });
        }
        const body = await request.json();
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.GEMINI_KEY}`;
        const r = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const data = await r.json();
        return new Response(JSON.stringify(data), {
          status: r.status, headers: { ...cors, 'Content-Type': 'application/json' }
        });
      } catch(e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500, headers: { ...cors, 'Content-Type': 'application/json' }
        });
      }
    }

    // GET/POST /admin/orders — Full CRUD for admin panel
    if (url.pathname === '/admin/orders') {
      if (!isAdmin(request)) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...cors, 'Content-Type': 'application/json' }
        });
      }
      if (request.method === 'GET') {
        const { orders } = await getOrders(env);
        return new Response(JSON.stringify(orders), {
          headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' }
        });
      }
      if (request.method === 'POST') {
        try {
          const newOrders = await request.json();
          const { sha } = await getOrders(env);
          const saved = await saveOrders(newOrders, sha, env);
          return new Response(JSON.stringify({ success: saved }), {
            headers: { ...cors, 'Content-Type': 'application/json' }
          });
        } catch (e) {
          return new Response(JSON.stringify({ success: false, error: e.message }), {
            status: 500, headers: { ...cors, 'Content-Type': 'application/json' }
          });
        }
      }
    }

    // GET/POST /admin/prices — Price management for admin panel
    if (url.pathname === '/admin/prices') {
      if (!isAdmin(request)) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...cors, 'Content-Type': 'application/json' }
        });
      }
      const GH_PRICES_PATH = 'data/prices.json';
      if (request.method === 'GET') {
        try {
          const r = await fetch(`https://api.github.com/repos/${env.GH_REPO}/contents/${GH_PRICES_PATH}`, {
            headers: { 'Authorization': `token ${env.GH_TOKEN}`, 'User-Agent': 'SS-TopUp-Worker' }
          });
          if (!r.ok) return new Response('[]', { headers: { ...cors, 'Content-Type': 'application/json' } });
          const data = await r.json();
          const content = b64decode(data.content);
          return new Response(content, {
            headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' }
          });
        } catch (e) {
          return new Response('{}', { headers: { ...cors, 'Content-Type': 'application/json' } });
        }
      }
      if (request.method === 'POST') {
        try {
          const newPrices = await request.json();
          // Get current sha
          const r = await fetch(`https://api.github.com/repos/${env.GH_REPO}/contents/${GH_PRICES_PATH}`, {
            headers: { 'Authorization': `token ${env.GH_TOKEN}`, 'User-Agent': 'SS-TopUp-Worker' }
          });
          const data = await r.json();
          const sha = data.sha || '';
          const content = b64encode(JSON.stringify(newPrices, null, 2));
          const saveR = await fetch(`https://api.github.com/repos/${env.GH_REPO}/contents/${GH_PRICES_PATH}`, {
            method: 'PUT',
            headers: {
              'Authorization': `token ${env.GH_TOKEN}`,
              'Content-Type': 'application/json',
              'User-Agent': 'SS-TopUp-Worker'
            },
            body: JSON.stringify({ message: 'Price update via admin', content, sha })
          });
          return new Response(JSON.stringify({ success: saveR.ok }), {
            headers: { ...cors, 'Content-Type': 'application/json' }
          });
        } catch (e) {
          return new Response(JSON.stringify({ success: false, error: e.message }), {
            status: 500, headers: { ...cors, 'Content-Type': 'application/json' }
          });
        }
      }
    }

    // POST /check-player — Verify Free Fire UID and get player name
    if (url.pathname === '/check-player' && request.method === 'POST') {
      try {
        const d = await request.json();
        const playerid = (d.playerid || '').trim();
        if (!playerid || playerid.length < 5 || playerid.length > 15 || !/^\d+$/.test(playerid)) {
          return new Response(JSON.stringify({ error: true, msg: 'সঠিক UID দাও (৫-১৫ ডিজিট)' }), {
            status: 400, headers: { ...cors, 'Content-Type': 'application/json' }
          });
        }
        const r = await fetch('https://apis.offertopup.com/api/game-id-checker', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'https://offertopup.com',
            'Referer': 'https://offertopup.com/'
          },
          body: JSON.stringify({ playerid })
        });
        const result = await r.json();
        return new Response(JSON.stringify(result), {
          headers: { ...cors, 'Content-Type': 'application/json' }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: true, msg: 'Server error' }), {
          status: 500, headers: { ...cors, 'Content-Type': 'application/json' }
        });
      }
    }

    // GET /prices — Public: return prices.json (no cache)
    if (url.pathname === '/prices' && request.method === 'GET') {
      try {
        const r = await fetch(`https://api.github.com/repos/${env.GH_REPO}/contents/data/prices.json`, {
          headers: { 'Authorization': `token ${env.GH_TOKEN}`, 'User-Agent': 'SS-TopUp-Worker' }
        });
        if (!r.ok) return new Response('{}', { headers: { ...cors, 'Content-Type': 'application/json' } });
        const data = await r.json();
        const content = b64decode(data.content);
        return new Response(content, {
          headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-cache, no-store' }
        });
      } catch (e) {
        return new Response('{}', { headers: { ...cors, 'Content-Type': 'application/json' } });
      }
    }

    // POST /notify — Route notifications through worker (hide TG token from frontend)
    if (url.pathname === '/notify' && request.method === 'POST') {
      try {
        const d = await request.json();
        if (d.type === 'new_user' && d.name) {
          const msg = `👤 *New User Registered\\!*\n\n📛 Name: ${esc(d.name)}\n📧 Email: ${esc(d.email || 'N/A')}\n📱 Phone: ${esc(d.phone || 'N/A')}\n📅 ${esc(d.date || '')}`;
          await fetch(`${TG_API_BASE}${env.TG_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: env.TG_CHAT_ID, text: msg, parse_mode: 'MarkdownV2' })
          });
        }
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...cors, 'Content-Type': 'application/json' }
        });
      } catch (e) {
        return new Response(JSON.stringify({ success: false }), {
          headers: { ...cors, 'Content-Type': 'application/json' }
        });
      }
    }

    // POST /check-limit — Check if UID can buy a special offer this week
    if (url.pathname === '/check-limit' && request.method === 'POST') {
      try {
        const d = await request.json();
        const { orders } = await getOrders(env);
        const result = checkWeeklyLimit(orders, d.uid, d.item);
        return new Response(JSON.stringify(result), {
          headers: { ...cors, 'Content-Type': 'application/json' }
        });
      } catch (e) {
        return new Response(JSON.stringify({ allowed: true }), {
          headers: { ...cors, 'Content-Type': 'application/json' }
        });
      }
    }

    // POST /order
    if (url.pathname === '/order' && request.method === 'POST') {
      try {
        const d = await request.json();
        
        // Input validation
        const validErr = validateOrder(d);
        if (validErr) {
          return new Response(JSON.stringify({ success: false, limited: true, message: '❌ ' + validErr }), {
            status: 400, headers: { ...cors, 'Content-Type': 'application/json' }
          });
        }
        
        const { orders, sha } = await getOrders(env);
        
        // TrxID duplicate check
        if (isDuplicateTrxId(orders, d.trxId)) {
          return new Response(JSON.stringify({ 
            success: false, limited: true, 
            message: '⛔ এই Transaction ID আগেই ব্যবহার করা হয়েছে! সঠিক TrxID দাও।' 
          }), {
            status: 409, headers: { ...cors, 'Content-Type': 'application/json' }
          });
        }
        
        // Rate limiting
        if (isRateLimited(orders, d.phone)) {
          return new Response(JSON.stringify({ 
            success: false, limited: true, 
            message: '⛔ অনেক বেশি অর্ডার দিয়েছো! ১ ঘণ্টা পর আবার চেষ্টা করো।' 
          }), {
            status: 429, headers: { ...cors, 'Content-Type': 'application/json' }
          });
        }
        
        // Weekly limit check for special offers
        const limitCheck = checkWeeklyLimit(orders, d.uid, d.item);
        if (!limitCheck.allowed) {
          return new Response(JSON.stringify({ 
            success: false, limited: true, 
            message: limitCheck.message 
          }), {
            status: 429, headers: { ...cors, 'Content-Type': 'application/json' }
          });
        }
        
        const order = {
          name: d.name || 'Unknown', uid: d.uid, item: d.item,
          price: d.price, payment: d.payment, phone: d.phone,
          trxId: d.trxId, date: d.date || new Date().toISOString(),
          status: 'Pending'
        };
        orders.push(order);
        const saved = await saveOrders(orders, sha, env);
        if (saved) {
          await sendTelegramOrder(order, orders.length - 1, env, orders);
          return new Response(JSON.stringify({ success: true }), {
            headers: { ...cors, 'Content-Type': 'application/json' }
          });
        }
        return new Response(JSON.stringify({ success: false }), {
          status: 500, headers: { ...cors, 'Content-Type': 'application/json' }
        });
      } catch (e) {
        return new Response(JSON.stringify({ success: false, error: e.message }), {
          status: 500, headers: { ...cors, 'Content-Type': 'application/json' }
        });
      }
    }

    // POST /addmoney
    if (url.pathname === '/addmoney' && request.method === 'POST') {
      try {
        const d = await request.json();
        const { orders, sha } = await getOrders(env);
        const entry = {
          name: d.name || 'Unknown', uid: '-',
          item: 'Add Money ৳' + d.amount, price: parseInt(d.amount),
          payment: d.payment, phone: d.phone, trxId: d.trxId,
          date: d.date || new Date().toLocaleString(),
          status: 'Pending', type: 'addmoney'
        };
        orders.push(entry);
        const saved = await saveOrders(orders, sha, env);
        if (saved) {
          await sendTelegramAddMoney(d, orders.length - 1, env);
          return new Response(JSON.stringify({ success: true }), {
            headers: { ...cors, 'Content-Type': 'application/json' }
          });
        }
        return new Response(JSON.stringify({ success: false }), {
          status: 500, headers: { ...cors, 'Content-Type': 'application/json' }
        });
      } catch (e) {
        return new Response(JSON.stringify({ success: false, error: e.message }), {
          status: 500, headers: { ...cors, 'Content-Type': 'application/json' }
        });
      }
    }

    // POST /webhook — Telegram callbacks + verify replies
    if (url.pathname === '/webhook' && request.method === 'POST') {
      try {
        const update = await request.json();
        if (update.callback_query) {
          await handleCallback(update.callback_query, env);
        } else if (update.message && update.message.web_app_data) {
          await handleWebAppData(update.message, env);
        } else if (update.message && update.message.reply_to_message) {
          await handleVerifyReply(update.message, env);
        }
        return new Response('OK');
      } catch (e) {
        return new Response('Error', { status: 500 });
      }
    }

    // GET /setup — Set Telegram webhook (protected)
    if (url.pathname === '/setup') {
      if (!isAuthorized(request, env)) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { 'Content-Type': 'application/json' }
        });
      }
      const r = await fetch(`${TG_API_BASE}${env.TG_BOT_TOKEN}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: `${url.origin}/webhook`, allowed_updates: ['callback_query', 'message'] })
      });
      return new Response(JSON.stringify(await r.json(), null, 2), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // GET /orders — Read orders directly from GitHub (no CDN cache)
    // POST /admin-status — Notify Telegram when admin changes order status
    if (url.pathname === '/admin-status' && request.method === 'POST') {
      if (!isAuthorized(request, env)) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...cors, 'Content-Type': 'application/json' }
        });
      }
      const { orderIndex, status, order } = await request.json();
      const emoji = status === 'Completed' ? '✅' : status === 'Rejected' ? '❌' : '▶️';
      const st = status === 'Completed' ? 'APPROVED' : status === 'Rejected' ? 'REJECTED' : 'RUNNING';
      const msg = `${emoji} *Order \\#${orderIndex + 1} ${st} by Admin*\n\n` +
        `👤 ${esc(order.name || 'Unknown')}\n` +
        `🎮 UID: \`${esc(order.uid || '—')}\`\n` +
        `📦 ${esc(order.item || '—')} — ৳${order.price || 0}`;
      await fetch(`${TG_API_BASE}${env.TG_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: env.TG_CHAT_ID, text: msg, parse_mode: 'MarkdownV2' })
      });
      return new Response(JSON.stringify({ success: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // GET /orders — Protected: requires API key for full data, public gets limited view
    if (url.pathname === '/orders' && request.method === 'GET') {
      const { orders } = await getOrders(env);
      if (isAuthorized(request, env)) {
        // Admin: full order data
        return new Response(JSON.stringify(orders), {
          headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-cache, no-store' }
        });
      } else {
        // Public: only status and basic info (no phone, trxId, email)
        const safeOrders = orders.map(o => ({
          name: o.name ? o.name[0] + '***' : 'Unknown',
          item: o.item,
          price: o.price,
          status: o.status,
          date: o.date
        }));
        return new Response(JSON.stringify(safeOrders), {
          headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-cache, no-store' }
        });
      }
    }

    // GET /daily-summary — Manual trigger (protected)
    if (url.pathname === '/daily-summary') {
      if (!isAuthorized(request, env)) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { 'Content-Type': 'application/json' }
        });
      }
      await sendDailySummary(env);
      return new Response(JSON.stringify({ success: true, message: 'Summary sent' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // GET /order-detail — Single order for verify Mini App (requires admin or API key)
    if (url.pathname === '/order-detail' && request.method === 'GET') {
      if (!isAdmin(request) && !isAuthorized(request, env)) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...cors, 'Content-Type': 'application/json' }
        });
      }
      const index = parseInt(url.searchParams.get('index') || '0');
      const { orders } = await getOrders(env);
      if (index >= orders.length) {
        return new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404, headers: { ...cors, 'Content-Type': 'application/json' }
        });
      }
      const o = orders[index];
      return new Response(JSON.stringify({
        name: o.name, uid: o.uid, item: o.item, price: o.price,
        payment: o.payment, phone: o.phone, trxId: o.trxId, status: o.status
      }), {
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    // POST /check-uid — Public: check orders by UID (safe data only)
    if (url.pathname === '/check-uid' && request.method === 'POST') {
      try {
        const d = await request.json();
        const uid = (d.uid || '').trim();
        if (!uid || uid.length < 5 || uid.length > 15 || !/^\d+$/.test(uid)) {
          return new Response(JSON.stringify({ success: false, message: 'সঠিক UID দাও (৫-১৫ ডিজিট)' }), {
            status: 400, headers: { ...cors, 'Content-Type': 'application/json' }
          });
        }
        const { orders } = await getOrders(env);
        const matched = orders
          .filter(o => o.uid === uid && o.status !== 'Deleted')
          .map(o => ({
            name: o.name ? o.name[0] + '***' : 'Unknown',
            item: o.item,
            price: o.price,
            status: o.status,
            date: o.date
          }));
        return new Response(JSON.stringify({ success: true, uid, orders: matched }), {
          headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-cache, no-store' }
        });
      } catch (e) {
        return new Response(JSON.stringify({ success: false, message: 'Server error' }), {
          status: 500, headers: { ...cors, 'Content-Type': 'application/json' }
        });
      }
    }

    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', service: 'SS TOP-UP Automation' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response('Not Found', { status: 404 });
  },

  // Cron trigger — runs daily at 11:55 PM Bangladesh time (17:55 UTC)
  async scheduled(event, env, ctx) {
    ctx.waitUntil(sendDailySummary(env));
  }
};

// ===== Daily Summary =====
async function sendDailySummary(env) {
  try {
    const { orders } = await getOrders(env);
    
    // Today's date (Bangladesh time UTC+6)
    const now = new Date();
    const bdTime = new Date(now.getTime() + 6 * 60 * 60 * 1000);
    const todayStr = bdTime.toISOString().split('T')[0];
    
    // Filter today's orders
    const todayOrders = orders.filter(o => {
      if (!o.date || o.type === 'referral') return false;
      try {
        const d = new Date(o.date);
        const bdD = new Date(d.getTime() + 6 * 60 * 60 * 1000);
        return bdD.toISOString().split('T')[0] === todayStr;
      } catch(e) { return false; }
    });
    
    const totalOrders = todayOrders.length;
    const completed = todayOrders.filter(o => o.status === 'Completed').length;
    const pending = todayOrders.filter(o => o.status === 'Pending').length;
    const rejected = todayOrders.filter(o => o.status === 'Rejected').length;
    const totalIncome = todayOrders.filter(o => o.status === 'Completed').reduce((sum, o) => sum + (o.price || 0), 0);
    const pendingIncome = todayOrders.filter(o => o.status === 'Pending').reduce((sum, o) => sum + (o.price || 0), 0);
    
    // Top items
    const itemCount = {};
    todayOrders.forEach(o => {
      if (o.item) itemCount[o.item] = (itemCount[o.item] || 0) + 1;
    });
    const topItems = Object.entries(itemCount).sort((a,b) => b[1] - a[1]).slice(0, 3);
    const topItemsStr = topItems.length > 0 
      ? topItems.map(([item, count]) => `  • ${esc(item)}: ${count}টি`).join('\n')
      : '  কোনো অর্ডার নেই';
    
    // Duplicate UID check (UIDs with 3+ orders today)
    const uidCount = {};
    todayOrders.forEach(o => {
      if (o.uid && o.uid !== '-') uidCount[o.uid] = (uidCount[o.uid] || 0) + 1;
    });
    const suspiciousUids = Object.entries(uidCount).filter(([_, count]) => count >= 3);
    let suspiciousStr = '';
    if (suspiciousUids.length > 0) {
      suspiciousStr = `\n\n⚠️ *সন্দেহজনক UID \\(3\\+ orders\\):*\n` + 
        suspiciousUids.map(([uid, count]) => `  🔴 \`${esc(uid)}\` — ${count}টি order`).join('\n');
    }
    
    const msg = `📊 *দৈনিক রিপোর্ট — SS TOP\\-UP*\n` +
      `📅 ${esc(todayStr)}\n\n` +
      `📦 মোট অর্ডার: *${totalOrders}*\n` +
      `✅ সম্পন্ন: ${completed}\n` +
      `⏳ পেন্ডিং: ${pending}\n` +
      `❌ বাতিল: ${rejected}\n\n` +
      `💰 আজকের আয়: *৳${totalIncome}*\n` +
      `⏳ পেন্ডিং আয়: ৳${pendingIncome}\n\n` +
      `🏆 *টপ প্রোডাক্ট:*\n${topItemsStr}` +
      suspiciousStr +
      `\n\n🤖 SS TOP\\-UP Automation`;
    
    await fetch(`${TG_API_BASE}${env.TG_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: env.TG_CHAT_ID, text: msg, parse_mode: 'MarkdownV2' })
    });
  } catch(e) {
    console.log('Daily summary error:', e.message);
  }
}
