export type PayMethod = "SHA" | "M-Pesa" | "Cash";

export const departments = ["Cardiology", "Pediatrics", "Maternity", "Orthopedics", "Outpatient", "Radiology"];

export const revenueByMethod = [
  { month: "May", SHA: 1.42, "M-Pesa": 0.98, Cash: 0.41 },
  { month: "Jun", SHA: 1.55, "M-Pesa": 1.04, Cash: 0.38 },
  { month: "Jul", SHA: 1.48, "M-Pesa": 1.12, Cash: 0.44 },
  { month: "Aug", SHA: 1.71, "M-Pesa": 1.21, Cash: 0.4 },
  { month: "Sep", SHA: 1.86, "M-Pesa": 1.18, Cash: 0.36 },
  { month: "Oct", SHA: 2.04, "M-Pesa": 1.33, Cash: 0.39 },
];

export const revenueByDept = [
  { month: "May", Cardiology: 0.9, Pediatrics: 0.62, Maternity: 0.81, Outpatient: 0.48 },
  { month: "Jun", Cardiology: 0.96, Pediatrics: 0.6, Maternity: 0.88, Outpatient: 0.53 },
  { month: "Jul", Cardiology: 0.92, Pediatrics: 0.71, Maternity: 0.86, Outpatient: 0.55 },
  { month: "Aug", Cardiology: 1.08, Pediatrics: 0.74, Maternity: 0.95, Outpatient: 0.54 },
  { month: "Sep", Cardiology: 1.15, Pediatrics: 0.7, Maternity: 1.02, Outpatient: 0.53 },
  { month: "Oct", Cardiology: 1.27, Pediatrics: 0.79, Maternity: 1.1, Outpatient: 0.6 },
];

export const paymentSplit = [
  { name: "SHA", value: 54, color: "var(--sha)" },
  { name: "M-Pesa", value: 35, color: "var(--mpesa)" },
  { name: "Cash", value: 11, color: "var(--cash)" },
];

export type Person = { id: string; name: string; kind: "Patient" | "Staff"; dept: string; date: string; detail: string; status: string };
export const people: Person[] = [
  { id: "#P-4021", name: "Wanjiru Kamau", kind: "Patient", dept: "Maternity", date: "27 Oct 2026", detail: "Antenatal review", status: "Admitted" },
  { id: "#P-4022", name: "Brian Otieno", kind: "Patient", dept: "Cardiology", date: "26 Oct 2026", detail: "Hypertension", status: "Discharged" },
  { id: "#S-0114", name: "Dr. Achieng Odhiambo", kind: "Staff", dept: "Pediatrics", date: "02 Mar 2021", detail: "Consultant", status: "On Duty" },
  { id: "#P-4023", name: "Mercy Chebet", kind: "Patient", dept: "Pediatrics", date: "28 Oct 2026", detail: "Malaria (child)", status: "Admitted" },
  { id: "#P-4024", name: "Kevin Mwangi", kind: "Patient", dept: "Orthopedics", date: "24 Oct 2026", detail: "Fractured tibia", status: "Transferred" },
  { id: "#S-0127", name: "Nurse Faith Njeri", kind: "Staff", dept: "Maternity", date: "11 Jan 2023", detail: "Midwife", status: "Off Duty" },
  { id: "#P-4025", name: "Hassan Abdi", kind: "Patient", dept: "Outpatient", date: "29 Oct 2026", detail: "Type 2 diabetes", status: "Discharged" },
  { id: "#S-0131", name: "Dr. Peter Kiprono", kind: "Staff", dept: "Cardiology", date: "19 Aug 2019", detail: "Cardiologist", status: "On Duty" },
];

export const schedule = [
  { time: "09:00", title: "Cardiac stress test", who: "Brian Otieno", doctor: "Dr. Kiprono", dept: "Cardiology" },
  { time: "10:30", title: "Antenatal scan", who: "Wanjiru Kamau", doctor: "Dr. Mutua", dept: "Maternity" },
  { time: "12:00", title: "Pediatric follow-up", who: "Mercy Chebet", doctor: "Dr. Odhiambo", dept: "Pediatrics" },
  { time: "14:15", title: "Cast review", who: "Kevin Mwangi", doctor: "Dr. Waweru", dept: "Orthopedics" },
];

export type Invoice = { id: string; patient: string; doctor: string; dept: string; amount: number; method: PayMethod; status: "paid" | "pending" | "voided"; date: string };
export const invoices: Invoice[] = [
  { id: "INV-1190", patient: "Wanjiru Kamau", doctor: "Dr. Mutua", dept: "Maternity", amount: 48500, method: "SHA", status: "pending", date: "29 Oct 2026" },
  { id: "INV-1189", patient: "Hassan Abdi", doctor: "Dr. Njoroge", dept: "Outpatient", amount: 3200, method: "M-Pesa", status: "paid", date: "29 Oct 2026" },
  { id: "INV-1188", patient: "Brian Otieno", doctor: "Dr. Kiprono", dept: "Cardiology", amount: 27800, method: "SHA", status: "paid", date: "28 Oct 2026" },
  { id: "INV-1187", patient: "Mercy Chebet", doctor: "Dr. Odhiambo", dept: "Pediatrics", amount: 6400, method: "Cash", status: "paid", date: "28 Oct 2026" },
  { id: "INV-1186", patient: "Kevin Mwangi", doctor: "Dr. Waweru", dept: "Orthopedics", amount: 62000, method: "SHA", status: "pending", date: "27 Oct 2026" },
  { id: "INV-1185", patient: "Amina Yusuf", doctor: "Dr. Njoroge", dept: "Outpatient", amount: 1800, method: "M-Pesa", status: "paid", date: "27 Oct 2026" },
  { id: "INV-1184", patient: "James Kariuki", doctor: "Dr. Kiprono", dept: "Cardiology", amount: 15400, method: "Cash", status: "voided", date: "26 Oct 2026" },
  { id: "INV-1183", patient: "Grace Wambui", doctor: "Dr. Mutua", dept: "Maternity", amount: 35000, method: "M-Pesa", status: "paid", date: "26 Oct 2026" },
  { id: "INV-1182", patient: "Daniel Ochieng", doctor: "Dr. Achieng", dept: "Radiology", amount: 9800, method: "Cash", status: "voided", date: "25 Oct 2026" },
  { id: "INV-1181", patient: "Lucy Atieno", doctor: "Dr. Odhiambo", dept: "Pediatrics", amount: 4500, method: "SHA", status: "pending", date: "25 Oct 2026" },
];

export type ClaimStatus = "submitted" | "under review" | "approved" | "rejected";
export type Claim = { id: string; patient: string; dept: string; amount: number; submitted: string; status: ClaimStatus; days: number };
export const claims: Claim[] = [
  { id: "SHA-0341", patient: "Kevin Mwangi", dept: "Orthopedics", amount: 62000, submitted: "02 Oct 2026", status: "under review", days: 27 },
  { id: "SHA-0338", patient: "Lucy Atieno", dept: "Pediatrics", amount: 4500, submitted: "06 Oct 2026", status: "rejected", days: 23 },
  { id: "SHA-0336", patient: "Wanjiru Kamau", dept: "Maternity", amount: 48500, submitted: "10 Oct 2026", status: "submitted", days: 19 },
  { id: "SHA-0335", patient: "Samuel Kiptoo", dept: "Cardiology", amount: 88400, submitted: "14 Oct 2026", status: "under review", days: 15 },
  { id: "SHA-0333", patient: "Esther Moraa", dept: "Maternity", amount: 41000, submitted: "18 Oct 2026", status: "rejected", days: 11 },
  { id: "SHA-0332", patient: "Brian Otieno", dept: "Cardiology", amount: 27800, submitted: "20 Oct 2026", status: "approved", days: 0 },
  { id: "SHA-0330", patient: "Peter Mutiso", dept: "Outpatient", amount: 2600, submitted: "24 Oct 2026", status: "submitted", days: 5 },
  { id: "SHA-0329", patient: "Halima Said", dept: "Radiology", amount: 12500, submitted: "25 Oct 2026", status: "approved", days: 0 },
];

export const reconciliation = [
  { date: "29 Oct 2026", clerk: "Joy Wairimu", logged: 18400, system: 18400 },
  { date: "28 Oct 2026", clerk: "Joy Wairimu", logged: 42150, system: 42650 },
  { date: "27 Oct 2026", clerk: "Ali Hassan", logged: 36900, system: 36900 },
  { date: "26 Oct 2026", clerk: "Ali Hassan", logged: 29300, system: 29300 },
  { date: "25 Oct 2026", clerk: "Joy Wairimu", logged: 51200, system: 49800 },
  { date: "24 Oct 2026", clerk: "Ali Hassan", logged: 33750, system: 33750 },
];

export type AuditType = "void" | "delete" | "edit" | "approve" | "create" | "login";
export type AuditEntry = { ts: string; user: string; role: string; type: AuditType; action: string; record: string; device: string };
export const audit: AuditEntry[] = [
  { ts: "29 Oct 2026, 16:21", user: "Grace Mutua", role: "Finance Officer", type: "approve", action: "Approved SHA claim #332", record: "SHA-0332", device: "10.0.4.17 · Chrome / Windows" },
  { ts: "29 Oct 2026, 15:58", user: "Joy Wairimu", role: "Receptionist", type: "void", action: "Voided invoice #1184", record: "INV-1184", device: "10.0.2.31 · iPad Safari" },
  { ts: "29 Oct 2026, 15:12", user: "Dr. Peter Kiprono", role: "Doctor", type: "edit", action: "Edited patient record #4022", record: "P-4022", device: "10.0.6.08 · Chrome / macOS" },
  { ts: "29 Oct 2026, 14:40", user: "Ali Hassan", role: "Receptionist", type: "create", action: "Registered new patient #4025", record: "P-4025", device: "10.0.2.33 · iPad Safari" },
  { ts: "29 Oct 2026, 13:05", user: "Samuel Ndegwa", role: "Administrator", type: "delete", action: "Deleted duplicate appointment #A-7712", record: "A-7712", device: "10.0.1.02 · Firefox / Linux" },
  { ts: "29 Oct 2026, 11:47", user: "Nurse Faith Njeri", role: "Nurse", type: "edit", action: "Updated vitals for patient #4021", record: "P-4021", device: "10.0.5.14 · Android tablet" },
  { ts: "29 Oct 2026, 09:02", user: "Grace Mutua", role: "Finance Officer", type: "login", action: "Signed in", record: "—", device: "10.0.4.17 · Chrome / Windows" },
  { ts: "28 Oct 2026, 17:30", user: "Grace Mutua", role: "Finance Officer", type: "approve", action: "Approved SHA claim #329", record: "SHA-0329", device: "10.0.4.17 · Chrome / Windows" },
  { ts: "28 Oct 2026, 16:15", user: "Joy Wairimu", role: "Receptionist", type: "void", action: "Voided invoice #1182", record: "INV-1182", device: "10.0.2.31 · iPad Safari" },
  { ts: "28 Oct 2026, 12:44", user: "Dr. Achieng Odhiambo", role: "Doctor", type: "edit", action: "Edited prescription for patient #4023", record: "P-4023", device: "10.0.6.11 · Chrome / macOS" },
];

export const ksh = (n: number) => "KSh " + n.toLocaleString("en-KE");
