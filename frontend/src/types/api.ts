export type Role = "ADMIN" | "DOCTOR" | "RECEPTIONIST" | "CASHIER" | "PATIENT";
export type UserStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED" | "PENDING_VERIFICATION";

export type AuthUser = {
  id: string;
  email: string | null;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  full_name: string;
  role: Role;
  status: UserStatus;
  email_verified: boolean;
  phone_verified: boolean;
  patient_id: string | null;
  doctor_id: string | null;
};

export type AuthTokens = {
  access_token: string;
  refresh_token: string;
  token_type: "Bearer";
  expires_in: number;
  user: AuthUser;
};

export type PaginationMeta = {
  page: number;
  per_page: number;
  page_size: number;
  total: number;
  pages: number;
};

export type Paginated<T> = {
  items: T[];
  meta: PaginationMeta;
};

export type ListParams = {
  page?: number | undefined;
  page_size?: number | undefined;
  sort?: string | undefined;
  q?: string | undefined;
  [key: string]: string | number | boolean | undefined;
};

export type DashboardChange = { value: number; change_pct: number | null };
export type DashboardMoneyChange = { value_minor: number; change_pct: number | null };

export type DashboardRevenueMonth = {
  month: string;
  total_minor: number;
  [method: string]: string | number;
};

export type DashboardSummary = {
  as_of: string;
  stats: {
    total_patients: DashboardChange;
    appointments_today: DashboardChange;
    revenue_month_minor: DashboardMoneyChange;
    pending_claims: DashboardChange;
    pending_voids: { value: number };
    pending_refunds: { value: number };
  };
  revenue_trend: {
    months: string[];
    methods: string[];
    departments: string[];
    by_method: DashboardRevenueMonth[];
    by_department: DashboardRevenueMonth[];
  };
  payment_split: { method: string; amount_minor: number; percentage: number }[];
  today_schedule: Appointment[];
  recent_claims: Claim[];
  recent_audit: AuditEntry[];
};

export type InvoiceStatus = "DRAFT" | "ISSUED" | "PARTIALLY_PAID" | "PAID" | "VOIDED" | "REFUNDED";
export type PaymentMethod = "SHA" | "MPESA" | "CASH" | "CARD" | "BANK" | "SELF_PAY";
export type TransactionStatus = "PENDING" | "SUCCESS" | "FAILED" | "UNCONFIRMED" | "REVERSED";
export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "COMPLETED";
export type CashReconciliationStatus = "OPEN" | "BALANCED" | "DISCREPANCY";

export type InvoiceLine = {
  id: string;
  service_id: string | null;
  description: string;
  service_code: string | null;
  quantity: number;
  unit_price_minor: number;
  line_total_minor: number;
};

export type InvoiceAllocation = {
  id: string;
  payer: "PATIENT" | "SHA" | "INSURANCE";
  amount_minor: number;
  status: "PENDING" | "PAID" | "VOIDED";
  external_reference: string | null;
};

export type Invoice = {
  id: string;
  invoice_number: string;
  patient_id: string;
  patient_name: string | null;
  patient_number: string | null;
  visit_id: string | null;
  doctor_name: string | null;
  department_id: string | null;
  department_name: string | null;
  currency: string;
  subtotal_minor: number;
  discount_minor: number;
  total_minor: number;
  amount_paid_minor: number;
  balance_minor: number;
  status: InvoiceStatus;
  primary_method: PaymentMethod | null;
  issued_at: string | null;
  due_at: string | null;
  created_at: string;
  lines: InvoiceLine[];
  allocations: InvoiceAllocation[];
};

export type Transaction = {
  id: string;
  invoice_id: string;
  invoice_number: string | null;
  patient_name: string | null;
  allocation_id: string | null;
  method: PaymentMethod;
  amount_minor: number;
  tendered_minor: number | null;
  change_minor: number | null;
  currency: string;
  status: TransactionStatus;
  reference: string | null;
  provider_reference: string | null;
  paid_at: string | null;
  created_at: string;
  notes: string | null;
};

export type PaymentIntent = {
  id: string;
  invoice_id: string;
  method: PaymentMethod;
  amount_minor: number;
  phone: string | null;
  checkout_request_id: string | null;
  merchant_request_id: string | null;
  status: "PENDING" | "SUCCESS" | "FAILED" | "TIMEOUT" | "UNCONFIRMED";
  created_at: string;
};

export type VoidRequest = {
  id: string;
  invoice_id: string | null;
  invoice_number: string | null;
  patient_name: string | null;
  transaction_id: string | null;
  reason: string;
  status: ApprovalStatus;
  requested_by_id: string;
  requested_by_name: string | null;
  reviewed_by_id: string | null;
  reviewed_by_name: string | null;
  decision_reason: string | null;
  decided_at: string | null;
  created_at: string;
};

export type Refund = {
  id: string;
  invoice_id: string;
  invoice_number: string | null;
  patient_name: string | null;
  original_transaction_id: string;
  requested_by_name: string | null;
  approved_by_name: string | null;
  amount_minor: number;
  reason: string;
  status: ApprovalStatus;
  requested_by_id: string;
  approved_by_id: string | null;
  decided_at: string | null;
  created_at: string;
};

export type CashReconciliation = {
  id: string;
  business_date: string;
  expected_cash_minor: number;
  counted_cash_minor: number;
  variance_minor: number;
  status: CashReconciliationStatus;
  notes: string | null;
};

export type CashSummary = {
  business_date: string;
  methods: { method: PaymentMethod; amount_minor: number; count: number }[];
  cash_expected_minor: number;
};

export type ClaimStatus =
  "DRAFT" | "SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "REJECTED" | "PAID" | "CANCELLED";

export type ClaimHistory = {
  id: string;
  from_status: ClaimStatus | null;
  to_status: ClaimStatus;
  note: string | null;
  created_at: string;
};

export type Claim = {
  id: string;
  invoice_id: string;
  invoice_number: string | null;
  patient_name: string | null;
  patient_number: string | null;
  department_name: string | null;
  allocation_id: string | null;
  patient_id: string;
  eligibility_check_id: string | null;
  claimed_amount_minor: number;
  approved_amount_minor: number | null;
  currency: string;
  status: ClaimStatus;
  external_reference: string | null;
  submitted_at: string | null;
  decided_at: string | null;
  paid_at: string | null;
  rejection_reason: string | null;
  resubmission_of_id: string | null;
  age_days: number | null;
  history: ClaimHistory[];
};

export type ClaimAgingReport = {
  total_claims: number;
  by_status: Record<string, number>;
  aging_buckets: Record<string, number>;
  approval_rate: number | null;
  average_days_to_payment: number | null;
};

export type EligibilityCheck = {
  id: string;
  patient_id: string;
  invoice_id: string | null;
  status: "ACTIVE" | "INACTIVE" | "LIMIT_EXHAUSTED" | "UNKNOWN";
  coverage_limit_minor: number | null;
  consumed_minor: number | null;
  provider: string;
  provider_reference: string | null;
  checked_at: string;
};

export type AuditEntry = {
  id: string;
  actor_user_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  request_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string | null;
};

export type PatientBrief = {
  id: string;
  patient_number: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  sex: "MALE" | "FEMALE" | "OTHER" | "UNKNOWN";
  phone: string;
  allergies: string | null;
};

export type Patient = PatientBrief & {
  user_id: string | null;
  middle_name: string | null;
  email: string | null;
  address: string | null;
  next_of_kin_name: string | null;
  next_of_kin_phone: string | null;
  next_of_kin_relationship: string | null;
  sha_number: string | null;
  insurance_provider: string | null;
  insurance_member_number: string | null;
  chronic_conditions: string | null;
  current_medications: string | null;
  blood_group: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type StaffUser = AuthUser & {
  created_at?: string;
  doctor_profile?: Doctor | null;
};

export type Department = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  is_active: boolean;
};

export type Service = {
  id: string;
  department_id: string;
  name: string;
  code: string;
  description: string | null;
  is_active: boolean;
  current_price_minor: number | null;
  currency: string;
};

export type Doctor = {
  id: string;
  user_id: string;
  name: string | null;
  department_id: string;
  specialty: string | null;
  license_number: string;
  consultation_fee_minor: number;
  is_accepting_appointments: boolean;
  bio: string | null;
};

export type AppointmentStatus =
  "SCHEDULED" | "CHECKED_IN" | "IN_CONSULTATION" | "COMPLETED" | "NO_SHOW" | "CANCELLED";
export type AppointmentSource = "ONLINE" | "RECEPTION" | "WALK_IN";
export type Urgency = "ROUTINE" | "URGENT" | "EMERGENCY";

export type Appointment = {
  id: string;
  patient_id: string;
  patient_name: string | null;
  patient_number: string | null;
  doctor_id: string;
  doctor_name: string | null;
  service_id: string | null;
  service_name: string | null;
  department_id: string | null;
  department_name: string | null;
  scheduled_start: string;
  scheduled_end: string;
  status: AppointmentStatus;
  source: AppointmentSource;
  urgency: Urgency;
  no_show_score: number | null;
  checked_in_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  notes: string | null;
  rescheduled_from_id: string | null;
  created_at: string;
};

export type Visit = {
  id: string;
  appointment_id: string | null;
  patient_id: string;
  patient_name: string | null;
  patient_number: string | null;
  doctor_id: string;
  doctor_name: string | null;
  department_id: string | null;
  department_name: string | null;
  vitals: Record<string, unknown>;
  follow_up_date: string | null;
  ai_summary_approved: boolean;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  presenting_complaint?: string | null;
  notes?: string | null;
  diagnosis?: string | null;
  plan?: string | null;
  ai_summary?: string | null;
};

export type NotificationChannel = "WHATSAPP" | "EMAIL" | "SMS" | "IN_APP";
export type NotificationStatus =
  "QUEUED" | "SENDING" | "SENT" | "DELIVERED" | "FAILED" | "CANCELLED";

export type Notification = {
  id: string;
  channel: NotificationChannel;
  template_key: string;
  status: NotificationStatus;
  attempts: number;
  scheduled_at: string | null;
  sent_at: string | null;
  last_error: string | null;
  created_at: string | null;
  attempts_log: {
    attempt_number: number;
    status: "SUCCESS" | "FAILED";
    error_class: string | null;
    attempted_at: string;
  }[];
};

export type NotificationTemplate = {
  id: string;
  key: string;
  channel: NotificationChannel;
  name: string;
  subject: string | null;
  body: string;
  whatsapp_template_name: string | null;
  version: number;
  is_active: boolean;
};

export type AIFeature =
  "TRIAGE" | "VISIT_SUMMARY" | "NO_SHOW_RISK" | "REPORT_QUERY" | "DOCTOR_SUGGESTION";
export type AIStatus = "DRAFT" | "COMPLETED" | "APPROVED" | "FAILED";

export type AIInteraction = {
  id: string;
  feature: AIFeature;
  input_summary: string;
  output: Record<string, unknown>;
  status: AIStatus;
  approved: boolean;
  provider: string;
  model: string | null;
  created_at: string | null;
};

export type ReportExport = {
  id: string;
  report_key: string;
  format: "CSV" | "PDF";
  status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";
  parameters: Record<string, unknown>;
  error_message: string | null;
  created_at: string | null;
  completed_at: string | null;
};

export type RevenueReport = {
  group_by: string;
  start_date: string;
  end_date: string;
  total_minor: number;
  groups: { key: string; amount_minor: number; transaction_count: number }[];
};
