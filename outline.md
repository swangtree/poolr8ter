# Poolr8ter 🎱 — Expanded MVP Blueprint (Alpine.js Track)  
*A ~5-hour build plan with room for polish and an eye toward future upgrades.*

---

## 0 · Project Goal

> **Build** a lightweight web app that tracks singles pool games (ELO ladder, search, live updates) and lets both players enter passwords before reporting a result.  
> **Deliver** a working public demo in one work session (~5 h).  
> **Foundation** should be easy to extend to doubles, seasons, and richer UI later.

---

## 1 · Architecture at MVP

```txt
┌──────────────────────┐        GET /leaderboard
│   GitHub Pages       │ <─────────────────────────┐
│  • index.html        │                           │
│  • Tailwind CSS CDN  │                           │
│  • Alpine.js CDN     │                           │
└─────────▲────────────┘                           │
          │ (static HTML/JS)                      │
          │                                       │
          │  POST /report (JSON)                  │
┌─────────┴────────────┐                           │
│ Cloudflare Worker    │ ────►   Cloudflare KV (elo-data JSON)
│ • 1 file (TypeScript)│   read/write
│ • Endpoints          │
└──────────────────────┘
```

*All free-tier, no servers to administer.*

---

## 2 · Task Timeline (suggested)

| Time (hh:mm) | Task | Key Output |
|--------------|------|------------|
| **00:00–00:10** | **Repo & Pages**  | Public repo `poolr8ter`, GitHub Pages enabled, `public/` folder committed |
| **00:10–00:40** | **Cloudflare Worker + KV**<br>• `wrangler init worker`<br>• Add `POOL_KV` namespace<br>• Skeleton code & local dev (`wrangler dev`) | `GET /leaderboard` returns stub JSON |
| **00:40–01:30** | **Implement ELO logic**<br>• Install `elo-rating`<br>• Password check (hard-coded bcrypt compare)<br>• `POST /report` mutation updates KV | Endpoints fully working via curl/Postman |
| **01:30–03:00** | **Front-end UI**<br>• Tailwind layout<br>• Alpine `x-data="app()"`<br>• Search filter, sortable table<br>• “Report Match” modal with form & fetch | Live page pulls ladder and posts new matches |
| **03:00–03:20** | **Deploy Worker** (`wrangler publish`) & push static site | Public URL combo works end-to-end |
| **03:20–04:00** | **README + Screenshots**<br>• record GIF (Peek / LICEcap)<br>• Add badges: GitHub Pages, Made-with-Tailwind, Cloudflare Workers | Polished repo ready for recruiters |
| **04:00–04:30** | **Polish & QA buffer**<br>• Handle 404 UI<br>• Table sorting<br>• Mobile responsive tweaks | MVP “done” |
| **04:30–05:00** | **Optional extras** (pick one)<br>• Add doubles toggle in modal<br>• Add cron reset script for seasons<br>• GitHub Action for wrangler deploy | Extra sparkle |

*Adjust times to your pace; core MVP usually lands around the 3-3.5 h mark.*

---

## 3 · Cloudflare Worker Details

### 3.1 Environment

```toml
# wrangler.toml
name = "poolr8ter"
compatibility_date = "2025-07-01"

[[kv_namespaces]]
binding = "POOL_KV"
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

### 3.2 Data Structure (stored as one KV key)

```jsonc
{
  "players": {
    "sam": { "elo": 1200, "pwd": "$2b$10$..." },
    "erin": { "elo": 1180, "pwd": "$2b$10$..." }
  },
  "matches": [
    { "p1": "sam", "p2": "erin", "winner": "sam", "ts": 1719870000 }
  ]
}
```

> **Why single-blob?** Ultra-simple; one `get`/`put`.  
> **Scale ceiling:** ~25 MB KV value; fine for office league.

### 3.3 Endpoints (TypeScript sketch)

```ts
if (method === "GET" && path === "/leaderboard") {
  const data = (await kv.get(KEY, "json")) ?? { players: {} };
  const leaderboard = Object.entries(data.players)
    .map(([name, { elo }]) => ({ name, elo }))
    .sort((a, b) => b.elo - a.elo);
  return json(leaderboard);
}

if (method === "POST" && path === "/report") {
  const body = await req.json(); // {p1,pw1,p2,pw2,winner}
  const data = (await kv.get(KEY, "json")) ?? { players: {}, matches: [] };

  // bcrypt compare (sync small) — npm: bcryptjs
  if (!compare(body.pw1, data.players[body.p1]?.pwd) ||
      !compare(body.pw2, data.players[body.p2]?.pwd)) {
    return new Response("Unauthorized", { status: 401 });
  }

  // ELO calc
  const r = new Rating();
  const [newP1, newP2] =
    body.winner === body.p1
      ? r.ifWins(data.players[body.p1]?.elo ?? 1200, data.players[body.p2]?.elo ?? 1200)
      : r.ifLoses(...);

  // mutate
  Object.assign(data.players, {
    [body.p1]: { ...data.players[body.p1], elo: newP1 },
    [body.p2]: { ...data.players[body.p2], elo: newP2 },
  });
  data.matches.push({ ...body, ts: Date.now() });

  await kv.put(KEY, JSON.stringify(data));
  return json({ ok: true });
}
```

---

## 4 · Front-End Layout (`public/index.html`)

* Head: Tailwind CDN ✔, Alpine.js CDN ✔
* Body:

```html
<body x-data="poolApp()" class="p-6 bg-zinc-100">
  <h1 class="text-3xl font-bold mb-6">🎱 Poolr8ter</h1>

  <!-- Search -->
  <input x-model="query" placeholder="Search..."
         class="border p-2 rounded w-full mb-4"/>

  <!-- Leaderboard Table -->
  <table class="w-full bg-white shadow rounded">
    <thead><tr class="bg-zinc-200 text-left">
      <th class="p-2">Player</th><th class="p-2">ELO</th></tr></thead>
    <tbody>
      <template x-for="p in filtered()">
        <tr><td class="p-2" x-text="p.name"></td>
            <td class="p-2 text-center" x-text="p.elo"></td></tr>
      </template>
    </tbody>
  </table>

  <!-- Report Match Button -->
  <button @click="show=true"
          class="mt-6 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded">
    Report Match
  </button>

  <!-- Modal (x-show) -->
  <!-- ...fields: p1, pw1, p2, pw2, dropdown winner... -->
</body>
```

* Alpine component (`script` tag bottom):

```js
function poolApp() {
  return {
    url: "https://poolr8ter.<id>.workers.dev",
    data: [],
    query: "", show: false,
    form: { p1:"", pw1:"", p2:"", pw2:"", winner:"" },
    async init() { this.data = await (await fetch(this.url+"/leaderboard")).json(); },
    filtered() { return this.data.filter(p => p.name.toLowerCase().includes(this.query.toLowerCase())); },
    async submit() { await fetch(this.url+"/report",{method:"POST",headers:{'Content-Type':'application/json'},body:JSON.stringify(this.form)}); this.show=false; await this.init(); }
  };
}
```

---

## 5 · Security & Ops Notes

* **Secrets** → keep bcrypt hashes only in KV; no env vars leak to client.  
* **Rate-limit** → Worker can check `cf-connecting-ip` to throttle.  
* **Backups** → daily `kv:bulk export` via GitHub Action to repo.

---

## 6 · Upgrade Path (post-MVP)

1. **Auth** → swap passwords for Supabase Auth; store JWT; Worker validates via Supabase JWKS.
2. **DB** → migrate KV blob to Supabase Postgres; query via `@supabase/supabase-js`.
3. **UI framework** → replace Alpine with Svelte components or a T3/Next.js front-end.
4. **Realtime ladder** → Supabase realtime → push `INSERT/UPDATE` to browser store.
5. **Doubles & seasons** → new columns / tables; reset cron in Worker.

---

## 7 · Final Checklist

- [x] Repo public, description set  
- [x] Worker endpoint tested locally & deployed  
- [x] Static site fetches data, reports match  
- [x] README with GIF, build steps, tech badges  
- [ ] Pin repo to GitHub profile and share on LinkedIn

---

**Build, break, and rack 'em up!**
