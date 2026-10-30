# MediFlow Hospital Dashboard

Design a professional admin dashboard for a hospital management system called MediFlow, in a dark-theme style similar to the attached reference: dark charcoal background, vibrant gradient stat cards (teal, yellow, pink, purple), clean sans-serif typography, rounded cards with soft shadows, a persistent left sidebar nav, and a top bar with search, notifications, and profile.

Sidebar navigation sections: Dashboard, Appointments, Patients, Doctors & Staff, Departments, Billing & Claims, Audit Log, Analytics, Settings.

PAGE 1 — Dashboard (overview)

Top stat cards row (4 gradient cards like the reference): Total Patients, Total Appointments, Total Revenue (this month), Pending SHA Claims — each with a percentage change vs last month.

Two-column layout below:

Left: Revenue trend chart (toggle “By Payment Method” / “By Department”), payment method donut chart (SHA / M-Pesa / Cash split), Staff & Patient Management table (searchable, filterable, with Advance Filter button and row checkboxes, like the reference)
Right: Today’s schedule strip (mini calendar, upcoming bookings), a small Claims preview (3–4 most urgent, “See All” → links to the Billing & Claims page), a small Audit Log preview (last 3–4 actions, “See All” → links to the Audit Log page)

PAGE 2 — Billing & Claims (full page)

Top summary cards: Total Revenue This Month, SHA Pending, SHA Approved, Cash Collected Today
Tabbed or segmented view: All Invoices | SHA Claims Tracker | Reconciliation
All Invoices tab: full table — Invoice ID, Patient, Doctor, Amount, Payment Method (badge: SHA/M-Pesa/Cash), Status (paid/pending/voided), Date, Actions (view/void)
SHA Claims Tracker tab: table — Claim ID, Patient, Amount, Submitted Date, Status badge (submitted/under review/approved/rejected), Days Pending (highlight in red/orange if aging past threshold), Resubmit action for rejected claims
Reconciliation tab: daily cash reconciliation view — cash logged by receptionist vs system total, with discrepancy flagging
Filters across all tabs: date range, payment method, status, department

PAGE 3 — Audit Log (full page)

Filterable, searchable table: Timestamp, User (name + role), Action (e.g. “Voided invoice #1182”, “Edited patient record #4021”, “Approved SHA claim #332”), Record Affected, IP/Device (optional)
Filters: by user, by action type, by date range, by role
Color-coded action types (e.g., red for voids/deletes, blue for edits, green for approvals) for fast scanning
Export button (CSV) for compliance reporting

Visual/interaction details (apply across all pages):

Status badges color-coded consistently app-wide (matching the reference’s green/red status style)
Keep it realistic: populate with sample hospital data (patient names, departments like Cardiology/Pediatrics/Maternity) so it reads as a working product, not a template
Fully responsive for tablet use at the front desk

Design these as complete, polished screens — not wireframes. Only frontend, don't implement any backend

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/17aa470a-c65c-4e37-b6d1-742ccc8d7cca).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
