# Airline Tracker — Setup-Anleitung 

## Was du brauchst
- Ein [Vercel-Konto](https://vercel.com) (kostenlos)
- Ein [Supabase-Konto](https://supabase.com) (kostenlos)
- [Node.js](https://nodejs.org) installiert

---

## Schritt 1 — Supabase Datenbank einrichten

1. Gehe zu [supabase.com](https://supabase.com) → "New Project"
2. Projekt erstellen (Name z.B. "airline-tracker")
3. Gehe zu **SQL Editor** und führe diesen Code aus:

```sql
create table flights (
  id uuid primary key default gen_random_uuid(),
  num text not null,
  from_airport text not null,
  to_airport text not null,
  dep_time text not null,
  arr_time text not null,
  aircraft_type text not null,
  created_at timestamptz default now()
);
```

4. Gehe zu **Project Settings → API**
   - Kopiere die **Project URL** → das ist dein `NEXT_PUBLIC_SUPABASE_URL`
   - Kopiere den **anon public key** → das ist dein `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

## Schritt 2 — Passwort-Hash generieren

Öffne ein Terminal und führe aus:

```bash
node -e "const b=require('bcryptjs'); b.hash('DEIN-PASSWORT', 10).then(h=>console.log(h))"
```

Der Output (z.B. `$2a$10$...`) ist dein `APP_PASSWORD_HASH`.

---

## Schritt 3 — Auf Vercel deployen

1. Erstelle ein GitHub-Repo und lade den Code hoch:
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/DEIN-USER/airline-tracker.git
git push -u origin main
```

2. Gehe zu [vercel.com](https://vercel.com) → "New Project" → GitHub-Repo importieren

3. Unter **Environment Variables** diese Werte eintragen:

| Variable | Wert |
|----------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Von Supabase (Schritt 1) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Von Supabase (Schritt 1) |
| `JWT_SECRET` | Ein langer zufälliger String, z.B. `mein-geheimer-string-123abc` |
| `APP_USERNAME` | Dein gewünschter Benutzername |
| `APP_PASSWORD_HASH` | Der Hash aus Schritt 2 |

4. **Deploy** klicken — fertig!

Du bekommst eine URL wie `https://airline-tracker-xxx.vercel.app`

---

## Lokal testen (optional)

```bash
npm install
cp .env.local.example .env.local
# .env.local mit deinen Werten befüllen
npm run dev
```

Dann unter http://localhost:3000 öffnen.

---

## Flughäfen

Die App kennt diese IATA-Codes:
ZRH, JFK, LHR, CDG, DXB, SIN, NRT, LAX, SYD, GRU, MUC, FRA, AMS, MAD, FCO,
BKK, HKG, ICN, YYZ, ORD, MEX, CPT, JNB, CAI, BOM, DEL, IST, BCN, VIE, CPH,
OSL, HEL, WAW, PRG, BRU, LIS, ATH, BUD, DUS, HAM, GVA, BAS
