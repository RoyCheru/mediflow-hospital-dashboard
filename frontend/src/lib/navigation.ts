import {
  BarChart3,
  Bell,
  BookOpen,
  Brain,
  Building2,
  CalendarCheck,
  CalendarDays,
  CalendarPlus,
  ClipboardList,
  CreditCard,
  FileText,
  FlaskConical,
  HandCoins,
  LayoutGrid,
  ListOrdered,
  Pill,
  Receipt,
  ScrollText,
  Settings,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  UserPlus,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type Role = "admin" | "doctor" | "receptionist" | "cashier" | "patient";

export type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
};

export type NavGroup = {
  label: string;
  items: readonly NavItem[];
};

export type TopBarLinks = {
  claims: string;
  appointments: string;
  departments: string;
  notifications: string;
  billing: string;
  settings: string;
};

export type RoleNavigation = {
  role: Role;
  label: string;
  user: { name: string; email: string };
  home: string;
  groups: readonly NavGroup[];
  topBar: TopBarLinks;
};

const adminNavigation: RoleNavigation = {
  role: "admin",
  label: "Administrator",
  user: { name: "Samuel Ndegwa", email: "s.ndegwa@mediflow.co.ke" },
  home: "/admin",
  groups: [
    {
      label: "General",
      items: [
        { to: "/admin", label: "Dashboard", icon: LayoutGrid },
        { to: "/admin/appointments", label: "Appointments", icon: CalendarDays, badge: 6 },
        { to: "/admin/patients", label: "Patients", icon: Users },
        { to: "/admin/visits", label: "Clinical Visits", icon: ClipboardList },
        { to: "/admin/staff", label: "Doctors & Staff", icon: Stethoscope },
        { to: "/admin/departments", label: "Departments & Services", icon: Building2 },
      ],
    },
    {
      label: "Finance & Compliance",
      items: [
        { to: "/admin/billing", label: "Billing & Payments", icon: Receipt, badge: 5 },
        { to: "/admin/claims", label: "SHA Claims", icon: ShieldCheck, badge: 4 },
        { to: "/admin/audit-log", label: "Audit Log", icon: ScrollText },
        { to: "/admin/analytics", label: "Analytics & Reports", icon: BarChart3 },
      ],
    },
    {
      label: "System",
      items: [
        { to: "/admin/notifications", label: "Notifications", icon: Bell, badge: 3 },
        { to: "/admin/ai", label: "AI Assistant", icon: Sparkles },
        { to: "/admin/settings", label: "Settings", icon: Settings },
      ],
    },
  ],
  topBar: {
    claims: "/admin/claims",
    appointments: "/admin/appointments",
    departments: "/admin/departments",
    notifications: "/admin/notifications",
    billing: "/admin/billing",
    settings: "/admin/settings",
  },
};

const doctorNavigation: RoleNavigation = {
  role: "doctor",
  label: "Doctor",
  user: { name: "Dr. Peter Kiprono", email: "p.kiprono@mediflow.co.ke" },
  home: "/doctor",
  groups: [
    {
      label: "Clinic",
      items: [
        { to: "/doctor", label: "Dashboard", icon: LayoutGrid },
        { to: "/doctor/queue", label: "Today's Queue", icon: ListOrdered, badge: 8 },
        { to: "/doctor/appointments", label: "Appointments", icon: CalendarDays },
        { to: "/doctor/patients", label: "My Patients", icon: Users },
        { to: "/doctor/consultations", label: "Consultations", icon: ClipboardList },
        { to: "/doctor/availability", label: "My Availability", icon: CalendarCheck },
      ],
    },
    {
      label: "Insights",
      items: [
        { to: "/doctor/reports", label: "Reports & Stats", icon: BarChart3 },
        { to: "/doctor/ai", label: "AI Assistant", icon: Sparkles },
      ],
    },
    {
      label: "System",
      items: [
        { to: "/doctor/notifications", label: "Notifications", icon: Bell },
        { to: "/doctor/settings", label: "Settings", icon: Settings },
      ],
    },
  ],
  topBar: {
    claims: "/doctor/reports",
    appointments: "/doctor/appointments",
    departments: "/doctor/patients",
    notifications: "/doctor/notifications",
    billing: "/doctor/reports",
    settings: "/doctor/settings",
  },
};

const receptionistNavigation: RoleNavigation = {
  role: "receptionist",
  label: "Receptionist",
  user: { name: "Joy Wairimu", email: "j.wairimu@mediflow.co.ke" },
  home: "/receptionist",
  groups: [
    {
      label: "Front desk",
      items: [
        { to: "/receptionist", label: "Dashboard", icon: LayoutGrid },
        { to: "/receptionist/patients", label: "Register Patient", icon: UserPlus },
        { to: "/receptionist/appointments", label: "Appointments", icon: CalendarDays },
        { to: "/receptionist/queue", label: "Queue & Check-in", icon: ListOrdered, badge: 5 },
      ],
    },
    {
      label: "Billing & Claims",
      items: [
        { to: "/receptionist/billing", label: "Billing & Payments", icon: Receipt },
        { to: "/receptionist/claims", label: "SHA Claims", icon: ShieldCheck },
      ],
    },
    {
      label: "System",
      items: [
        { to: "/receptionist/notifications", label: "Notifications", icon: Bell },
        { to: "/receptionist/settings", label: "Settings", icon: Settings },
      ],
    },
  ],
  topBar: {
    claims: "/receptionist/claims",
    appointments: "/receptionist/appointments",
    departments: "/receptionist/queue",
    notifications: "/receptionist/notifications",
    billing: "/receptionist/billing",
    settings: "/receptionist/settings",
  },
};

const cashierNavigation: RoleNavigation = {
  role: "cashier",
  label: "Cashier",
  user: { name: "Grace Mutua", email: "g.mutua@mediflow.co.ke" },
  home: "/cashier",
  groups: [
    {
      label: "Billing",
      items: [
        { to: "/cashier", label: "Dashboard", icon: LayoutGrid },
        { to: "/cashier/invoices", label: "Invoices", icon: FileText },
        { to: "/cashier/payments", label: "Payments", icon: CreditCard },
        { to: "/cashier/reconciliation", label: "Cash Reconciliation", icon: Wallet },
        { to: "/cashier/refunds", label: "Refunds & Voids", icon: HandCoins },
      ],
    },
    {
      label: "System",
      items: [
        { to: "/cashier/notifications", label: "Notifications", icon: Bell },
        { to: "/cashier/settings", label: "Settings", icon: Settings },
      ],
    },
  ],
  topBar: {
    claims: "/cashier/invoices",
    appointments: "/cashier",
    departments: "/cashier",
    notifications: "/cashier/notifications",
    billing: "/cashier/payments",
    settings: "/cashier/settings",
  },
};

const patientNavigation: RoleNavigation = {
  role: "patient",
  label: "Patient",
  user: { name: "Amina Yusuf", email: "amina.yusuf@example.com" },
  home: "/patient",
  groups: [
    {
      label: "My care",
      items: [
        { to: "/patient", label: "Dashboard", icon: LayoutGrid },
        { to: "/patient/appointments", label: "Appointments", icon: CalendarDays },
        { to: "/patient/book", label: "Book Appointment", icon: CalendarPlus },
        { to: "/patient/triage", label: "AI Triage", icon: Brain },
      ],
    },
    {
      label: "Health record",
      items: [
        { to: "/patient/records", label: "Medical Records", icon: BookOpen },
        { to: "/patient/prescriptions", label: "Prescriptions", icon: Pill },
        { to: "/patient/results", label: "Test Results", icon: FlaskConical },
      ],
    },
    {
      label: "Account",
      items: [
        { to: "/patient/invoices", label: "Invoices & Payments", icon: Receipt },
        { to: "/patient/notifications", label: "Notifications", icon: Bell },
        { to: "/patient/settings", label: "Settings", icon: Settings },
      ],
    },
  ],
  topBar: {
    claims: "/patient/invoices",
    appointments: "/patient/appointments",
    departments: "/patient/book",
    notifications: "/patient/notifications",
    billing: "/patient/invoices",
    settings: "/patient/settings",
  },
};

export const roleNavigation: Record<Role, RoleNavigation> = {
  admin: adminNavigation,
  doctor: doctorNavigation,
  receptionist: receptionistNavigation,
  cashier: cashierNavigation,
  patient: patientNavigation,
};

export const roleHome: Record<Role, string> = {
  admin: adminNavigation.home,
  doctor: doctorNavigation.home,
  receptionist: receptionistNavigation.home,
  cashier: cashierNavigation.home,
  patient: patientNavigation.home,
};
