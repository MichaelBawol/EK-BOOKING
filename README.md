Endless Kettle — Bookings API (Vercel, serverless, no payments)
===============================================================

Endpoints
- POST /api/bookings   -> stores booking (KV if configured) + sends emails (SMTP)
- GET  /api/bookings   -> admin-only list (requires ADMIN_TOKEN) from KV

Environment variables (Vercel → Project Settings → Environment Variables)
- ADMIN_TOKEN       = choose-a-long-random-string    (required for GET)
- SMTP_HOST         = smtp.hostinger.com
- SMTP_PORT         = 465
- SMTP_USER         = reservations@endlesskettle.com
- SMTP_PASS         = ********
- FROM_EMAIL        = Endless Kettle <reservations@endlesskettle.com>
- ADMIN_EMAIL       = reservations@endlesskettle.com
- (optional storage) connect Vercel KV (Upstash) and it will set:
  - KV_REST_API_URL
  - KV_REST_API_TOKEN

Deploy
------
1) Create a GitHub repo and upload these files.
2) In vercel.com → New Project → Import the repo.
3) Add the environment variables above.
4) Deploy. Your API base: https://<project>.vercel.app/api

Front-end wiring
----------------
In Hostinger Builder → Settings → Integrations → Custom code (HEAD), add:
  <script>window.EK_API_BASE='https://<project>.vercel.app/api';</script>

In your React widget, after you create the payload in handleReserve():
  await fetch(`${API_BASE}/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

Admin fetch (optional)
----------------------
GET https://<project>.vercel.app/api/bookings
Headers:  Authorization: Bearer <ADMIN_TOKEN>
