MediFlow — Product Requirements Document
Version 1.0 (Draft) · November 2026 · Product: Hospital Management and Telehealth Platform
1. Overview
MediFlow is a role-based hospital management platform that covers the full patient journey: registration, appointment booking, consultation, prescription, billing (SHA, M-Pesa, cash), follow-up, and management reporting. It joins a staff-facing operations back office (billing, claims, audit, analytics) with a patient-facing experience, and layers AI features on top to reduce clinician and front-desk workload.
It is designed for the Kenyan hospital context and built to production-minded standards so that a small to mid-sized hospital could realistically adopt it. It is also a portfolio piece, so the architecture, security work and documentation are first-class deliverables.
2. Problem Statement
Many hospitals still run on paper registers, spreadsheets, separate M-Pesa statements and manual insurance follow-up. The consequences are predictable:
• Patient data is fragmented across reception, the doctor and billing, so the same details are re-entered several times.
• SHA claims are submitted late, lost, or never followed up, which locks up hospital revenue.
• Cash handling has weak controls and no reliable audit trail.
• Management has no real-time view of revenue, claim status or doctor workload.
• Patients face long queues, missed appointments and no reminders.
MediFlow replaces this with one system of record and one billing model that works for every payment method.
3. Goals and Non-Goals
3.1 Goals
• G1: One patient record shared safely across reception, doctor and billing.
• G2: Support three payment paths (SHA, M-Pesa and other digital payments, cash) through a single Invoice and Transaction model.
• G3: Verify SHA eligibility at billing, create the claim, and track it through to payment with automated follow-up on aging claims.
• G4: Enforce role-scoped data access at the API layer, not just in the UI.
• G5: Use AI where it saves real time: triage, visit summaries, no-show risk, and natural-language reporting.
• G6: Automate patient communication through WhatsApp and email.
• G7: Keep a complete, tamper-resistant audit trail of sensitive actions.
• G8: Give admins and doctors live visibility into revenue and operational metrics.
3.2 Non-Goals (v1)
• Inpatient ward and bed management, pharmacy stock, and laboratory information systems.
• Live production integration with SHA systems (v1 uses an adapter with a simulated implementation; see Section 10).
• Full HL7/FHIR interoperability (a single FHIR-style export endpoint is a stretch goal).
• Native mobile apps (the web app is responsive instead).
• Live video consultations (v1 supports async messaging only; video is a later phase).
• Multi-branch or multi-tenant hospital groups.
4. Users and Personas
Persona
Role
Main needs
Amina, 28, patient
Patient
Book quickly, get WhatsApp reminders, pay by M-Pesa, see her history and receipts
Dr. Otieno, general practitioner
Doctor
See today's queue, open a patient's history in seconds, write notes and prescriptions fast, see own stats
Grace, front desk
Receptionist
Register walk-ins, check patients in, verify SHA, collect payment, never lose a record
Mr. Kamau, hospital administrator
Admin
Revenue and claims visibility, staff and pricing control, audit and compliance reports
A dedicated Cashier/Billing Officer role is a P1 addition: it is a receptionist-level account with billing permissions but no registration permissions.
5. Role Permissions Matrix
Capability
Patient
Doctor
Receptionist
Admin
Register patients
Self-register
No
Yes
Yes
Book, reschedule, cancel appointments
Own
Adjust own availability
Any patient
Any
View demographics and contact details
Own
Patients they treat
Yes
Yes
View clinical notes, diagnoses, labs
Own
Patients they treat (access logged)
No
Read-only (logged)
Write notes and prescriptions
No
Yes
No
No
Create invoice, record payment
Pay own invoices
No
Yes
Yes
Void or refund
No
No
Request
Approve
SHA verification and claims
No
View status
Verify, create claims
Full control
Revenue analytics
No
Own consultations only
Daily cash view
Full
User, price and department management
No
No
No
Yes
Audit log
No
No
No
Yes
All rules are enforced in the API. Hiding a button in the UI never counts as access control.
6. Key User Journeys
6.1 Walk-in patient paying with SHA
1.  Receptionist searches for the patient; if new, registers them and records the SHA number.
2.  Receptionist creates a same-day walk-in appointment for the chosen department or doctor; it starts as checked-in and joins the queue.
3.  Patient is called in; the doctor opens the record, records the consultation and issues prescriptions.
4.  At billing, the system generates the invoice and the receptionist selects Pay via SHA.
5.  The system verifies the member's SHA status and coverage limit.
6.  If active, a Claim is created (status: submitted). If SHA covers only part of the cost, the invoice is split between SHA and a patient co-pay.
7.  The claim moves through under review, approved or rejected, then paid. The claims tracker flags claims that age past thresholds so an admin can follow up.
8.  If SHA is not active, the system prompts the receptionist to switch to M-Pesa or cash.
6.2 Patient paying by M-Pesa
1.  Receptionist selects M-Pesa and enters the patient's phone number, which triggers an STK push.
2.  The Daraja callback is matched to the invoice using the checkout request ID.
3.  On success the transaction is recorded, the invoice is marked paid, and a PDF receipt is sent by email and WhatsApp.
4.  If the callback fails or times out, the transaction is marked Unconfirmed and appears in a reconciliation queue for manual resolution.
5.  Patients who pay directly to the hospital Paybill or Till are captured through payment confirmation notifications and matched by account reference (P1).
6.3 Patient paying cash
1.  Receptionist or cashier selects Cash and enters the amount tendered.
2.  The system generates the invoice and receipt immediately, calculates change, and records who took the payment and when.
3.  Cash totals feed the daily reconciliation view.
6.4 Patient self-service booking with AI triage
1.  Patient describes symptoms to the triage assistant.
2.  The assistant suggests a department, an urgency level and available doctors. It never gives a diagnosis, and any red-flag symptoms trigger an emergency-care message.
3.  Patient picks a slot and confirms. Booking confirmation and reminders go out by WhatsApp and email.
6.5 Rejected claim follow-up
1.  A claim returns rejected with a reason.
2.  Admin opens the claim, corrects the data or attaches missing documents, and resubmits.
3.  Every status change is recorded in the claim history and the audit log.
7. Functional Requirements
Priorities: P0 = required for v1 launch, P1 = important and planned for v1, P2 = stretch or later.
7.1 Authentication and Access (AUTH)
ID
Requirement
Priority
AUTH-1
Email and password login with short-lived JWT access tokens and refresh tokens
P0
AUTH-2
Role-based access control enforced on every API endpoint
P0
AUTH-3
Admin creates and deactivates staff accounts; patients self-register with email or phone verification
P0
AUTH-4
Password reset by email; automatic logout after inactivity (15 minutes for staff)
P0
AUTH-5
Optional two-factor authentication for admins and doctors
P2
7.2 Patient Management (PAT)
ID
Requirement
Priority
PAT-1
Register a patient: name, date of birth, sex, ID or birth certificate number, phone, email, address, next of kin
P0
PAT-2
Auto-generated unique patient number
P0
PAT-3
Allergies, chronic conditions and current medications, flagged prominently wherever the patient appears
P0
PAT-4
Store SHA number and insurance details on the profile
P0
PAT-5
Search by name, patient number or phone
P0
PAT-6
Record consent for WhatsApp and email notifications
P0
PAT-7
Duplicate detection on name, date of birth and phone
P1
7.3 Appointments and Queue (APT)
ID
Requirement
Priority
APT-1
Department and service catalogue with prices
P0
APT-2
Doctor availability templates with exceptions (leave, blocked slots)
P0
APT-3
Slot booking with double-booking prevention
P0
APT-4
Reschedule and cancel with configurable cut-off rules
P0
APT-5
Receptionist creates a same-day walk-in appointment, registering the patient first if new, with status checked-in
P0
APT-6
Status lifecycle: scheduled, checked-in, in-consultation, completed, no-show, cancelled
P0
APT-7
Live queue per doctor, ordered by slot time for booked patients and by arrival time for walk-ins, with an urgent-priority flag that overrides both
P1
7.4 Consultation and Records (EMR)
ID
Requirement
Priority
EMR-1
Visit record: presenting complaint, vitals, notes, diagnosis, plan
P0
EMR-2
Structured prescriptions: drug, dose, frequency, duration, instructions
P0
EMR-3
Upload lab reports and scans (PDF, JPG, PNG; up to 10 MB) to encrypted object storage with signed URLs
P0
EMR-4
Chronological patient timeline of visits, prescriptions and uploads
P0
EMR-5
Follow-up scheduling from within a visit, creating an appointment with source follow-up
P1
EMR-6
Referral letter generation as PDF
P1
7.5 AI Features (AI)
ID
Requirement
Priority
AI-1
Triage assistant that suggests department and urgency from symptoms, with emergency red-flag handling
P1
AI-2
Visit summary generated from doctor notes; the doctor reviews and edits before it is saved
P1
AI-3
No-show risk score from appointment history, shown to reception
P1
AI-4
Natural-language admin queries such as: show certifications or claims over 30 days old, translated into allowlisted, read-only queries
P2
AI-5
Doctor suggestion based on symptoms and availability
P2
Guardrails are specified in Section 11.
7.6 Billing and Claims (BIL)
ID
Requirement
Priority
BIL-1
Invoice created from the visit and service price list, with sequential invoice numbers
P0
BIL-2
Single data model: Invoice, InvoiceLine, Transaction, Claim, regardless of payment method
P0
BIL-3
Cash payments: amount tendered, change, staff attribution, instant receipt
P0
BIL-4
M-Pesa STK push, idempotent callback handling, Unconfirmed state with manual reconciliation
P0
BIL-5
SHA eligibility verification before claim creation
P0
BIL-6
Claim lifecycle: submitted, under review, approved or rejected, paid; full status history
P0
BIL-7
Split billing: SHA portion plus patient co-pay on one invoice
P0
BIL-8
If SHA is inactive or limits are exhausted, prompt for an alternative payment method and convert to self-pay
P0
BIL-9
Claims aging tracker with thresholds (for example 14, 30 and 60 days), highlighting and reminders
P0
BIL-10
Void and refund require admin approval and a mandatory reason; nothing is ever hard-deleted
P0
BIL-11
Invoice and receipt PDFs delivered by email and WhatsApp
P0
BIL-12
Edit and resubmit rejected claims with reason capture
P1
BIL-13
Partial payments and outstanding balance tracking
P1
BIL-14
Daily cash reconciliation: cash logged against system total, with discrepancy flags
P1
BIL-15
Capture of Paybill or Till payments matched by account reference
P1
7.7 Notifications (NTF)
ID
Requirement
Priority
NTF-1
One central notification service that all modules call; templates, retries and a delivery log
P0
NTF-2
Events: booking confirmation, 24-hour and 2-hour reminders, prescription ready, invoice and receipt, appointment changes
P0
NTF-3
WhatsApp through approved templates, email through a transactional provider, with email fallback if WhatsApp fails
P0
NTF-4
Respect patient consent and opt-out
P0
NTF-5
Staff alerts: aging claims, failed M-Pesa callbacks, unusual cash variance
P1
7.8 Analytics and Reporting (ANL)
ID
Requirement
Priority
ANL-1
Admin: revenue by payment method, doctor, department and month
P0
ANL-2
Claims report: totals by status, aging buckets, approval rate, average days to payment
P0
ANL-3
Doctor view: own monthly revenue, patients seen, average consultation time
P0
ANL-4
Patient volume, no-show rate and doctor utilization
P1
ANL-5
CSV and PDF export
P1
7.9 Audit Logging (AUD)
ID
Requirement
Priority
AUD-1
Append-only log: who, role, action, entity, before and after values, timestamp, IP and device
P0
AUD-2
Log every read of a clinical record, not only edits
P0
AUD-3
Admin audit page with filters (user, action, role, date range) and CSV export
P0
AUD-4
Database permissions that prevent the application from updating or deleting audit rows
P1
7.10 Administration (ADM)
ID
Requirement
Priority
ADM-1
Manage users, roles and activation status
P0
ADM-2
Manage departments, services and price lists
P0
ADM-3
Hospital profile, invoice branding and numbering settings
P1
ADM-4
Edit notification templates
P1
8. Role Dashboards
Patient
Upcoming appointments, book or reschedule, AI triage chat, medical history and prescriptions, uploaded results, invoices and payment, notification preferences.
Doctor
Today's queue (walk-ins visually distinct), quick patient search, schedule and availability management, recent consultations with AI summaries, stats strip (patients seen, average consultation time, this month's revenue from own consultations), alerts for new results. The patient record view has an allergy banner, tabs for history, labs, prescriptions and notes, an AI summary button, and a structured prescription writer.
Receptionist
Registration, same-day queue and check-in, booking on behalf of patients, billing screen with payment method selection and SHA verification, today's cash summary, no-show risk flags.
Admin
Dark-theme operations dashboard with gradient stat cards (patients, appointments, revenue, pending SHA claims), revenue trend and payment-method breakdown, staff and patient management table, today's schedule, claims and audit previews. Dedicated full pages:
• Billing and Claims: All Invoices, SHA Claims Tracker, Reconciliation.
• Audit Log: filterable, searchable, exportable.
• Plus Appointments, Patients, Doctors and Staff, Departments, Analytics and Settings.
9. Data Model (Key Entities)
• User (id, email, password hash, role, status, last login)
• PatientProfile (patient number, demographics, allergies, conditions, SHA number, next of kin, consent flags)
• DoctorProfile (user, department, specialty, license number, consultation fee)
• Department, Service (name, price, department)
• AvailabilityRule and AvailabilityException
• Appointment (patient, doctor, service, slot (empty for walk-ins), arrived_at, status, source: online, reception, walk-in or follow-up, no-show score)
• Visit (appointment, vitals, notes, diagnosis, plan, AI summary, summary approved flag)
• Prescription and PrescriptionItem
• Attachment (visit, type, storage key, uploader)
• Invoice (number, patient, visit, total, balance, status, primary method)
• InvoiceLine (service, quantity, unit price)
• Transaction (invoice, method, amount, reference, status, recorded by, timestamp)
• Claim (invoice, SHA member reference, claimed amount, approved amount, status, submitted at, rejection reason)
• ClaimStatusHistory (claim, from, to, actor, note, timestamp)
• VoidRequest (invoice or transaction, reason, requested by, approved by)
• Notification (recipient, channel, template, status, provider reference, attempts)
• ConsentRecord (patient, channel, granted, timestamp)
• AuditLog (actor, role, action, entity type and id, before and after, IP, user agent, timestamp)
Key rules: money values are stored as integer minor units or fixed-precision decimals (never floats); invoices and transactions are never deleted, only voided; every table has created and updated timestamps.
10. Integrations
Integration
Purpose
Notes
Anthropic Claude API
Triage, visit summaries, natural-language queries
Called from the backend only; API key never reaches the browser
M-Pesa Daraja
STK push, callbacks, optional Paybill or Till confirmations
Sandbox for development; production needs Safaricom go-live approval and a hospital shortcode
SHA
Member eligibility check and claim submission
Built behind an adapter interface (verify_member, submit_claim). v1 ships a simulated implementation. Real integration depends on the hospital's accreditation and SHA API access, to be confirmed
Twilio WhatsApp
Reminders, receipts, prescription alerts
Requires approved message templates
Resend or SendGrid
Transactional email
Used for receipts, confirmations, referral letters and fallback
S3-compatible storage
Lab reports, scans, generated PDFs
Private bucket, encrypted, access through short-lived signed URLs
FHIR-style endpoint
Demonstrate interoperability
Optional export of patient and encounter data as FHIR JSON (P2)
All external calls go through adapter modules with timeouts, retries and logging, so any provider can be swapped or mocked in tests.
11. AI Design and Guardrails
• Assistive only: AI never diagnoses, prescribes, or changes a record on its own. Doctors review and approve summaries before they are stored.
• Triage safety: the assistant suggests a department and urgency, includes a visible not-a-diagnosis notice, and shows an emergency instruction for red-flag symptoms such as chest pain, severe bleeding or difficulty breathing.
• Data minimization: only the fields needed for the task are sent to the model. Names, phone numbers and national ID numbers are removed or masked before prompts are built.
• Natural-language admin queries never run model-written SQL. The model selects from a fixed allowlist of parameterized report functions that are read-only and role-checked.
• Every AI interaction is logged (inputs summarized, output, user, timestamp) and flagged as AI-generated in the UI.
• Graceful degradation: if the AI service is unavailable, every workflow still works manually.
• Evaluation: a small test set of sample symptom descriptions with expected departments, run before each release.
12. Non-Functional Requirements
Security and privacy
• TLS everywhere; encryption at rest for the database, object storage and especially sensitive fields.
• Passwords hashed with a modern algorithm (argon2 or bcrypt); rate limiting and lockout on login.
• Input validation on every endpoint; protections against injection, XSS and CSRF aligned with the OWASP Top 10.
• Secrets in environment configuration, never in the repository; dependency vulnerability scanning in CI.
• Webhook endpoints (M-Pesa) validated and idempotent.
• Alignment with the Kenya Data Protection Act, 2019: lawful basis and consent capture, data minimization, retention rules, and support for access and correction requests. Confirm legal requirements with a qualified adviser before any real deployment.
Performance and reliability
• Typical API reads under 500 ms at the 95th percentile; dashboards load within 2 seconds on seeded data.
• Daily database backups with a tested restore procedure.
• Background jobs for notifications, reminders and claim-aging checks, so the request path stays fast.
Usability and accessibility
• Responsive for desktop and tablet; usable on mobile for patients.
• WCAG 2.1 AA contrast and keyboard navigation for core flows.
• Consistent status colors and badges across the app.
Quality
• Automated tests for the most critical paths: RBAC enforcement, invoice and payment logic, M-Pesa callback matching, claim status transitions.
• CI on every push (lint, tests, build); structured logging and error tracking in deployed environments.
13. Technical Architecture
• Frontend: Next.js (React) with role-based routing and layouts.
• Backend: Flask REST API with SQLAlchemy and Alembic migrations, documented through OpenAPI. FastAPI is an acceptable alternative if chosen in Phase 0.
• Database: PostgreSQL.
• Background jobs: Redis with Celery or RQ for reminders, notifications, claim-aging checks and PDF generation.
• Storage: S3-compatible private bucket.
• Deployment: managed hosting such as Render, Railway or Vercel, with managed Postgres; separate dev, staging and production environments.
• CI/CD: GitHub Actions.
Backend layout follows modules that mirror Section 7 (auth, patients, appointments, records, billing, notifications, analytics, audit), with integrations isolated in adapter packages.
14. Success Metrics
Product and operations (targets for a hospital pilot)
• Invoice generated within 10 seconds of the doctor completing a visit.
• At least 95% of M-Pesa payments auto-matched without manual reconciliation.
• No SHA claim sits in submitted or under review beyond the aging threshold without an alert and an owner.
• No-show rate reduced after reminders and risk flagging.
• Reception registration time for a returning patient under 30 seconds.
AI
• Doctors accept or lightly edit at least 80% of generated visit summaries.
• Triage suggests the expected department on at least 80% of the evaluation set.
Portfolio
• Deployed demo with realistic seeded data and demo accounts for each role.
• README that explains the architecture, AI design decisions, billing logic and hardening work.
• Passing CI and tests on the critical paths above.
15. Release Plan
Milestone
Scope
Target
M0 Foundation
Repo, schema, auth, RBAC, CI, environment config
Weeks 1–2
M1 Core flow
Patient registration, availability, booking, reception queue and check-in
Weeks 3–4
M2 Consultations
Visit records, prescriptions, uploads, patient timeline
Weeks 5–6
M3 AI
Triage assistant, visit summaries, no-show scoring
Weeks 7–8
M4 Billing and Claims
Unified invoice model, cash, M-Pesa, SHA claims, aging tracker, void workflow
Weeks 9–10
M5 Notifications
Central notification service, WhatsApp and email
Week 11
M6 Analytics
Admin and doctor dashboards, exports
Week 12
M7 Hardening
Audit log completion, rate limiting, encryption, access review, compliance notes
Week 13
M8 Launch
Deployment, seed data, README, demo walkthrough
Week 14
Each milestone ends with a deployed, demoable build.
16. Risks and Mitigations
Risk
Impact
Mitigation
SHA API access requires accreditation
Cannot test real eligibility and claims
Adapter interface with a realistic simulator; clearly label the demo as simulated
M-Pesa production approval takes time
Delays live payments
Build and demo on the Daraja sandbox; keep reconciliation flows complete
WhatsApp template approval delays
Notifications launch late
Email as fallback channel; submit templates early
AI gives unsafe or misleading output
Patient harm, trust loss
Assistive-only design, red-flag handling, doctor review, evaluation set
Patient data exposed to the AI provider
Privacy breach
Minimization and masking, backend-only calls, logging
Scope creep
Project stalls
Strict P0 first; P1 and P2 only after each milestone is shippable
Single developer
Slow delivery and no code review
Small milestones, automated tests, written decisions in a changelog
17. Open Questions
• Will SHA stay simulated for v1, or is a real hospital partner available for sandbox access?
• Are card payments (Stripe or Paystack) in scope alongside M-Pesa, or deferred?
• Must invoices integrate with KRA eTIMS for the target hospital? Confirm with the hospital's accountant.
• Is multi-branch support needed after v1?
• Should the patient interface support Swahili as well as English?
• Which lab or radiology file types and sizes are most common in practice?
18. Glossary
• SHA: Social Health Authority, Kenya's national health insurance scheme.
• EMR/EHR: Electronic medical or health record.
• STK push: M-Pesa prompt sent to a customer's phone to approve a payment.
• Daraja: Safaricom's M-Pesa API platform.
• RBAC: Role-based access control.
• PHI: Protected health information.
• FHIR and HL7: Healthcare data exchange standards.
• Co-pay: The portion of a bill the patient pays when insurance covers only part of it.