'use strict';
const db = require('../config/db');

/* ── Get config from DB (fallback to env) ─────────────── */
async function getTelegramConfig() {
  try {
    const [rows] = await db.execute(
      "SELECT key_name, value FROM settings WHERE key_name IN ('telegram_bot_token','telegram_chat_id')"
    );
    const cfg = {};
    rows.forEach(r => {
      if (r.key_name === 'telegram_bot_token') cfg.botToken = r.value;
      if (r.key_name === 'telegram_chat_id')   cfg.chatId   = r.value;
    });
    return {
      botToken: cfg.botToken || process.env.TELEGRAM_BOT_TOKEN || '',
      chatId  : cfg.chatId   || process.env.TELEGRAM_CHAT_ID   || ''
    };
  } catch {
    return {
      botToken: process.env.TELEGRAM_BOT_TOKEN || '',
      chatId  : process.env.TELEGRAM_CHAT_ID   || ''
    };
  }
}

/* ── Internal: send to a specific chat ────────────────── */
async function _sendToChat(botToken, chatId, message, photos, latitude, longitude) {
  const fmt = v => `${Math.round(parseFloat(v) || 0).toLocaleString('en-US')} IQD`;
  const api = method => `https://api.telegram.org/bot${botToken}/${method}`;

  try {
    const textResp = await fetch(api('sendMessage'), {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' })
    });
    const textResult = await textResp.json();

    if (photos && photos.length === 1) {
      await fetch(api('sendPhoto'), {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ chat_id: chatId, photo: photos[0].url, caption: photos[0].caption })
      });
    } else if (photos && photos.length > 1) {
      for (let i = 0; i < photos.length; i += 10) {
        const group = photos.slice(i, i + 10).map(p => ({
          type: 'photo', media: p.url, caption: p.caption
        }));
        await fetch(api('sendMediaGroup'), {
          method : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body   : JSON.stringify({ chat_id: chatId, media: group })
        });
      }
    }

    if (latitude != null && longitude != null) {
      await fetch(api('sendLocation'), {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ chat_id: chatId, latitude, longitude })
      }).catch(() => {});
    }

    return textResult;
  } catch (err) {
    console.error('Telegram send error:', err.message);
    return { ok: false, reason: err.message };
  }
}

/* ── Build order message text ─────────────────────────── */
function buildOrderMessage(order, filteredItems) {
  const fmt = v => `${Math.round(parseFloat(v) || 0).toLocaleString('en-US')} IQD`;
  const items = filteredItems || order.items || [];

  const lines = items.map(i => {
    const id    = (i.id != null) ? `#${i.id} ` : '';
    const name  = i.name || i.product_name || '—';
    const size  = i.size || '';
    const color = i.color || '';
    const qty   = i.qty  || i.quantity || 1;
    const price = parseFloat(i.price || i.unit_price || 0);
    const variant = [size, color].filter(Boolean).join(', ');
    return `  • ${id}${name}${variant ? ` (${variant})` : ''} × ${qty} = ${fmt(price * qty)}`;
  }).join('\n');

  const total = order.total != null
    ? fmt(order.total)
    : fmt(items.reduce((s, i) => s + (parseFloat(i.price || i.unit_price || 0) * (i.qty || i.quantity || 1)), 0));

  return (
    `🏋️ <b>NEW ORDER — SHAX STORE</b>\n\n` +
    `🆔 <b>Order:</b> ${order.orderId}\n` +
    `👤 <b>Customer:</b> ${order.customer}\n` +
    `📧 <b>Email:</b> ${order.email}\n` +
    `📞 <b>Phone:</b> ${order.phone}\n` +
    `📍 <b>City:</b> ${order.city || '—'}\n` +
    `📫 <b>Address:</b> ${order.address}\n` +
    (order.latitude != null && order.longitude != null
      ? `🗺️ <b>Location:</b> <a href="https://www.google.com/maps?q=${order.latitude},${order.longitude}">Open in Google Maps</a>\n`
      : '') +
    (order.note ? `📝 <b>Note:</b> ${order.note}\n` : '') +
    `\n📦 <b>Items:</b>\n${lines}\n\n` +
    (order.shippingTotal != null && parseFloat(order.shippingTotal) > 0
      ? `🚚 <b>Shipping:</b> ${fmt(order.shippingTotal)}\n`
      : `🚚 <b>Shipping:</b> Free\n`) +
    `💰 <b>Total:</b> ${total}\n` +
    `📅 <b>Date:</b> ${new Date().toLocaleString('en-GB')}`
  );
}

/* ── Build order photos array ─────────────────────────── */
function buildOrderPhotos(items) {
  const fmt = v => `${Math.round(parseFloat(v) || 0).toLocaleString('en-US')} IQD`;
  const base = (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');
  function toAbsolute(url) {
    if (!url) return null;
    if (/^https?:\/\//i.test(url)) return url;
    if (!base) return null;
    return base + (url.startsWith('/') ? url : '/' + url);
  }

  return (items || [])
    .map(i => {
      const id    = (i.id != null) ? `#${i.id} ` : '';
      const qty   = i.qty || i.quantity || 1;
      const price = parseFloat(i.price || i.unit_price || 0);
      const caption = `${id}${i.name || i.product_name || 'Item'}` +
                      `${i.size ? ` (${i.size})` : ''} × ${qty} — ${fmt(price * qty)}`;
      return { url: toAbsolute(i.image_url), caption };
    })
    .filter(p => p.url);
}

/* ── Send full order notification (admin chat) ────────── */
async function sendOrderNotification(order) {
  const { botToken, chatId } = await getTelegramConfig();
  if (!botToken || !chatId) return { ok: false, reason: 'Telegram not configured.' };

  const message = buildOrderMessage(order);
  const photos  = buildOrderPhotos(order.items);
  return _sendToChat(botToken, chatId, message, photos, order.latitude, order.longitude);
}

/* ── Send filtered order notification (sponsor chat) ──── */
async function sendSponsorOrderNotification(order, sponsorChatId, sponsorItems) {
  const { botToken } = await getTelegramConfig();
  if (!botToken || !sponsorChatId) return { ok: false, reason: 'Sponsor Telegram not configured.' };

  const filteredOrder = {
    ...order,
    items: sponsorItems,
    total: sponsorItems.reduce((s, i) => s + (parseFloat(i.price || i.unit_price || 0) * (i.qty || i.quantity || 1)), 0)
  };
  const message = buildOrderMessage(filteredOrder);
  const photos  = buildOrderPhotos(sponsorItems);
  return _sendToChat(botToken, sponsorChatId, message, photos);
}

/* ── Send status change notification (admin chat) ─────── */
async function sendMessage(text) {
  const { botToken, chatId } = await getTelegramConfig();
  if (!botToken || !chatId) return { ok: false, reason: 'Telegram not configured.' };
  try {
    const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
    });
    return await resp.json();
  } catch (err) {
    console.error('Telegram sendMessage error:', err.message);
    return { ok: false, reason: err.message };
  }
}

/* ── Send status change to sponsor chat ───────────────── */
async function sendSponsorStatusNotification(orderId, newStatus, customerName, total, sponsorChatId) {
  const { botToken } = await getTelegramConfig();
  if (!botToken || !sponsorChatId) return { ok: false, reason: 'Sponsor Telegram not configured.' };

  const fmt = v => `${Math.round(parseFloat(v) || 0).toLocaleString('en-US')} IQD`;
  const icons = { pending: '🕒', processing: '🔧', shipped: '🚚', delivered: '✅', cancelled: '🚫' };
  const verb = newStatus === 'cancelled' ? 'cancelled' : `marked as <b>${newStatus}</b>`;
  const text = `${icons[newStatus] || '🔔'} <b>Order ${orderId}</b> ${verb}\n👤 ${customerName}\n💰 ${fmt(total)}`;

  try {
    const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({ chat_id: sponsorChatId, text, parse_mode: 'HTML' })
    });
    return await resp.json();
  } catch (err) {
    console.error('Telegram sponsor status error:', err.message);
    return { ok: false, reason: err.message };
  }
}

/* ── Send a connectivity test to a specific chat ──────── */
async function sendTestMessageToChat(chatId) {
  const { botToken } = await getTelegramConfig();
  if (!botToken) return { ok: false, reason: 'Bot token not configured.' };
  if (!chatId)   return { ok: false, reason: 'Chat ID is required.' };
  try {
    const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({
        chat_id: chatId,
        text: '✅ <b>Shax Store</b> — Sponsor notifications connected! This chat will receive order alerts for your products.',
        parse_mode: 'HTML'
      })
    });
    return await resp.json();
  } catch (err) {
    console.error('Telegram test message error:', err.message);
    return { ok: false, reason: err.message };
  }
}

/* ── Send a connectivity test message (admin) ─────────── */
async function sendTestMessage() {
  const { botToken, chatId } = await getTelegramConfig();
  if (!botToken || !chatId) {
    return { ok: false, reason: 'Telegram not configured. Save a bot token and chat ID first.' };
  }
  try {
    const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({
        chat_id: chatId,
        text: '✅ <b>Shax Store</b> is connected! This bot is configured correctly.',
        parse_mode: 'HTML'
      })
    });
    return await resp.json();
  } catch (err) {
    console.error('Telegram test message error:', err.message);
    return { ok: false, reason: err.message };
  }
}

module.exports = {
  getTelegramConfig,
  sendOrderNotification,
  sendSponsorOrderNotification,
  sendSponsorStatusNotification,
  sendTestMessage,
  sendTestMessageToChat,
  sendMessage
};
