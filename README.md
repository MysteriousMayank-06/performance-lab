# Performance Lab — private gym tracker

A mobile-first workout tracker that remembers every session, works offline, and keeps each person's data private.
Plain HTML + CSS + JavaScript (no framework), Supabase Free for accounts and database, IndexedDB for offline use.
The look is an Apple-style "liquid glass" interface (blue gradient, frosted glass, white sheets, floating nav) built for Android and works on iPhone and desktop too.

## What is in this folder

| Path | What it does |
|---|---|
| `index.html` | The single page the app runs in |
| `css/tokens.css` | Colours, spacing, fonts, motion — change the look here |
| `css/base.css`, `layout.css`, `components.css`, `pages.css`, `screens.css` | Glass effect, layout, buttons/inputs/sheets, per-screen styling |
| `js/app.js` | Starts the app, navigation, sync status chip, rest-timer bar |
| `js/router.js` | Screen-to-screen navigation and transitions |
| `js/config.js` | Supabase URL and key (public values only) |
| `js/db.js` | IndexedDB wrapper (one database per user) |
| `js/services/store.js` | All data reads/writes — saves locally first, then queues for sync |
| `js/services/sync.js` | Safe background sync with conflict detection |
| `js/services/timer.js` | Rest timer (timestamp based) |
| `js/services/export.js` | CSV and JSON export |
| `js/calculations/` | Volume, estimated 1RM, records, progression rules, plates, consistency, substitutes (all unit-tested) |
| `js/pages/` | One file per screen |
| `js/components/` | Sheets, toasts, charts, muscle diagram, bubble chart, exercise picker |
| `sql/` | Database setup: schema, indexes, security policies, seed exercises |
| `tests/` | Unit tests, browser end-to-end test, security test SQL |
| `service-worker.js`, `manifest.json` | Install-as-app and offline loading |

## 1. Set up Supabase (about 5 minutes, free)

1. Create a free project at supabase.com.
2. Open **SQL Editor** and run, in order, the full contents of `sql/001_schema.sql`, `002_indexes.sql`, `003_rls_policies.sql`, `004_seed_data.sql`.
3. **Authentication → Providers**: keep Email enabled. (Optional: turn off "Confirm email" while testing.)
4. **Authentication → URL Configuration**: add the address where you host the app (e.g. `https://yourname.github.io/performance-lab/`) to Site URL and Redirect URLs, so confirmation and reset-password emails return to the app.
5. **Project Settings → API**: copy the **Project URL** and the **publishable / anon key**. Never use the `service_role` or secret key — the app refuses it.

## 2. Connect the app

Either paste the two public values into `js/config.js`, or leave it blank: the first time you open the app it asks for them and stores them in that browser only.

## 3. Run locally

```bash
cd performance-lab
python3 -m http.server 8080      # then open http://localhost:8080
```
(The app uses ES modules, so it must be served over http — double-clicking `index.html` will not work.)

## 4. Deploy free (GitHub Pages)

Push this folder to a GitHub repository → **Settings → Pages → Deploy from branch → main / root**. Open the URL, then use "Add to Home screen" on Android/iPhone to install it.

## 5. Add friends

Send them the app URL. Each friend taps **Create account** with their own email. Row Level Security guarantees nobody can read or change anyone else's workouts, routines, measurements or notes. No admin action needed.

## Using the app

- **Home** — today's plan, start/resume, weekly strip, recent workouts and records.
- **Plan** — routines (create, duplicate, folders, archive), weekly calendar (week/month, rest days, assigned routines).
- **Workout** — start a routine or an empty workout. In the workout: tap the check to log a set (this starts the rest timer), tap the set number for type/RPE/RIR/left-right/notes, `⋯` on an exercise to replace, move, superset, skip or remove. Everything autosaves to your device instantly; the Undo button reverts structural edits.
- **Progress** — muscle-balance bubbles, weekly workouts and volume, strength charts, personal records, body weight and measurements, CSV export.
- **Profile** — details, units, equipment, rest default, week start, theme, reminders, plate calculator, data & sync, delete account.

## Offline and sync (how it stays safe)

- Every change is written to IndexedDB first, then queued. You can log a whole workout with no signal.
- Records have client-generated IDs, so retrying a sync never duplicates anything.
- Sessions carry a version number. If the server's copy changed on another device, the app shows a **conflict** (Profile → Data & sync) and lets you keep either copy — it never silently overwrites.
- Local data is only marked synced after the server confirms.
- The service worker caches the app itself (not your data, and never Supabase responses), so the app opens offline.
- Browsers may pause timers/notifications when the app is in the background; the timer is timestamp-based, so the displayed time is right when you return.

## Conventions (so numbers stay trustworthy)

- Stored in **kg and metres**; converted only for display. Switching kg/lb never changes saved data.
- Dumbbell weight = **one** dumbbell.
- Warm-up and unfinished sets never count towards volume, records, suggestions or muscle shares.
- Volume = load × reps for loaded exercises only (barbell/dumbbell/machine/added weight). Bodyweight, assisted and cardio are not summed into one figure.
- Estimated 1RM uses Epley (`weight × (1 + reps/30)`), only for 1–12 rep sets, always labelled an estimate.
- Muscle shares: primary muscle = 1 set, secondary = 0.5 set.
- Progression suggestion (double progression): suggests a small increase only after two sessions at the same weight, with every set at the top of the rep range in the latest one. It explains which sessions triggered it and never edits your routine.
- Goals are stored in your profile settings (the `user_goals` table is created for future use).

## Backups and export

Progress → download icon → CSV for sets, routines, body weight, measurements, records, or a full JSON backup. Profile → Export all my data / Data & sync → Download full backup gives the same JSON. Supabase also keeps your data server-side.

## Account deletion

Profile → Delete account calls the `delete_my_account()` database function created in `003_rls_policies.sql`, which removes your rows and your login. If the call fails the app tells you and does not claim success.

## Tests

```bash
node --test tests/*.test.mjs                       # calculation unit tests
python3 -m http.server 8080 &  node tests/e2e.mjs  # real-browser test with a mocked Supabase
```
`tests/rls_tests.sql` is the cross-account security check: create two users, paste their IDs, run it in the SQL editor — every "expect 0" line must return 0.

### Manual checklist
Sign up / sign in / sign out / reset password · onboarding · start routine and empty workout · log, edit, undo a set · rest timer skip/+15s · pause/resume · reload mid-workout · finish and review summary · routine unchanged afterwards · airplane mode: log sets, reconnect, confirm no duplicates · two accounts cannot see each other · export files open correctly · light and dark theme · keyboard focus visible · reduced-motion respected.

## Not implemented / needs setup

- **Progress photos** (private Storage bucket) — not built yet; the table exists.
- **Cardio incline / heart rate** are not separate fields (use set notes).
- **Reminders** use browser notifications only while the app is open; no background push.
- **CSV import**, voice logging, accountability groups, annual recap, adaptive weekly planning, equipment-occupied suggestions — future work.
- **Email confirmation / password-reset emails** depend on your Supabase project's email settings (the free tier has a low email rate limit).
- Free-tier limits apply (Supabase: 500 MB database, pauses after a week of inactivity — open the app or the dashboard to wake it).
