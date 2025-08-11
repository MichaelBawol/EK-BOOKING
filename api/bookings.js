// api/bookings.js
import { preflight, allow } from './cors.js';
import nodemailer from 'nodemailer';

function safeNumber(v, d = 0) { const n = Number(v); return Number.isFinite(n) ? n : d; }
function newRef() {
  const n = Math.floor(Math.random() * 9999).toString().padStart(4, '0');
  const d = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  return `EK-${d}-${n}`;
}
async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8') || '';
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

async function sendEmails(booking) {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.FROM_EMAIL;
  const admin = process.env.ADMIN_EMAIL;

  if (!host || !user || !pass || !from || !admin) {
    return { sent: false, reason: 'smtp_not_configured' };
  }

  const transporter = nodemailer.createTransport({
    host, port, secure: port === 465,
    auth: { user, pass },
  });

  const lines = [
    `Ref: ${booking.ref}`,
    `Event: ${booking.eventTitle}`,
    `When: ${booking.date} at ${booking.slot}`,
    `Party: ${booking.party}`,
    `Name: ${booking.name}`,
    `Email: ${booking.email}`,
    `Phone: ${booking.phone}`,
    `Mode: ${booking.mode}`,
    `Base total: £${Number(booking.baseTotal || 0).toFixed(2)}`,
    booking.catering ? `Catering: ${booking.catering.name} — £${Number(booking.catering.pricePerPerson).toFixed(2)}pp × ${booking.party} = £${Number(booking.catering.subtotal).toFixed(2)}` : null,
    `Grand total: £${Number(booking.total || 0).toFixed(2)}`,
    booking.foodChoice ? `Food option: ${booking.foodChoice}` : null,
    booking.serviceChoice ? `Service option: ${booking.serviceChoice}` : null,
    booking.message ? `Message: ${booking.message}` : null,
    `Status: ${booking.status}`,
  ].filter(Boolean).join('\n');

  const subjectAdmin = `[Endless Kettle] Booking ${booking.ref} — ${booking.eventTitle}`;
  const subjectGuest = `Your ${booking.eventTitle} reservation — ${booking.ref}`;

  await transporter.sendMail({ from, to: admin, subject: subjectAdmin, text: lines });
  await transporter.sendMail({
    from, to: booking.email, subject: subjectGuest,
    text: `Thanks ${booking.name},\n\nWe’ve received your reservation. Details below:\n\n${lines}\n\nWe’ll contact you on ${booking.phone} to arrange payment.\n\n— Endless Kettle`,
  });

  return { sent: true };
}

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  allow(res);

  // GET requires admin token & KV; otherwise show 401 (not 500)
  if (req.method === 'GET') {
    const token = req.headers['x-admin-token'] || (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
    if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
      return res.status(200).json({ items: [], storage: 'not_configured' });
    }
    try {
      const { kv } = await import('@vercel/kv');
      const N = Number(req.query.limit || 200);
      const raw = await kv.lrange('ek:bookings', -N, -1);
      const list = raw.map(x => { try { return JSON.parse(x); } catch { return null; } }).filter(Boolean).reverse();
      return res.status(200).json({ items: list });
    } catch (e) {
      console.error('KV read failed', e);
      return res.status(200).json({ items: [], storage: 'kv_error' });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  try {
    const b = await readBody(req);
    const now = new Date();
    const booking = {
      ref: b.ref || newRef(),
      createdAt: now.toISOString(),
      eventId: b.eventId, eventTitle: b.eventTitle, mode: b.mode,
      date: b.date, slot: b.slot, party: safeNumber(b.party, 2),
      name: b.name, email: b.email, phone: b.phone,
      message: b.message || '',
      foodChoice: b.foodChoice || '', serviceChoice: b.serviceChoice || '',
      baseTotal: safeNumber(b.baseTotal || 0, 0),
      catering: b.catering ? {
        id: b.catering.id, name: b.catering.name,
        pricePerPerson: safeNumber(b.catering.pricePerPerson, 0),
        subtotal: safeNumber(b.catering.subtotal, 0),
      } : undefined,
      total: safeNumber(b.total || 0, 0),
      status: b.status || (b.mode === 'request' ? 'request_received' : 'reserved_unpaid'),
    };

    // Optional KV write
    let stored = false;
    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
      try {
        const { kv } = await import('@vercel/kv');
        await kv.rpush('ek:bookings', JSON.stringify(booking));
        await kv.hset(`ek:booking:${booking.ref}`, booking);
        stored = true;
      } catch (e) {
        console.warn('KV store failed', e);
      }
    }

    // Emails (safe)
    let email = { sent: false, reason: 'not_attempted' };
    try {
      email = await sendEmails(booking);
    } catch (e) {
      console.warn('Email send failed', e);
      email = { sent: false, reason: 'send_failed' };
    }

    return res.status(200).json({ ok: true, ref: booking.ref, stored, email });
  } catch (e) {
    console.error('Handler error', e);
    // Never 500 for you — return a soft JSON error for easier debugging
    return res.status(200).json({ ok: false, reason: 'caught_exception', detail: String(e) });
  }
}
