# Routes

TanStack Start uses **file-based routing**. Every `.tsx` file in this directory
defines a route. Do **not** create `src/pages/`, `src/routes/_app/index.tsx`, or
`app/layout.tsx` — those are Next.js / Remix conventions. The only root layout
is `src/routes/__root.tsx`.

## Conventions

| File | URL |
| --- | --- |
| `index.tsx` | `/` |
| `about.tsx` | `/about` |
| `users/index.tsx` | `/users` |
| `users/$id.tsx` | `/users/:id` (dynamic — bare `$`, no curly braces) |
| `posts/{-$category}.tsx` | `/posts/:category?` (optional segment) |
| `files/$.tsx` | `/files/*` (splat — read via `_splat` param, never `*`) |
| `_layout.tsx` | layout route (renders children via `<Outlet />`) |
| `__root.tsx` | app shell — wraps every page; preserve `<Outlet />` |

`routeTree.gen.ts` is auto-generated. Don't edit it by hand.

## Role-based route structure

Each role owns a pathless-in-URL directory route with its own layout (`route.tsx`)
and navigation. The layout wraps every page in that role with `AppShell` and the
shared `TopBarActions` component.

| Area | Layout | Home | Pages |
| --- | --- | --- | --- |
| Auth | `auth/route.tsx` | `/auth/login` | login, register, forgot-password, reset-password, verify |
| Admin | `admin/route.tsx` | `/admin` | dashboard, appointments, patients, visits, staff, departments, billing, claims, audit-log, analytics, notifications, ai, settings |
| Doctor | `doctor/route.tsx` | `/doctor` | queue, appointments, patients, consultations, availability, reports, ai, notifications, settings |
| Receptionist | `receptionist/route.tsx` | `/receptionist` | patients, appointments, queue, billing, claims, notifications, settings |
| Cashier | `cashier/route.tsx` | `/cashier` | invoices, payments, reconciliation, refunds, notifications, settings |
| Patient | `patient/route.tsx` | `/patient` | appointments, book, triage, records, prescriptions, results, invoices, notifications, settings |

`src/routes/index.tsx` redirects to `/auth/login`. When authentication is wired
up, replace that redirect with a session check and send each role to its home
from `src/lib/navigation.ts`. New role pages should follow the same
`<area>/route.tsx` + `<area>/<page>.tsx` pattern so the generated route tree,
navigation config and layouts stay aligned.
