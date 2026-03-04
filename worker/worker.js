// SS TOP-UP Automation Worker
// Deploy on Cloudflare Workers (FREE)
// Set these as Environment Variables in Cloudflare Dashboard:
// TG_BOT_TOKEN, TG_CHAT_ID, GH_TOKEN, GH_REPO

const TG_API_BASE = 'https://api.telegram.org/bot';
const GH_ORDERS_PATH = 'data/orders.json';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// ===== GitHub: Read orders =====
async function getOrders(env) {
  const r = await fetch(`https://api.github.com/repos/${env.GH_REPO}/contents/${GH_ORDERS_PATH}`, {
    headers: { 'Authorization': `token ${env.GH_TOKEN}`, 'User-Agent': 'SS-TopUp-Worker' }
  });
  if (!r.ok) return { orders: [], sha: '' };
  const data = await r.json();
  const content = atob(data.content);
  return { orders: JSON.parse(content), sha: data.sha };
}

// ===== GitHub: Save orders =====
async function saveOrders(orders, sha, env) {
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(orders, null, 2))));
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
async function sendTelegramOrder(order, orderIndex, env) {
  const msg = `🛒 *নতুন অর্ডার\\!* \\#${orderIndex + 1}\n\n` +
    `👤 Name: \`${esc(order.name)}\`\n` +
    `🎮 UID: \`${esc(order.uid)}\`\n` +
    `📦 Item: ${esc(order.item)}\n` +
    `💰 Price: ৳${order.price}\n` +
    `💳 Payment: ${esc(order.payment)}\n` +
    `📱 Phone: \`${esc(order.phone)}\`\n` +
    `🧾 TrxID: \`${esc(order.trxId)}\`\n` +
    `📅 ${esc(order.date)}`;

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

// ===== Handle Telegram Callback (Approve/Reject) =====
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

  if (action === 'approve') {
    orders[index].status = 'Completed';
    orders[index].approvedAt = new Date().toISOString();
  } else {
    orders[index].status = 'Rejected';
    orders[index].rejectedAt = new Date().toISOString();
  }

  const saved = await saveOrders(orders, sha, env);
  if (saved) {
    const emoji = action === 'approve' ? '✅' : '❌';
    const st = action === 'approve' ? 'APPROVED' : 'REJECTED';
    await fetch(`${TG_API_BASE}${env.TG_BOT_TOKEN}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text: callbackQuery.message.text + `\n\n${emoji} ${st} by Admin`
      })
    });
    await answerCb(callbackQuery.id, `${emoji} Order ${st}!`, env);
  } else {
    await answerCb(callbackQuery.id, '❌ Failed! Try again.', env);
  }
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

// ===== Main Handler =====
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // POST /check-limit — Check if UID can buy a special offer this week
    if (url.pathname === '/check-limit' && request.method === 'POST') {
      try {
        const d = await request.json();
        const { orders } = await getOrders(env);
        const result = checkWeeklyLimit(orders, d.uid, d.item);
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (e) {
        return new Response(JSON.stringify({ allowed: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // POST /order
    if (url.pathname === '/order' && request.method === 'POST') {
      try {
        const d = await request.json();
        const { orders, sha } = await getOrders(env);
        
        // Weekly limit check for special offers
        const limitCheck = checkWeeklyLimit(orders, d.uid, d.item);
        if (!limitCheck.allowed) {
          return new Response(JSON.stringify({ 
            success: false, 
            limited: true, 
            message: limitCheck.message 
          }), {
            status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
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
          await sendTelegramOrder(order, orders.length - 1, env);
          return new Response(JSON.stringify({ success: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        return new Response(JSON.stringify({ success: false }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (e) {
        return new Response(JSON.stringify({ success: false, error: e.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
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
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        return new Response(JSON.stringify({ success: false }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (e) {
        return new Response(JSON.stringify({ success: false, error: e.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // POST /webhook — Telegram callbacks
    if (url.pathname === '/webhook' && request.method === 'POST') {
      try {
        const update = await request.json();
        if (update.callback_query) await handleCallback(update.callback_query, env);
        return new Response('OK');
      } catch (e) {
        return new Response('Error', { status: 500 });
      }
    }

    // GET /setup — Set Telegram webhook
    if (url.pathname === '/setup') {
      const r = await fetch(`${TG_API_BASE}${env.TG_BOT_TOKEN}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: `${url.origin}/webhook`, allowed_updates: ['callback_query'] })
      });
      return new Response(JSON.stringify(await r.json(), null, 2), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', service: 'SS TOP-UP Automation' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response('Not Found', { status: 404 });
  }
};
