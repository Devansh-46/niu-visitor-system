# NIU Visitor Entry Management System

A Next.js + TypeScript + Tailwind rewrite of the original HTML kiosk, with:

- **Supabase** for visitor photo storage
- **Meritto / NPF CRM** lead push (server-side, key never exposed)
- **EmailJS** auto-emails to admissions
- **Google Sheets** sync (existing Apps Script setup)
- **A5 printable receipt** with QR code, identical design to the original

---

## 1. Local development

```bash
npm install
cp .env.example .env.local
# Fill in at least the Supabase variables in .env.local
npm run dev
```

The app runs on http://localhost:3000.

Without `.env.local`, the app still works — Supabase falls back to base64 photo storage and Meritto push is skipped with a "not configured" message.

---

## 2. Supabase setup

1. Create a free project at https://supabase.com
2. Go to **Storage → Create bucket**, name it `visitor-photos`, set **Public** access
3. In **Project Settings → API**, copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (keep secret)
4. Paste them into `.env.local`

---

## 3. Meritto CRM setup

Meritto will provide your API key. When you receive it, ask them for **all of these** together (the integration won't work with just the key):

| Variable | What to ask Meritto for |
|---|---|
| `MERITTO_API_URL` | Lead creation endpoint URL |
| `MERITTO_API_KEY` | Your tenant's API / access key |
| `MERITTO_SOURCE_NAME` | A source name they create for you (e.g. `NIU Walk-in Kiosk`) |
| `MERITTO_LOOKUP_URL` | Endpoint to search for existing leads by phone/email |
| `MERITTO_UPDATE_URL` | Endpoint to update an existing lead |
| `MERITTO_ACTIVITY_URL` | Endpoint to add an activity/note to a lead |
| `MERITTO_FIELD_PROGRAM` | Custom field key for "program of interest" |
| `MERITTO_FIELD_MEETING_WITH` | Custom field key for "meeting with" |
| `MERITTO_FIELD_NOTES` | Custom field key for "notes" |
| `MERITTO_FIELD_VISIT_PURPOSE` | Custom field key for "visit purpose" |

Paste into `.env.local`. The integration logic lives in `src/lib/meritto.ts` and may need small tweaks once you see real responses (auth header name, response field paths). Search for `IMPORTANT:` comments in that file.

### Behavior

| Purpose | Action |
|---|---|
| `Admission Enquiry - New` | Lookup by phone/email → update if exists, else create new lead |
| `Admission Enquiry - Existing` | Skip Meritto entirely (logged locally only) |

The CRM status appears as a pill in the Visitor Log column.

---

## 4. Deploy to Vercel

```bash
# Push to GitHub first
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/your-org/niu-visitor.git
git push -u origin main
```

Then on https://vercel.com:

1. **Import Project** → pick your GitHub repo
2. **Environment Variables** → paste everything from `.env.local`
3. Deploy

Vercel detects Next.js automatically. Free tier is sufficient for this volume.

---

## 5. EmailJS & Google Sheets

These work exactly as in the original HTML version. Set them up via the **Settings** tab inside the app — values are saved to localStorage per kiosk.

For the Apps Script code, click **View Apps Script Code** on the Settings page. The schema now includes a `Photo URL` column (Supabase public URL).

---

## 6. Project structure

```
src/
├── app/
│   ├── api/meritto/route.ts   # Server-side Meritto push (keeps API key secret)
│   ├── globals.css            # Tailwind + print styles
│   ├── layout.tsx
│   └── page.tsx               # Main client component, ties everything together
├── components/
│   ├── Header.tsx             # Top bar with logo + clock
│   ├── Tabs.tsx
│   ├── EntryPage.tsx          # Registration form + stats sidebar
│   ├── LogPage.tsx            # Searchable visitor table
│   ├── SettingsPage.tsx       # EmailJS / Sheets / operator config
│   ├── PhotoCapture.tsx       # Webcam + file upload
│   ├── ReceiptModal.tsx       # A5 printable receipt with QR
│   └── Toast.tsx              # Notification system
├── lib/
│   ├── meritto.ts             # CRM integration (server-side only)
│   ├── supabaseClient.ts      # Browser Supabase client
│   ├── upload.ts              # Photo upload helper
│   └── storage.ts             # localStorage + monotonic ID counter
└── types/
    └── index.ts               # Shared TypeScript types
```

---

## 7. Notes

- **Open kiosk mode**: no authentication. Anyone with the URL can register a visitor. Add Vercel password protection or a simple PIN if needed.
- **IDs are monotonic**: counter stored separately from the visitor array, so deletions never cause ID collisions.
- **Photos**: uploaded to Supabase first; if upload fails, falls back to base64 in localStorage so registration never fails.
- **Receipt prints to A5**: use the browser's print dialog (Ctrl/Cmd+P). Only the receipt is printed; rest of the UI is hidden via `@media print` rules.
