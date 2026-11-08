export type PayMethod = "SHA" | "MPESA" | "CASH" | "CARD" | "BANK" | "SELF_PAY";

export const methodLabel: Record<PayMethod, string> = {
  SHA: "SHA",
  MPESA: "M-Pesa",
  CASH: "Cash",
  CARD: "Card",
  BANK: "Bank",
  SELF_PAY: "Self pay",
};

export const titleize = (value: string) =>
  value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

export const ksh = (n: number) => "KSh " + Math.round(n).toLocaleString("en-KE");

export const shortDate = (value: string) =>
  new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

export const nowTime = () =>
  new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

/* ------------------------------------------------------------------ */
/* Departments & catalog                                               */
/* ------------------------------------------------------------------ */

export type Department = {
  id: string;
  name: string;
  code: string;
  description: string;
  active: boolean;
  head: string;
  beds: number;
  used: number;
  staff: number;
  revenue: number;
  wait: number;
};

export const departmentRecords: Department[] = [
  {
    id: "dep-card",
    name: "Cardiology",
    code: "CARD",
    description: "Heart and vascular care",
    active: true,
    head: "Dr. Peter Kiprono",
    beds: 32,
    used: 27,
    staff: 34,
    revenue: 1270000,
    wait: 22,
  },
  {
    id: "dep-ped",
    name: "Pediatrics",
    code: "PED",
    description: "Child health services",
    active: true,
    head: "Dr. Achieng Odhiambo",
    beds: 40,
    used: 31,
    staff: 41,
    revenue: 790000,
    wait: 15,
  },
  {
    id: "dep-mat",
    name: "Maternity",
    code: "MAT",
    description: "Obstetrics and newborn care",
    active: true,
    head: "Dr. Lilian Mutua",
    beds: 48,
    used: 45,
    staff: 52,
    revenue: 1100000,
    wait: 12,
  },
  {
    id: "dep-orth",
    name: "Orthopedics",
    code: "ORTH",
    description: "Bones, joints and rehabilitation",
    active: true,
    head: "Dr. John Waweru",
    beds: 24,
    used: 16,
    staff: 22,
    revenue: 640000,
    wait: 28,
  },
  {
    id: "dep-op",
    name: "Outpatient",
    code: "OPD",
    description: "General outpatient consultations",
    active: true,
    head: "Dr. Paul Njoroge",
    beds: 10,
    used: 4,
    staff: 38,
    revenue: 600000,
    wait: 34,
  },
  {
    id: "dep-rad",
    name: "Radiology",
    code: "RAD",
    description: "Imaging and diagnostics",
    active: true,
    head: "Dr. Ruth Achieng",
    beds: 0,
    used: 0,
    staff: 18,
    revenue: 420000,
    wait: 19,
  },
];

export const departments = departmentRecords.map((d) => d.name);

export type Service = {
  id: string;
  department: string;
  name: string;
  code: string;
  description: string;
  price: number;
  active: boolean;
  priceHistory: { amount: number; effectiveFrom: string }[];
};

export const services: Service[] = [
  {
    id: "svc-consult",
    department: "Outpatient",
    name: "General consultation",
    code: "CONS-OPD",
    description: "Standard outpatient consultation",
    price: 1800,
    active: true,
    priceHistory: [
      { amount: 1800, effectiveFrom: "2026-01-01" },
      { amount: 1500, effectiveFrom: "2025-07-01" },
    ],
  },
  {
    id: "svc-ecg",
    department: "Cardiology",
    name: "ECG",
    code: "CARD-ECG",
    description: "Electrocardiogram",
    price: 3500,
    active: true,
    priceHistory: [{ amount: 3500, effectiveFrom: "2026-03-01" }],
  },
  {
    id: "svc-stress",
    department: "Cardiology",
    name: "Cardiac stress test",
    code: "CARD-STRESS",
    description: "Treadmill stress test",
    price: 9800,
    active: true,
    priceHistory: [{ amount: 9800, effectiveFrom: "2026-02-01" }],
  },
  {
    id: "svc-antenatal",
    department: "Maternity",
    name: "Antenatal scan",
    code: "MAT-ANC",
    description: "Obstetric ultrasound",
    price: 4500,
    active: true,
    priceHistory: [{ amount: 4500, effectiveFrom: "2026-01-15" }],
  },
  {
    id: "svc-delivery",
    department: "Maternity",
    name: "Normal delivery",
    code: "MAT-DEL",
    description: "Vaginal delivery package",
    price: 42000,
    active: true,
    priceHistory: [{ amount: 42000, effectiveFrom: "2026-01-01" }],
  },
  {
    id: "svc-ped",
    department: "Pediatrics",
    name: "Pediatric review",
    code: "PED-REV",
    description: "Child follow-up consultation",
    price: 2200,
    active: true,
    priceHistory: [{ amount: 2200, effectiveFrom: "2026-01-01" }],
  },
  {
    id: "svc-cast",
    department: "Orthopedics",
    name: "Cast application",
    code: "ORTH-CAST",
    description: "Plaster cast and review",
    price: 7500,
    active: true,
    priceHistory: [{ amount: 7500, effectiveFrom: "2026-01-01" }],
  },
  {
    id: "svc-ct",
    department: "Radiology",
    name: "CT scan",
    code: "RAD-CT",
    description: "Computed tomography",
    price: 12500,
    active: true,
    priceHistory: [{ amount: 12500, effectiveFrom: "2026-01-01" }],
  },
  {
    id: "svc-lab",
    department: "Radiology",
    name: "Full blood count",
    code: "LAB-FBC",
    description: "Haematology panel",
    price: 1400,
    active: false,
    priceHistory: [{ amount: 1400, effectiveFrom: "2025-10-01" }],
  },
];

/* ------------------------------------------------------------------ */
/* Staff & users                                                       */
/* ------------------------------------------------------------------ */

export type StaffRole = "ADMIN" | "DOCTOR" | "RECEPTIONIST" | "CASHIER";
export type UserStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED" | "PENDING_VERIFICATION";

export type StaffMember = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: StaffRole;
  department: string;
  specialty?: string;
  license?: string;
  fee?: number;
  status: UserStatus;
  lastActive: string;
  accepting?: boolean;
  bio?: string;
  shift: string;
  patients: number;
  rating: number;
  grad: string;
};

export const staff: StaffMember[] = [
  {
    id: "doc-kiprono",
    name: "Dr. Peter Kiprono",
    email: "p.kiprono@mediflow.co.ke",
    phone: "+254 712 001 220",
    role: "DOCTOR",
    department: "Cardiology",
    specialty: "Cardiologist",
    license: "KMPDC-10442",
    fee: 3500,
    status: "ACTIVE",
    lastActive: "Today, 15:12",
    accepting: true,
    bio: "Interventional cardiology and preventive heart care.",
    shift: "08:00 – 17:00",
    patients: 14,
    rating: 4.9,
    grad: "bg-grad-teal",
  },
  {
    id: "doc-odhiambo",
    name: "Dr. Achieng Odhiambo",
    email: "a.odhiambo@mediflow.co.ke",
    phone: "+254 722 114 908",
    role: "DOCTOR",
    department: "Pediatrics",
    specialty: "Consultant Pediatrician",
    license: "KMPDC-11009",
    fee: 2800,
    status: "ACTIVE",
    lastActive: "Today, 14:02",
    accepting: true,
    bio: "Neonatal and pediatric emergency care.",
    shift: "08:00 – 17:00",
    patients: 18,
    rating: 4.8,
    grad: "bg-grad-pink",
  },
  {
    id: "doc-mutua",
    name: "Dr. Lilian Mutua",
    email: "l.mutua@mediflow.co.ke",
    phone: "+254 733 552 101",
    role: "DOCTOR",
    department: "Maternity",
    specialty: "Obstetrician",
    license: "KMPDC-09871",
    fee: 3200,
    status: "ACTIVE",
    lastActive: "Today, 13:48",
    accepting: true,
    bio: "High-risk obstetrics and antenatal care.",
    shift: "07:00 – 19:00",
    patients: 11,
    rating: 4.7,
    grad: "bg-grad-purple",
  },
  {
    id: "doc-waweru",
    name: "Dr. John Waweru",
    email: "j.waweru@mediflow.co.ke",
    phone: "+254 701 990 442",
    role: "DOCTOR",
    department: "Orthopedics",
    specialty: "Orthopedic Surgeon",
    license: "KMPDC-07654",
    fee: 4200,
    status: "ACTIVE",
    lastActive: "Today, 12:20",
    accepting: false,
    bio: "Sports injuries and joint replacement.",
    shift: "09:00 – 18:00",
    patients: 6,
    rating: 4.8,
    grad: "bg-grad-yellow",
  },
  {
    id: "doc-njoroge",
    name: "Dr. Paul Njoroge",
    email: "p.njoroge@mediflow.co.ke",
    phone: "+254 745 220 118",
    role: "DOCTOR",
    department: "Outpatient",
    specialty: "General Practitioner",
    license: "KMPDC-11223",
    fee: 1800,
    status: "ACTIVE",
    lastActive: "Today, 15:31",
    accepting: true,
    bio: "General medicine and chronic disease review.",
    shift: "08:00 – 16:00",
    patients: 26,
    rating: 4.6,
    grad: "bg-grad-teal",
  },
  {
    id: "doc-achieng",
    name: "Dr. Ruth Achieng",
    email: "r.achieng@mediflow.co.ke",
    phone: "+254 757 881 330",
    role: "DOCTOR",
    department: "Radiology",
    specialty: "Radiologist",
    license: "KMPDC-10556",
    fee: 2500,
    status: "ACTIVE",
    lastActive: "Yesterday, 18:44",
    accepting: true,
    bio: "Diagnostic imaging and reporting.",
    shift: "Night · 19:00 – 07:00",
    patients: 0,
    rating: 4.7,
    grad: "bg-grad-pink",
  },
  {
    id: "usr-samuel",
    name: "Samuel Ndegwa",
    email: "s.ndegwa@mediflow.co.ke",
    phone: "+254 712 345 678",
    role: "ADMIN",
    department: "Administration",
    status: "ACTIVE",
    lastActive: "Today, 13:05",
    shift: "08:00 – 17:00",
    patients: 0,
    rating: 0,
    grad: "bg-grad-teal",
  },
  {
    id: "usr-grace",
    name: "Grace Mutua",
    email: "g.mutua@mediflow.co.ke",
    phone: "+254 720 665 120",
    role: "CASHIER",
    department: "Finance",
    status: "ACTIVE",
    lastActive: "Today, 16:21",
    shift: "08:00 – 17:00",
    patients: 0,
    rating: 0,
    grad: "bg-grad-purple",
  },
  {
    id: "usr-joy",
    name: "Joy Wairimu",
    email: "j.wairimu@mediflow.co.ke",
    phone: "+254 733 441 006",
    role: "RECEPTIONIST",
    department: "Front desk",
    status: "ACTIVE",
    lastActive: "Today, 15:58",
    shift: "07:00 – 15:00",
    patients: 0,
    rating: 0,
    grad: "bg-grad-pink",
  },
  {
    id: "usr-ali",
    name: "Ali Hassan",
    email: "a.hassan@mediflow.co.ke",
    phone: "+254 701 224 557",
    role: "RECEPTIONIST",
    department: "Front desk",
    status: "ACTIVE",
    lastActive: "Today, 14:40",
    shift: "13:00 – 21:00",
    patients: 0,
    rating: 0,
    grad: "bg-grad-yellow",
  },
  {
    id: "usr-faith",
    name: "Nurse Faith Njeri",
    email: "f.njeri@mediflow.co.ke",
    phone: "+254 715 003 991",
    role: "DOCTOR",
    department: "Maternity",
    specialty: "Midwife",
    license: "NCK-2291",
    fee: 0,
    status: "INACTIVE",
    lastActive: "28 Oct 2026",
    accepting: false,
    shift: "Night · 19:00 – 07:00",
    patients: 0,
    rating: 4.9,
    grad: "bg-grad-purple",
  },
  {
    id: "usr-daniel",
    name: "Nurse Daniel Kibet",
    email: "d.kibet@mediflow.co.ke",
    phone: "+254 728 774 320",
    role: "DOCTOR",
    department: "Cardiology",
    specialty: "Ward Nurse",
    license: "NCK-3310",
    fee: 0,
    status: "PENDING_VERIFICATION",
    lastActive: "—",
    accepting: false,
    shift: "07:00 – 19:00",
    patients: 9,
    rating: 4.5,
    grad: "bg-grad-yellow",
  },
];

export const doctorNames = staff.filter((s) => s.role === "DOCTOR").map((s) => s.name);

export type AvailabilityRule = {
  id: string;
  doctor: string;
  weekday: number;
  start: string;
  end: string;
  slot: number;
  timezone: string;
  active: boolean;
};

export const availabilityRules: AvailabilityRule[] = [
  {
    id: "av-1",
    doctor: "Dr. Peter Kiprono",
    weekday: 1,
    start: "08:00",
    end: "13:00",
    slot: 30,
    timezone: "Africa/Nairobi",
    active: true,
  },
  {
    id: "av-2",
    doctor: "Dr. Peter Kiprono",
    weekday: 3,
    start: "08:00",
    end: "16:00",
    slot: 30,
    timezone: "Africa/Nairobi",
    active: true,
  },
  {
    id: "av-3",
    doctor: "Dr. Achieng Odhiambo",
    weekday: 2,
    start: "09:00",
    end: "15:00",
    slot: 20,
    timezone: "Africa/Nairobi",
    active: true,
  },
  {
    id: "av-4",
    doctor: "Dr. Lilian Mutua",
    weekday: 4,
    start: "07:00",
    end: "19:00",
    slot: 45,
    timezone: "Africa/Nairobi",
    active: true,
  },
];

export type AvailabilityException = {
  id: string;
  doctor: string;
  start: string;
  end: string;
  kind: "LEAVE" | "BLOCKED" | "EXTRA";
  reason: string;
};

export const availabilityExceptions: AvailabilityException[] = [
  {
    id: "ex-1",
    doctor: "Dr. John Waweru",
    start: "2026-11-02T09:00",
    end: "2026-11-02T13:00",
    kind: "BLOCKED",
    reason: "Theatre list",
  },
  {
    id: "ex-2",
    doctor: "Dr. Ruth Achieng",
    start: "2026-11-05T00:00",
    end: "2026-11-08T23:59",
    kind: "LEAVE",
    reason: "Annual leave",
  },
];

/* ------------------------------------------------------------------ */
/* Patients                                                            */
/* ------------------------------------------------------------------ */

export type ConsentChannel = "WHATSAPP" | "EMAIL" | "SMS";
export type Consent = { channel: ConsentChannel; granted: boolean; updated: string };

export type TimelineEvent = { type: string; at: string; summary: string; detail?: string };

export type Patient = {
  id: string;
  number: string;
  name: string;
  firstName: string;
  lastName: string;
  age: number;
  dob: string;
  sex: "MALE" | "FEMALE" | "OTHER" | "UNKNOWN";
  phone: string;
  email: string;
  address: string;
  dept: string;
  condition: string;
  lastVisit: string;
  sha: boolean;
  shaNumber?: string;
  insuranceProvider?: string;
  insuranceMember?: string;
  blood: string;
  status: "Admitted" | "Discharged" | "Transferred" | "Active";
  allergies: string;
  chronic: string;
  medications: string;
  nextOfKin: string;
  nextOfKinPhone: string;
  noShowScore: number;
  consents: Consent[];
  timeline: TimelineEvent[];
};

export const patients: Patient[] = [
  {
    id: "P-4021",
    number: "MF-2026-004021",
    name: "Wanjiru Kamau",
    firstName: "Wanjiru",
    lastName: "Kamau",
    age: 29,
    dob: "1997-04-18",
    sex: "FEMALE",
    phone: "0712 448 201",
    email: "wanjiru.kamau@example.com",
    address: "Kileleshwa, Nairobi",
    dept: "Maternity",
    condition: "Antenatal review",
    lastVisit: "27 Oct 2026",
    sha: true,
    shaNumber: "SHA-884-120",
    blood: "O+",
    status: "Admitted",
    allergies: "Penicillin",
    chronic: "None",
    medications: "Folic acid 5mg",
    nextOfKin: "Peter Kamau",
    nextOfKinPhone: "0720 118 442",
    noShowScore: 0.08,
    consents: [
      { channel: "WHATSAPP", granted: true, updated: "27 Oct 2026" },
      { channel: "EMAIL", granted: true, updated: "27 Oct 2026" },
      { channel: "SMS", granted: false, updated: "27 Oct 2026" },
    ],
    timeline: [
      {
        type: "visit",
        at: "27 Oct 2026",
        summary: "Antenatal review",
        detail: "Dr. Lilian Mutua · Maternity",
      },
      {
        type: "invoice",
        at: "27 Oct 2026",
        summary: "Invoice INV-2026-001190",
        detail: "KSh 48,500 · pending",
      },
    ],
  },
  {
    id: "P-4022",
    number: "MF-2026-004022",
    name: "Brian Otieno",
    firstName: "Brian",
    lastName: "Otieno",
    age: 54,
    dob: "1972-09-02",
    sex: "MALE",
    phone: "0722 190 554",
    email: "brian.otieno@example.com",
    address: "Westlands, Nairobi",
    dept: "Cardiology",
    condition: "Hypertension",
    lastVisit: "26 Oct 2026",
    sha: true,
    shaNumber: "SHA-771-209",
    blood: "A+",
    status: "Discharged",
    allergies: "None",
    chronic: "Hypertension",
    medications: "Amlodipine 5mg",
    nextOfKin: "Mary Otieno",
    nextOfKinPhone: "0722 190 555",
    noShowScore: 0.12,
    consents: [
      { channel: "WHATSAPP", granted: true, updated: "20 Oct 2026" },
      { channel: "EMAIL", granted: false, updated: "20 Oct 2026" },
      { channel: "SMS", granted: true, updated: "20 Oct 2026" },
    ],
    timeline: [
      {
        type: "visit",
        at: "26 Oct 2026",
        summary: "Hypertension review",
        detail: "Dr. Peter Kiprono · Cardiology",
      },
      {
        type: "claim",
        at: "20 Oct 2026",
        summary: "SHA claim approved",
        detail: "SHA-0332 · KSh 27,800",
      },
    ],
  },
  {
    id: "P-4023",
    number: "MF-2026-004023",
    name: "Mercy Chebet",
    firstName: "Mercy",
    lastName: "Chebet",
    age: 6,
    dob: "2020-02-11",
    sex: "FEMALE",
    phone: "0733 902 117",
    email: "chebet.family@example.com",
    address: "Kasarani, Nairobi",
    dept: "Pediatrics",
    condition: "Malaria",
    lastVisit: "28 Oct 2026",
    sha: false,
    blood: "B+",
    status: "Admitted",
    allergies: "None",
    chronic: "None",
    medications: "Artemether-lumefantrine",
    nextOfKin: "Anne Chebet",
    nextOfKinPhone: "0733 902 118",
    noShowScore: 0.2,
    consents: [
      { channel: "WHATSAPP", granted: true, updated: "28 Oct 2026" },
      { channel: "EMAIL", granted: true, updated: "28 Oct 2026" },
      { channel: "SMS", granted: true, updated: "28 Oct 2026" },
    ],
    timeline: [
      {
        type: "visit",
        at: "28 Oct 2026",
        summary: "Malaria treatment",
        detail: "Dr. Achieng Odhiambo · Pediatrics",
      },
    ],
  },
  {
    id: "P-4024",
    number: "MF-2026-004024",
    name: "Kevin Mwangi",
    firstName: "Kevin",
    lastName: "Mwangi",
    age: 31,
    dob: "1995-06-30",
    sex: "MALE",
    phone: "0701 556 820",
    email: "kevin.mwangi@example.com",
    address: "Embakasi, Nairobi",
    dept: "Orthopedics",
    condition: "Fractured tibia",
    lastVisit: "24 Oct 2026",
    sha: true,
    shaNumber: "SHA-553-901",
    blood: "O-",
    status: "Transferred",
    allergies: "None",
    chronic: "None",
    medications: "Ibuprofen 400mg",
    nextOfKin: "Jane Mwangi",
    nextOfKinPhone: "0701 556 821",
    noShowScore: 0.31,
    consents: [
      { channel: "WHATSAPP", granted: true, updated: "24 Oct 2026" },
      { channel: "EMAIL", granted: false, updated: "24 Oct 2026" },
      { channel: "SMS", granted: false, updated: "24 Oct 2026" },
    ],
    timeline: [
      {
        type: "visit",
        at: "24 Oct 2026",
        summary: "Fracture review",
        detail: "Dr. John Waweru · Orthopedics",
      },
      {
        type: "claim",
        at: "02 Oct 2026",
        summary: "SHA claim under review",
        detail: "SHA-0341 · KSh 62,000",
      },
    ],
  },
  {
    id: "P-4025",
    number: "MF-2026-004025",
    name: "Hassan Abdi",
    firstName: "Hassan",
    lastName: "Abdi",
    age: 47,
    dob: "1979-12-04",
    sex: "MALE",
    phone: "0745 310 662",
    email: "hassan.abdi@example.com",
    address: "Eastleigh, Nairobi",
    dept: "Outpatient",
    condition: "Type 2 diabetes",
    lastVisit: "29 Oct 2026",
    sha: false,
    blood: "AB+",
    status: "Discharged",
    allergies: "Sulfa drugs",
    chronic: "Type 2 diabetes",
    medications: "Metformin 500mg",
    nextOfKin: "Hawa Abdi",
    nextOfKinPhone: "0745 310 663",
    noShowScore: 0.05,
    consents: [
      { channel: "WHATSAPP", granted: true, updated: "29 Oct 2026" },
      { channel: "EMAIL", granted: true, updated: "29 Oct 2026" },
      { channel: "SMS", granted: true, updated: "29 Oct 2026" },
    ],
    timeline: [
      {
        type: "visit",
        at: "29 Oct 2026",
        summary: "Diabetes review",
        detail: "Dr. Paul Njoroge · Outpatient",
      },
      {
        type: "invoice",
        at: "29 Oct 2026",
        summary: "Invoice INV-2026-001189",
        detail: "KSh 3,200 · paid",
      },
    ],
  },
  {
    id: "P-4026",
    number: "MF-2026-004026",
    name: "Samuel Kiptoo",
    firstName: "Samuel",
    lastName: "Kiptoo",
    age: 63,
    dob: "1963-03-22",
    sex: "MALE",
    phone: "0710 884 093",
    email: "samuel.kiptoo@example.com",
    address: "Karen, Nairobi",
    dept: "Cardiology",
    condition: "Arrhythmia",
    lastVisit: "29 Oct 2026",
    sha: true,
    shaNumber: "SHA-219-884",
    blood: "A-",
    status: "Admitted",
    allergies: "None",
    chronic: "Atrial fibrillation",
    medications: "Warfarin 5mg",
    nextOfKin: "Grace Kiptoo",
    nextOfKinPhone: "0710 884 094",
    noShowScore: 0.18,
    consents: [
      { channel: "WHATSAPP", granted: true, updated: "14 Oct 2026" },
      { channel: "EMAIL", granted: true, updated: "14 Oct 2026" },
      { channel: "SMS", granted: false, updated: "14 Oct 2026" },
    ],
    timeline: [
      {
        type: "visit",
        at: "29 Oct 2026",
        summary: "ECG review",
        detail: "Dr. Peter Kiprono · Cardiology",
      },
      {
        type: "claim",
        at: "14 Oct 2026",
        summary: "SHA claim under review",
        detail: "SHA-0335 · KSh 88,400",
      },
    ],
  },
  {
    id: "P-4027",
    number: "MF-2026-004027",
    name: "Esther Moraa",
    firstName: "Esther",
    lastName: "Moraa",
    age: 34,
    dob: "1992-08-17",
    sex: "FEMALE",
    phone: "0729 671 445",
    email: "esther.moraa@example.com",
    address: "Ruiru, Kiambu",
    dept: "Maternity",
    condition: "Post-natal care",
    lastVisit: "25 Oct 2026",
    sha: true,
    shaNumber: "SHA-664-220",
    blood: "O+",
    status: "Discharged",
    allergies: "None",
    chronic: "None",
    medications: "Iron supplements",
    nextOfKin: "David Moraa",
    nextOfKinPhone: "0729 671 446",
    noShowScore: 0.1,
    consents: [
      { channel: "WHATSAPP", granted: true, updated: "25 Oct 2026" },
      { channel: "EMAIL", granted: false, updated: "25 Oct 2026" },
      { channel: "SMS", granted: true, updated: "25 Oct 2026" },
    ],
    timeline: [
      {
        type: "visit",
        at: "25 Oct 2026",
        summary: "Post-natal review",
        detail: "Dr. Lilian Mutua · Maternity",
      },
      {
        type: "claim",
        at: "18 Oct 2026",
        summary: "SHA claim rejected",
        detail: "SHA-0333 · KSh 41,000",
      },
    ],
  },
  {
    id: "P-4028",
    number: "MF-2026-004028",
    name: "Halima Said",
    firstName: "Halima",
    lastName: "Said",
    age: 41,
    dob: "1985-01-09",
    sex: "FEMALE",
    phone: "0757 223 908",
    email: "halima.said@example.com",
    address: "South C, Nairobi",
    dept: "Radiology",
    condition: "Chest imaging",
    lastVisit: "25 Oct 2026",
    sha: true,
    shaNumber: "SHA-441-776",
    blood: "B-",
    status: "Discharged",
    allergies: "Iodine",
    chronic: "Asthma",
    medications: "Salbutamol inhaler",
    nextOfKin: "Omar Said",
    nextOfKinPhone: "0757 223 909",
    noShowScore: 0.07,
    consents: [
      { channel: "WHATSAPP", granted: true, updated: "25 Oct 2026" },
      { channel: "EMAIL", granted: true, updated: "25 Oct 2026" },
      { channel: "SMS", granted: true, updated: "25 Oct 2026" },
    ],
    timeline: [
      {
        type: "visit",
        at: "25 Oct 2026",
        summary: "Chest CT",
        detail: "Dr. Ruth Achieng · Radiology",
      },
      {
        type: "claim",
        at: "25 Oct 2026",
        summary: "SHA claim approved",
        detail: "SHA-0329 · KSh 12,500",
      },
    ],
  },
];

export type Person = {
  id: string;
  name: string;
  kind: "Patient" | "Staff";
  dept: string;
  date: string;
  detail: string;
  status: string;
};
export const people: Person[] = [
  {
    id: "#P-4021",
    name: "Wanjiru Kamau",
    kind: "Patient",
    dept: "Maternity",
    date: "27 Oct 2026",
    detail: "Antenatal review",
    status: "Admitted",
  },
  {
    id: "#P-4022",
    name: "Brian Otieno",
    kind: "Patient",
    dept: "Cardiology",
    date: "26 Oct 2026",
    detail: "Hypertension",
    status: "Discharged",
  },
  {
    id: "#S-0114",
    name: "Dr. Achieng Odhiambo",
    kind: "Staff",
    dept: "Pediatrics",
    date: "02 Mar 2021",
    detail: "Consultant",
    status: "On Duty",
  },
  {
    id: "#P-4023",
    name: "Mercy Chebet",
    kind: "Patient",
    dept: "Pediatrics",
    date: "28 Oct 2026",
    detail: "Malaria (child)",
    status: "Admitted",
  },
  {
    id: "#P-4024",
    name: "Kevin Mwangi",
    kind: "Patient",
    dept: "Orthopedics",
    date: "24 Oct 2026",
    detail: "Fractured tibia",
    status: "Transferred",
  },
  {
    id: "#S-0127",
    name: "Nurse Faith Njeri",
    kind: "Staff",
    dept: "Maternity",
    date: "11 Jan 2023",
    detail: "Midwife",
    status: "Off Duty",
  },
  {
    id: "#P-4025",
    name: "Hassan Abdi",
    kind: "Patient",
    dept: "Outpatient",
    date: "29 Oct 2026",
    detail: "Type 2 diabetes",
    status: "Discharged",
  },
  {
    id: "#S-0131",
    name: "Dr. Peter Kiprono",
    kind: "Staff",
    dept: "Cardiology",
    date: "19 Aug 2019",
    detail: "Cardiologist",
    status: "On Duty",
  },
];

/* ------------------------------------------------------------------ */
/* Appointments & visits                                               */
/* ------------------------------------------------------------------ */

export type AppointmentStatus =
  "SCHEDULED" | "CHECKED_IN" | "IN_CONSULTATION" | "COMPLETED" | "NO_SHOW" | "CANCELLED";
export type AppointmentSource = "ONLINE" | "RECEPTION" | "WALK_IN";
export type Urgency = "ROUTINE" | "URGENT" | "EMERGENCY";

export type Appointment = {
  id: string;
  patient: string;
  patientId: string;
  doctor: string;
  doctorId: string;
  dept: string;
  service: string;
  date: string;
  time: string;
  status: AppointmentStatus;
  source: AppointmentSource;
  urgency: Urgency;
  notes: string;
  noShowScore: number;
};

export const appointments: Appointment[] = [
  {
    id: "A-7801",
    patient: "Hassan Abdi",
    patientId: "P-4025",
    doctor: "Dr. Paul Njoroge",
    doctorId: "doc-njoroge",
    dept: "Outpatient",
    service: "General consultation",
    date: "2026-10-29",
    time: "08:30",
    status: "CHECKED_IN",
    source: "RECEPTION",
    urgency: "ROUTINE",
    notes: "Diabetes review",
    noShowScore: 0.05,
  },
  {
    id: "A-7802",
    patient: "Brian Otieno",
    patientId: "P-4022",
    doctor: "Dr. Peter Kiprono",
    doctorId: "doc-kiprono",
    dept: "Cardiology",
    service: "Cardiac stress test",
    date: "2026-10-29",
    time: "09:00",
    status: "IN_CONSULTATION",
    source: "RECEPTION",
    urgency: "ROUTINE",
    notes: "Stress test follow-up",
    noShowScore: 0.12,
  },
  {
    id: "A-7803",
    patient: "Wanjiru Kamau",
    patientId: "P-4021",
    doctor: "Dr. Lilian Mutua",
    doctorId: "doc-mutua",
    dept: "Maternity",
    service: "Antenatal scan",
    date: "2026-10-29",
    time: "10:30",
    status: "SCHEDULED",
    source: "ONLINE",
    urgency: "ROUTINE",
    notes: "Routine antenatal scan",
    noShowScore: 0.08,
  },
  {
    id: "A-7804",
    patient: "Halima Said",
    patientId: "P-4028",
    doctor: "Dr. Ruth Achieng",
    doctorId: "doc-achieng",
    dept: "Radiology",
    service: "CT scan",
    date: "2026-10-29",
    time: "11:15",
    status: "SCHEDULED",
    source: "RECEPTION",
    urgency: "URGENT",
    notes: "Chest imaging",
    noShowScore: 0.07,
  },
  {
    id: "A-7805",
    patient: "Mercy Chebet",
    patientId: "P-4023",
    doctor: "Dr. Achieng Odhiambo",
    doctorId: "doc-odhiambo",
    dept: "Pediatrics",
    service: "Pediatric review",
    date: "2026-10-29",
    time: "12:00",
    status: "SCHEDULED",
    source: "ONLINE",
    urgency: "ROUTINE",
    notes: "Malaria follow-up",
    noShowScore: 0.2,
  },
  {
    id: "A-7806",
    patient: "Samuel Kiptoo",
    patientId: "P-4026",
    doctor: "Dr. Peter Kiprono",
    doctorId: "doc-kiprono",
    dept: "Cardiology",
    service: "ECG",
    date: "2026-10-29",
    time: "13:30",
    status: "CANCELLED",
    source: "RECEPTION",
    urgency: "URGENT",
    notes: "Palpitations",
    noShowScore: 0.18,
  },
  {
    id: "A-7807",
    patient: "Kevin Mwangi",
    patientId: "P-4024",
    doctor: "Dr. John Waweru",
    doctorId: "doc-waweru",
    dept: "Orthopedics",
    service: "Cast application",
    date: "2026-10-29",
    time: "14:15",
    status: "SCHEDULED",
    source: "RECEPTION",
    urgency: "ROUTINE",
    notes: "Cast review",
    noShowScore: 0.31,
  },
  {
    id: "A-7808",
    patient: "Amina Yusuf",
    patientId: "P-4029",
    doctor: "Dr. Paul Njoroge",
    doctorId: "doc-njoroge",
    dept: "Outpatient",
    service: "General consultation",
    date: "2026-10-29",
    time: "15:00",
    status: "NO_SHOW",
    source: "ONLINE",
    urgency: "ROUTINE",
    notes: "First consultation",
    noShowScore: 0.42,
  },
];

export const schedule = [
  {
    time: "09:00",
    title: "Cardiac stress test",
    who: "Brian Otieno",
    doctor: "Dr. Kiprono",
    dept: "Cardiology",
  },
  {
    time: "10:30",
    title: "Antenatal scan",
    who: "Wanjiru Kamau",
    doctor: "Dr. Mutua",
    dept: "Maternity",
  },
  {
    time: "12:00",
    title: "Pediatric follow-up",
    who: "Mercy Chebet",
    doctor: "Dr. Odhiambo",
    dept: "Pediatrics",
  },
  {
    time: "14:15",
    title: "Cast review",
    who: "Kevin Mwangi",
    doctor: "Dr. Waweru",
    dept: "Orthopedics",
  },
];

export type PrescriptionItem = {
  drug: string;
  dose: string;
  frequency: string;
  duration: string;
  route: string;
  instructions: string;
  quantity: number;
};
export type Prescription = {
  id: string;
  doctor: string;
  issuedAt: string;
  status: "ISSUED" | "CANCELLED";
  notes: string;
  items: PrescriptionItem[];
};
export type Attachment = {
  id: string;
  type: "LAB_REPORT" | "SCAN" | "REFERRAL" | "OTHER";
  fileName: string;
  contentType: string;
  size: string;
  uploadedAt: string;
  scanState: string;
};
export type Referral = { id: string; destination: string; reason: string; createdAt: string };

export type Visit = {
  id: string;
  appointmentId: string;
  patient: string;
  patientId: string;
  doctor: string;
  dept: string;
  startedAt: string;
  completedAt?: string;
  complaint: string;
  vitals: { bp: string; temp: string; pulse: string; spo2: string; weight: string };
  notes: string;
  diagnosis: string;
  plan: string;
  followUp?: string;
  aiSummary?: string;
  aiApproved: boolean;
  prescriptions: Prescription[];
  attachments: Attachment[];
  referrals: Referral[];
};

export const visits: Visit[] = [
  {
    id: "V-3101",
    appointmentId: "A-7802",
    patient: "Brian Otieno",
    patientId: "P-4022",
    doctor: "Dr. Peter Kiprono",
    dept: "Cardiology",
    startedAt: "29 Oct 2026, 09:05",
    completedAt: "29 Oct 2026, 09:42",
    complaint: "Chest tightness on exertion",
    vitals: { bp: "142/92", temp: "36.8°C", pulse: "88 bpm", spo2: "97%", weight: "84 kg" },
    notes:
      "Patient reports intermittent chest tightness over 2 weeks. Stress test scheduled. ECG shows normal sinus rhythm.",
    diagnosis: "Stable angina — suspected",
    plan: "Stress test, start aspirin 75mg, review in 2 weeks.",
    followUp: "2026-11-12",
    aiSummary:
      "54-year-old male with exertional chest tightness and hypertension. ECG normal sinus rhythm. Plan: stress test, aspirin, cardiology review.",
    aiApproved: true,
    prescriptions: [
      {
        id: "RX-2201",
        doctor: "Dr. Peter Kiprono",
        issuedAt: "29 Oct 2026",
        status: "ISSUED",
        notes: "Take after meals",
        items: [
          {
            drug: "Aspirin",
            dose: "75mg",
            frequency: "Once daily",
            duration: "30 days",
            route: "Oral",
            instructions: "After food",
            quantity: 30,
          },
          {
            drug: "Amlodipine",
            dose: "5mg",
            frequency: "Once daily",
            duration: "30 days",
            route: "Oral",
            instructions: "Evening",
            quantity: 30,
          },
        ],
      },
    ],
    attachments: [
      {
        id: "ATT-901",
        type: "SCAN",
        fileName: "ecg-strip.pdf",
        contentType: "application/pdf",
        size: "182 KB",
        uploadedAt: "29 Oct 2026",
        scanState: "CLEAN",
      },
    ],
    referrals: [],
  },
  {
    id: "V-3100",
    appointmentId: "A-7801",
    patient: "Hassan Abdi",
    patientId: "P-4025",
    doctor: "Dr. Paul Njoroge",
    dept: "Outpatient",
    startedAt: "29 Oct 2026, 08:35",
    complaint: "Routine diabetes review",
    vitals: { bp: "128/84", temp: "36.6°C", pulse: "76 bpm", spo2: "99%", weight: "78 kg" },
    notes: "HbA1c 7.4%. Adherence good. Continue metformin.",
    diagnosis: "Type 2 diabetes mellitus",
    plan: "Continue metformin, diet review, repeat HbA1c in 3 months.",
    aiSummary: "Diabetes review with HbA1c 7.4%. Continue metformin and lifestyle advice.",
    aiApproved: false,
    prescriptions: [
      {
        id: "RX-2200",
        doctor: "Dr. Paul Njoroge",
        issuedAt: "29 Oct 2026",
        status: "ISSUED",
        notes: "",
        items: [
          {
            drug: "Metformin",
            dose: "500mg",
            frequency: "Twice daily",
            duration: "90 days",
            route: "Oral",
            instructions: "With meals",
            quantity: 180,
          },
        ],
      },
    ],
    attachments: [],
    referrals: [],
  },
  {
    id: "V-3098",
    appointmentId: "A-7794",
    patient: "Esther Moraa",
    patientId: "P-4027",
    doctor: "Dr. Lilian Mutua",
    dept: "Maternity",
    startedAt: "25 Oct 2026, 11:00",
    completedAt: "25 Oct 2026, 11:35",
    complaint: "Post-natal review",
    vitals: { bp: "118/76", temp: "36.7°C", pulse: "72 bpm", spo2: "99%", weight: "64 kg" },
    notes: "Healing well. No signs of infection. Referred for physiotherapy.",
    diagnosis: "Normal post-natal recovery",
    plan: "Iron supplements, physiotherapy referral.",
    followUp: "2026-11-22",
    aiSummary: "Post-natal review, normal recovery. Iron supplements and physiotherapy referral.",
    aiApproved: true,
    prescriptions: [],
    attachments: [
      {
        id: "ATT-899",
        type: "LAB_REPORT",
        fileName: "postnatal-labs.pdf",
        contentType: "application/pdf",
        size: "96 KB",
        uploadedAt: "25 Oct 2026",
        scanState: "CLEAN",
      },
    ],
    referrals: [
      {
        id: "REF-120",
        destination: "Nairobi Physiotherapy Centre",
        reason: "Post-partum pelvic floor rehabilitation",
        createdAt: "25 Oct 2026",
      },
    ],
  },
];

/* ------------------------------------------------------------------ */
/* Billing                                                             */
/* ------------------------------------------------------------------ */

export type InvoiceStatus = "DRAFT" | "ISSUED" | "PARTIALLY_PAID" | "PAID" | "VOIDED" | "REFUNDED";
export type InvoiceLine = {
  description: string;
  code: string;
  quantity: number;
  unitPrice: number;
  total: number;
};
export type Allocation = {
  id: string;
  payer: "PATIENT" | "SHA" | "INSURANCE";
  amount: number;
  status: "PENDING" | "PAID" | "VOIDED";
  reference?: string;
};

export type Invoice = {
  id: string;
  number: string;
  patient: string;
  patientId: string;
  visitId: string;
  doctor: string;
  dept: string;
  subtotal: number;
  discount: number;
  total: number;
  paid: number;
  balance: number;
  status: InvoiceStatus;
  method: PayMethod;
  date: string;
  dueDate: string;
  lines: InvoiceLine[];
  allocations: Allocation[];
};

export const invoices: Invoice[] = [
  {
    id: "inv-1190",
    number: "INV-2026-001190",
    patient: "Wanjiru Kamau",
    patientId: "P-4021",
    visitId: "V-3099",
    doctor: "Dr. Lilian Mutua",
    dept: "Maternity",
    subtotal: 48500,
    discount: 0,
    total: 48500,
    paid: 0,
    balance: 48500,
    status: "ISSUED",
    method: "SHA",
    date: "29 Oct 2026",
    dueDate: "05 Nov 2026",
    lines: [
      { description: "Antenatal scan", code: "MAT-ANC", quantity: 1, unitPrice: 4500, total: 4500 },
      { description: "Consultation", code: "CONS", quantity: 1, unitPrice: 3200, total: 3200 },
      {
        description: "Maternity package",
        code: "MAT-PKG",
        quantity: 1,
        unitPrice: 40800,
        total: 40800,
      },
    ],
    allocations: [{ id: "al-1190", payer: "SHA", amount: 48500, status: "PENDING" }],
  },
  {
    id: "inv-1189",
    number: "INV-2026-001189",
    patient: "Hassan Abdi",
    patientId: "P-4025",
    visitId: "V-3100",
    doctor: "Dr. Paul Njoroge",
    dept: "Outpatient",
    subtotal: 3200,
    discount: 0,
    total: 3200,
    paid: 3200,
    balance: 0,
    status: "PAID",
    method: "MPESA",
    date: "29 Oct 2026",
    dueDate: "29 Oct 2026",
    lines: [
      {
        description: "General consultation",
        code: "CONS-OPD",
        quantity: 1,
        unitPrice: 1800,
        total: 1800,
      },
      {
        description: "Full blood count",
        code: "LAB-FBC",
        quantity: 1,
        unitPrice: 1400,
        total: 1400,
      },
    ],
    allocations: [
      { id: "al-1189", payer: "PATIENT", amount: 3200, status: "PAID", reference: "MPESA-QJ7K2" },
    ],
  },
  {
    id: "inv-1188",
    number: "INV-2026-001188",
    patient: "Brian Otieno",
    patientId: "P-4022",
    visitId: "V-3101",
    doctor: "Dr. Peter Kiprono",
    dept: "Cardiology",
    subtotal: 27800,
    discount: 0,
    total: 27800,
    paid: 27800,
    balance: 0,
    status: "PAID",
    method: "SHA",
    date: "28 Oct 2026",
    dueDate: "04 Nov 2026",
    lines: [
      {
        description: "Cardiac stress test",
        code: "CARD-STRESS",
        quantity: 1,
        unitPrice: 9800,
        total: 9800,
      },
      { description: "Consultation", code: "CONS", quantity: 1, unitPrice: 3500, total: 3500 },
      {
        description: "Cardiology package",
        code: "CARD-PKG",
        quantity: 1,
        unitPrice: 14500,
        total: 14500,
      },
    ],
    allocations: [
      { id: "al-1188", payer: "SHA", amount: 27800, status: "PAID", reference: "SHA-0332" },
    ],
  },
  {
    id: "inv-1187",
    number: "INV-2026-001187",
    patient: "Mercy Chebet",
    patientId: "P-4023",
    visitId: "V-3097",
    doctor: "Dr. Achieng Odhiambo",
    dept: "Pediatrics",
    subtotal: 6400,
    discount: 0,
    total: 6400,
    paid: 6400,
    balance: 0,
    status: "PAID",
    method: "CASH",
    date: "28 Oct 2026",
    dueDate: "28 Oct 2026",
    lines: [
      {
        description: "Pediatric review",
        code: "PED-REV",
        quantity: 1,
        unitPrice: 2200,
        total: 2200,
      },
      {
        description: "Malaria RDT + treatment",
        code: "PED-MAL",
        quantity: 1,
        unitPrice: 4200,
        total: 4200,
      },
    ],
    allocations: [
      { id: "al-1187", payer: "PATIENT", amount: 6400, status: "PAID", reference: "CASH-4412" },
    ],
  },
  {
    id: "inv-1186",
    number: "INV-2026-001186",
    patient: "Kevin Mwangi",
    patientId: "P-4024",
    visitId: "V-3096",
    doctor: "Dr. John Waweru",
    dept: "Orthopedics",
    subtotal: 62000,
    discount: 0,
    total: 62000,
    paid: 20000,
    balance: 42000,
    status: "PARTIALLY_PAID",
    method: "SHA",
    date: "27 Oct 2026",
    dueDate: "03 Nov 2026",
    lines: [
      {
        description: "Cast application",
        code: "ORTH-CAST",
        quantity: 1,
        unitPrice: 7500,
        total: 7500,
      },
      {
        description: "Orthopedic package",
        code: "ORTH-PKG",
        quantity: 1,
        unitPrice: 54500,
        total: 54500,
      },
    ],
    allocations: [
      { id: "al-1186a", payer: "SHA", amount: 42000, status: "PENDING" },
      { id: "al-1186b", payer: "PATIENT", amount: 20000, status: "PAID", reference: "MPESA-KL9P1" },
    ],
  },
  {
    id: "inv-1185",
    number: "INV-2026-001185",
    patient: "Amina Yusuf",
    patientId: "P-4029",
    visitId: "V-3095",
    doctor: "Dr. Paul Njoroge",
    dept: "Outpatient",
    subtotal: 1800,
    discount: 0,
    total: 1800,
    paid: 1800,
    balance: 0,
    status: "PAID",
    method: "MPESA",
    date: "27 Oct 2026",
    dueDate: "27 Oct 2026",
    lines: [
      {
        description: "General consultation",
        code: "CONS-OPD",
        quantity: 1,
        unitPrice: 1800,
        total: 1800,
      },
    ],
    allocations: [
      { id: "al-1185", payer: "PATIENT", amount: 1800, status: "PAID", reference: "MPESA-QP2M8" },
    ],
  },
  {
    id: "inv-1184",
    number: "INV-2026-001184",
    patient: "James Kariuki",
    patientId: "P-4030",
    visitId: "V-3094",
    doctor: "Dr. Peter Kiprono",
    dept: "Cardiology",
    subtotal: 15400,
    discount: 0,
    total: 15400,
    paid: 0,
    balance: 0,
    status: "VOIDED",
    method: "CASH",
    date: "26 Oct 2026",
    dueDate: "26 Oct 2026",
    lines: [
      { description: "ECG", code: "CARD-ECG", quantity: 1, unitPrice: 3500, total: 3500 },
      {
        description: "Cardiology package",
        code: "CARD-PKG",
        quantity: 1,
        unitPrice: 11900,
        total: 11900,
      },
    ],
    allocations: [],
  },
  {
    id: "inv-1183",
    number: "INV-2026-001183",
    patient: "Grace Wambui",
    patientId: "P-4031",
    visitId: "V-3093",
    doctor: "Dr. Lilian Mutua",
    dept: "Maternity",
    subtotal: 35000,
    discount: 0,
    total: 35000,
    paid: 35000,
    balance: 0,
    status: "PAID",
    method: "MPESA",
    date: "26 Oct 2026",
    dueDate: "02 Nov 2026",
    lines: [
      {
        description: "Normal delivery",
        code: "MAT-DEL",
        quantity: 1,
        unitPrice: 35000,
        total: 35000,
      },
    ],
    allocations: [
      { id: "al-1183", payer: "PATIENT", amount: 35000, status: "PAID", reference: "MPESA-NN4T7" },
    ],
  },
  {
    id: "inv-1182",
    number: "INV-2026-001182",
    patient: "Daniel Ochieng",
    patientId: "P-4032",
    visitId: "V-3092",
    doctor: "Dr. Ruth Achieng",
    dept: "Radiology",
    subtotal: 9800,
    discount: 0,
    total: 9800,
    paid: 0,
    balance: 0,
    status: "VOIDED",
    method: "CASH",
    date: "25 Oct 2026",
    dueDate: "25 Oct 2026",
    lines: [{ description: "CT scan", code: "RAD-CT", quantity: 1, unitPrice: 9800, total: 9800 }],
    allocations: [],
  },
  {
    id: "inv-1181",
    number: "INV-2026-001181",
    patient: "Lucy Atieno",
    patientId: "P-4033",
    visitId: "V-3091",
    doctor: "Dr. Achieng Odhiambo",
    dept: "Pediatrics",
    subtotal: 4500,
    discount: 0,
    total: 4500,
    paid: 0,
    balance: 4500,
    status: "ISSUED",
    method: "SHA",
    date: "25 Oct 2026",
    dueDate: "01 Nov 2026",
    lines: [
      {
        description: "Pediatric review",
        code: "PED-REV",
        quantity: 1,
        unitPrice: 2200,
        total: 2200,
      },
      { description: "Nebulisation", code: "PED-NEB", quantity: 1, unitPrice: 2300, total: 2300 },
    ],
    allocations: [{ id: "al-1181", payer: "SHA", amount: 4500, status: "PENDING" }],
  },
];

export type TransactionStatus = "PENDING" | "SUCCESS" | "FAILED" | "UNCONFIRMED" | "REVERSED";
export type Transaction = {
  id: string;
  invoice: string;
  invoiceId: string;
  method: PayMethod;
  amount: number;
  tendered?: number;
  change?: number;
  status: TransactionStatus;
  reference: string;
  providerRef?: string;
  paidAt: string;
  notes: string;
};

export const transactions: Transaction[] = [
  {
    id: "txn-9001",
    invoice: "INV-2026-001189",
    invoiceId: "inv-1189",
    method: "MPESA",
    amount: 3200,
    status: "SUCCESS",
    reference: "MPESA-QJ7K2",
    providerRef: "SJK4LM9PQ2",
    paidAt: "29 Oct 2026, 09:12",
    notes: "Patient payment",
  },
  {
    id: "txn-9002",
    invoice: "INV-2026-001188",
    invoiceId: "inv-1188",
    method: "SHA",
    amount: 27800,
    status: "SUCCESS",
    reference: "SHA-0332",
    providerRef: "SHA-CLM-0332",
    paidAt: "28 Oct 2026, 16:40",
    notes: "Claim settlement",
  },
  {
    id: "txn-9003",
    invoice: "INV-2026-001187",
    invoiceId: "inv-1187",
    method: "CASH",
    amount: 6400,
    tendered: 7000,
    change: 600,
    status: "SUCCESS",
    reference: "CASH-4412",
    paidAt: "28 Oct 2026, 11:05",
    notes: "Front desk cash",
  },
  {
    id: "txn-9004",
    invoice: "INV-2026-001186",
    invoiceId: "inv-1186",
    method: "MPESA",
    amount: 20000,
    status: "SUCCESS",
    reference: "MPESA-KL9P1",
    providerRef: "SJK4LM9QZ8",
    paidAt: "27 Oct 2026, 14:20",
    notes: "Part payment",
  },
  {
    id: "txn-9005",
    invoice: "INV-2026-001185",
    invoiceId: "inv-1185",
    method: "MPESA",
    amount: 1800,
    status: "UNCONFIRMED",
    reference: "MPESA-QP2M8",
    providerRef: "SJK4LM9QX1",
    paidAt: "27 Oct 2026, 10:02",
    notes: "Awaiting provider confirmation",
  },
  {
    id: "txn-9006",
    invoice: "INV-2026-001183",
    invoiceId: "inv-1183",
    method: "MPESA",
    amount: 35000,
    status: "SUCCESS",
    reference: "MPESA-NN4T7",
    providerRef: "SJK4LM9QN4",
    paidAt: "26 Oct 2026, 18:22",
    notes: "Maternity package",
  },
];

export type PaymentIntentStatus = "PENDING" | "SUCCESS" | "FAILED" | "TIMEOUT" | "UNCONFIRMED";
export type PaymentIntent = {
  id: string;
  invoice: string;
  invoiceId: string;
  phone: string;
  amount: number;
  status: PaymentIntentStatus;
  checkoutId: string;
  created: string;
};

export const paymentIntents: PaymentIntent[] = [
  {
    id: "pi-7001",
    invoice: "INV-2026-001190",
    invoiceId: "inv-1190",
    phone: "+254712448201",
    amount: 48500,
    status: "PENDING",
    checkoutId: "ws_CO_291020261021",
    created: "29 Oct 2026, 10:21",
  },
  {
    id: "pi-7002",
    invoice: "INV-2026-001186",
    invoiceId: "inv-1186",
    phone: "+254701556820",
    amount: 42000,
    status: "UNCONFIRMED",
    checkoutId: "ws_CO_271020261408",
    created: "27 Oct 2026, 14:08",
  },
  {
    id: "pi-7003",
    invoice: "INV-2026-001181",
    invoiceId: "inv-1181",
    phone: "+254757223908",
    amount: 4500,
    status: "FAILED",
    checkoutId: "ws_CO_251020261144",
    created: "25 Oct 2026, 11:44",
  },
];

export type Refund = {
  id: string;
  invoice: string;
  transaction: string;
  amount: number;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "COMPLETED";
  requestedBy: string;
  approvedBy?: string;
  decidedAt?: string;
};
export const refunds: Refund[] = [
  {
    id: "rf-501",
    invoice: "INV-2026-001187",
    transaction: "txn-9003",
    amount: 600,
    reason: "Overpayment change not collected",
    status: "PENDING",
    requestedBy: "Grace Mutua",
  },
  {
    id: "rf-500",
    invoice: "INV-2026-001185",
    transaction: "txn-9005",
    amount: 1800,
    reason: "Duplicate mobile payment",
    status: "APPROVED",
    requestedBy: "Joy Wairimu",
    approvedBy: "Samuel Ndegwa",
    decidedAt: "27 Oct 2026",
  },
];

export type VoidRequest = {
  id: string;
  invoice: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  requestedBy: string;
  reviewedBy?: string;
  decidedAt?: string;
};
export const voidRequests: VoidRequest[] = [
  {
    id: "vr-301",
    invoice: "INV-2026-001184",
    reason: "Invoice raised against wrong visit",
    status: "PENDING",
    requestedBy: "Grace Mutua",
  },
  {
    id: "vr-300",
    invoice: "INV-2026-001182",
    reason: "Duplicate imaging invoice",
    status: "APPROVED",
    requestedBy: "Joy Wairimu",
    reviewedBy: "Samuel Ndegwa",
    decidedAt: "25 Oct 2026",
  },
];

export type CashReconciliation = {
  id: string;
  date: string;
  clerk: string;
  expected: number;
  counted: number;
  variance: number;
  status: "OPEN" | "BALANCED" | "DISCREPANCY";
  notes: string;
};
export const cashReconciliations: CashReconciliation[] = [
  {
    id: "cr-801",
    date: "29 Oct 2026",
    clerk: "Joy Wairimu",
    expected: 18400,
    counted: 18400,
    variance: 0,
    status: "BALANCED",
    notes: "Shift closed",
  },
  {
    id: "cr-800",
    date: "28 Oct 2026",
    clerk: "Joy Wairimu",
    expected: 42650,
    counted: 42150,
    variance: -500,
    status: "DISCREPANCY",
    notes: "Short by KSh 500",
  },
  {
    id: "cr-799",
    date: "27 Oct 2026",
    clerk: "Ali Hassan",
    expected: 36900,
    counted: 36900,
    variance: 0,
    status: "BALANCED",
    notes: "",
  },
  {
    id: "cr-798",
    date: "26 Oct 2026",
    clerk: "Ali Hassan",
    expected: 29300,
    counted: 29300,
    variance: 0,
    status: "BALANCED",
    notes: "",
  },
  {
    id: "cr-797",
    date: "25 Oct 2026",
    clerk: "Joy Wairimu",
    expected: 49800,
    counted: 51200,
    variance: 1400,
    status: "DISCREPANCY",
    notes: "Over by KSh 1,400",
  },
];

export const reconciliation = [
  { date: "29 Oct 2026", clerk: "Joy Wairimu", logged: 18400, system: 18400 },
  { date: "28 Oct 2026", clerk: "Joy Wairimu", logged: 42150, system: 42650 },
  { date: "27 Oct 2026", clerk: "Ali Hassan", logged: 36900, system: 36900 },
  { date: "26 Oct 2026", clerk: "Ali Hassan", logged: 29300, system: 29300 },
  { date: "25 Oct 2026", clerk: "Joy Wairimu", logged: 51200, system: 49800 },
  { date: "24 Oct 2026", clerk: "Ali Hassan", logged: 33750, system: 33750 },
];

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

/* ------------------------------------------------------------------ */
/* Claims                                                              */
/* ------------------------------------------------------------------ */

export type ClaimStatus =
  "DRAFT" | "SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "REJECTED" | "PAID" | "CANCELLED";
export type ClaimHistory = { from?: ClaimStatus; to: ClaimStatus; note: string; at: string };

export type Claim = {
  id: string;
  invoice: string;
  invoiceId: string;
  patient: string;
  dept: string;
  claimed: number;
  approved?: number;
  status: ClaimStatus;
  submitted: string;
  decided?: string;
  paid?: string;
  days: number;
  rejectionReason?: string;
  externalRef?: string;
  history: ClaimHistory[];
};

export const claims: Claim[] = [
  {
    id: "SHA-0341",
    invoice: "INV-2026-001186",
    invoiceId: "inv-1186",
    patient: "Kevin Mwangi",
    dept: "Orthopedics",
    claimed: 62000,
    status: "UNDER_REVIEW",
    submitted: "02 Oct 2026",
    days: 27,
    externalRef: "SHA-CLM-0341",
    history: [
      { to: "SUBMITTED", note: "Claim submitted", at: "02 Oct 2026" },
      { from: "SUBMITTED", to: "UNDER_REVIEW", note: "SHA review started", at: "04 Oct 2026" },
    ],
  },
  {
    id: "SHA-0338",
    invoice: "INV-2026-001181",
    invoiceId: "inv-1181",
    patient: "Lucy Atieno",
    dept: "Pediatrics",
    claimed: 4500,
    status: "REJECTED",
    submitted: "06 Oct 2026",
    decided: "08 Oct 2026",
    days: 0,
    rejectionReason: "Member number mismatch",
    externalRef: "SHA-CLM-0338",
    history: [
      { to: "SUBMITTED", note: "Claim submitted", at: "06 Oct 2026" },
      { from: "SUBMITTED", to: "REJECTED", note: "Member number mismatch", at: "08 Oct 2026" },
    ],
  },
  {
    id: "SHA-0336",
    invoice: "INV-2026-001190",
    invoiceId: "inv-1190",
    patient: "Wanjiru Kamau",
    dept: "Maternity",
    claimed: 48500,
    status: "SUBMITTED",
    submitted: "10 Oct 2026",
    days: 19,
    externalRef: "SHA-CLM-0336",
    history: [{ to: "SUBMITTED", note: "Claim submitted", at: "10 Oct 2026" }],
  },
  {
    id: "SHA-0335",
    invoice: "INV-2026-001187",
    invoiceId: "inv-1187",
    patient: "Samuel Kiptoo",
    dept: "Cardiology",
    claimed: 88400,
    status: "UNDER_REVIEW",
    submitted: "14 Oct 2026",
    days: 15,
    externalRef: "SHA-CLM-0335",
    history: [
      { to: "SUBMITTED", note: "Claim submitted", at: "14 Oct 2026" },
      { from: "SUBMITTED", to: "UNDER_REVIEW", note: "Review started", at: "15 Oct 2026" },
    ],
  },
  {
    id: "SHA-0333",
    invoice: "INV-2026-001187",
    invoiceId: "inv-1187",
    patient: "Esther Moraa",
    dept: "Maternity",
    claimed: 41000,
    status: "REJECTED",
    submitted: "18 Oct 2026",
    decided: "20 Oct 2026",
    days: 0,
    rejectionReason: "Service not covered",
    externalRef: "SHA-CLM-0333",
    history: [
      { to: "SUBMITTED", note: "Claim submitted", at: "18 Oct 2026" },
      { from: "SUBMITTED", to: "REJECTED", note: "Service not covered", at: "20 Oct 2026" },
    ],
  },
  {
    id: "SHA-0332",
    invoice: "INV-2026-001188",
    invoiceId: "inv-1188",
    patient: "Brian Otieno",
    dept: "Cardiology",
    claimed: 27800,
    approved: 27800,
    status: "PAID",
    submitted: "20 Oct 2026",
    decided: "22 Oct 2026",
    paid: "28 Oct 2026",
    days: 0,
    externalRef: "SHA-CLM-0332",
    history: [
      { to: "SUBMITTED", note: "Claim submitted", at: "20 Oct 2026" },
      { from: "SUBMITTED", to: "APPROVED", note: "Approved in full", at: "22 Oct 2026" },
      { from: "APPROVED", to: "PAID", note: "Payment received", at: "28 Oct 2026" },
    ],
  },
  {
    id: "SHA-0330",
    invoice: "INV-2026-001185",
    invoiceId: "inv-1185",
    patient: "Peter Mutiso",
    dept: "Outpatient",
    claimed: 2600,
    status: "SUBMITTED",
    submitted: "24 Oct 2026",
    days: 5,
    externalRef: "SHA-CLM-0330",
    history: [{ to: "SUBMITTED", note: "Claim submitted", at: "24 Oct 2026" }],
  },
  {
    id: "SHA-0329",
    invoice: "INV-2026-001185",
    invoiceId: "inv-1185",
    patient: "Halima Said",
    dept: "Radiology",
    claimed: 12500,
    approved: 12500,
    status: "APPROVED",
    submitted: "25 Oct 2026",
    decided: "28 Oct 2026",
    days: 0,
    externalRef: "SHA-CLM-0329",
    history: [
      { to: "SUBMITTED", note: "Claim submitted", at: "25 Oct 2026" },
      { from: "SUBMITTED", to: "APPROVED", note: "Approved in full", at: "28 Oct 2026" },
    ],
  },
];

export type EligibilityStatus = "ACTIVE" | "INACTIVE" | "LIMIT_EXHAUSTED" | "UNKNOWN";
export type EligibilityCheck = {
  id: string;
  patient: string;
  invoice: string;
  status: EligibilityStatus;
  limit: number;
  consumed: number;
  provider: string;
  reference: string;
  checkedAt: string;
};

export const eligibilityChecks: EligibilityCheck[] = [
  {
    id: "el-2201",
    patient: "Wanjiru Kamau",
    invoice: "INV-2026-001190",
    status: "ACTIVE",
    limit: 500000,
    consumed: 128000,
    provider: "simulated",
    reference: "SHA-EL-2201",
    checkedAt: "29 Oct 2026, 10:18",
  },
  {
    id: "el-2200",
    patient: "Kevin Mwangi",
    invoice: "INV-2026-001186",
    status: "LIMIT_EXHAUSTED",
    limit: 100000,
    consumed: 100000,
    provider: "simulated",
    reference: "SHA-EL-2200",
    checkedAt: "27 Oct 2026, 13:40",
  },
  {
    id: "el-2199",
    patient: "Halima Said",
    invoice: "INV-2026-001185",
    status: "ACTIVE",
    limit: 300000,
    consumed: 42000,
    provider: "simulated",
    reference: "SHA-EL-2199",
    checkedAt: "25 Oct 2026, 11:10",
  },
];

/* ------------------------------------------------------------------ */
/* Notifications                                                       */
/* ------------------------------------------------------------------ */

export type NotificationChannel = "WHATSAPP" | "EMAIL" | "SMS" | "IN_APP";
export type NotificationStatus =
  "QUEUED" | "SENDING" | "SENT" | "DELIVERED" | "FAILED" | "CANCELLED";
export type NotificationAttempt = {
  attempt: number;
  status: "SUCCESS" | "FAILED";
  error?: string;
  at: string;
};
export type Notification = {
  id: string;
  channel: NotificationChannel;
  template: string;
  recipient: string;
  status: NotificationStatus;
  attempts: number;
  scheduled: string;
  sent?: string;
  error?: string;
  createdAt: string;
  log: NotificationAttempt[];
};

export const notifications: Notification[] = [
  {
    id: "nt-6101",
    channel: "WHATSAPP",
    template: "booking_confirmation",
    recipient: "Wanjiru Kamau · 0712 448 201",
    status: "DELIVERED",
    attempts: 1,
    scheduled: "29 Oct 2026, 10:22",
    sent: "29 Oct 2026, 10:22",
    createdAt: "29 Oct 2026, 10:21",
    log: [{ attempt: 1, status: "SUCCESS", at: "29 Oct 2026, 10:22" }],
  },
  {
    id: "nt-6100",
    channel: "EMAIL",
    template: "invoice_issued",
    recipient: "Hassan Abdi · hassan.abdi@example.com",
    status: "SENT",
    attempts: 1,
    scheduled: "29 Oct 2026, 09:14",
    sent: "29 Oct 2026, 09:14",
    createdAt: "29 Oct 2026, 09:13",
    log: [{ attempt: 1, status: "SUCCESS", at: "29 Oct 2026, 09:14" }],
  },
  {
    id: "nt-6099",
    channel: "SMS",
    template: "appointment_reminder_24h",
    recipient: "Mercy Chebet · 0733 902 117",
    status: "FAILED",
    attempts: 2,
    scheduled: "28 Oct 2026, 12:00",
    error: "Consent revoked for SMS",
    createdAt: "28 Oct 2026, 11:59",
    log: [
      { attempt: 1, status: "FAILED", error: "Gateway timeout", at: "28 Oct 2026, 12:00" },
      { attempt: 2, status: "FAILED", error: "Consent revoked for SMS", at: "28 Oct 2026, 12:05" },
    ],
  },
  {
    id: "nt-6098",
    channel: "IN_APP",
    template: "claim_aging_alert",
    recipient: "Grace Mutua",
    status: "SENT",
    attempts: 1,
    scheduled: "28 Oct 2026, 08:00",
    sent: "28 Oct 2026, 08:00",
    createdAt: "28 Oct 2026, 08:00",
    log: [{ attempt: 1, status: "SUCCESS", at: "28 Oct 2026, 08:00" }],
  },
  {
    id: "nt-6097",
    channel: "EMAIL",
    template: "receipt",
    recipient: "Brian Otieno · brian.otieno@example.com",
    status: "QUEUED",
    attempts: 0,
    scheduled: "29 Oct 2026, 17:00",
    createdAt: "28 Oct 2026, 16:40",
    log: [],
  },
  {
    id: "nt-6096",
    channel: "WHATSAPP",
    template: "cash_variance_alert",
    recipient: "Grace Mutua · 0720 665 120",
    status: "FAILED",
    attempts: 3,
    scheduled: "28 Oct 2026, 18:10",
    error: "Template not approved",
    createdAt: "28 Oct 2026, 18:05",
    log: [
      { attempt: 1, status: "FAILED", error: "Template not approved", at: "28 Oct 2026, 18:10" },
      { attempt: 2, status: "FAILED", error: "Template not approved", at: "28 Oct 2026, 18:12" },
      { attempt: 3, status: "FAILED", error: "Template not approved", at: "28 Oct 2026, 18:15" },
    ],
  },
];

export type NotificationTemplate = {
  id: string;
  key: string;
  channel: NotificationChannel;
  name: string;
  subject: string;
  body: string;
  whatsappName?: string;
  version: number;
  active: boolean;
};

export const notificationTemplates: NotificationTemplate[] = [
  {
    id: "tpl-1",
    key: "booking_confirmation",
    channel: "WHATSAPP",
    name: "Appointment confirmed",
    subject: "Appointment confirmed",
    body: "Hello {patient_name}, your appointment with {doctor_name} is confirmed for {scheduled_start}.",
    whatsappName: "booking_confirmation_v2",
    version: 2,
    active: true,
  },
  {
    id: "tpl-2",
    key: "appointment_reminder_24h",
    channel: "EMAIL",
    name: "Appointment reminder",
    subject: "Reminder: your appointment tomorrow",
    body: "Hello {patient_name}, reminder: your appointment is tomorrow at {scheduled_start}.",
    version: 1,
    active: true,
  },
  {
    id: "tpl-3",
    key: "invoice_issued",
    channel: "EMAIL",
    name: "Invoice issued",
    subject: "Invoice {invoice_number}",
    body: "Hello {patient_name}, invoice {invoice_number} has been issued. Amount due: KES {amount}.",
    version: 1,
    active: true,
  },
  {
    id: "tpl-4",
    key: "receipt",
    channel: "EMAIL",
    name: "Payment receipt",
    subject: "Payment received",
    body: "Hello {patient_name}, we received your payment of KES {amount}. Reference: {reference}.",
    version: 1,
    active: true,
  },
  {
    id: "tpl-5",
    key: "claim_aging_alert",
    channel: "IN_APP",
    name: "Aging SHA claim",
    subject: "Aging SHA claim",
    body: "Claim {claim_id} has been open for {age_days} days.",
    version: 1,
    active: true,
  },
  {
    id: "tpl-6",
    key: "cash_variance_alert",
    channel: "WHATSAPP",
    name: "Cash variance alert",
    subject: "Cash variance alert",
    body: "Cash reconciliation for {business_date} has a variance of KES {variance}.",
    whatsappName: "cash_variance_alert",
    version: 1,
    active: false,
  },
];

/* ------------------------------------------------------------------ */
/* Reports & AI                                                        */
/* ------------------------------------------------------------------ */

export type ReportExport = {
  id: string;
  report: string;
  format: "CSV" | "PDF";
  status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";
  requestedBy: string;
  createdAt: string;
  size: string;
  error?: string;
};

export const reportExports: ReportExport[] = [
  {
    id: "exp-4401",
    report: "revenue",
    format: "CSV",
    status: "COMPLETED",
    requestedBy: "Samuel Ndegwa",
    createdAt: "29 Oct 2026, 08:12",
    size: "18 KB",
  },
  {
    id: "exp-4400",
    report: "claims_aging",
    format: "CSV",
    status: "COMPLETED",
    requestedBy: "Samuel Ndegwa",
    createdAt: "28 Oct 2026, 17:44",
    size: "9 KB",
  },
  {
    id: "exp-4399",
    report: "daily_cash",
    format: "PDF",
    status: "FAILED",
    requestedBy: "Grace Mutua",
    createdAt: "28 Oct 2026, 18:20",
    size: "—",
    error: "Renderer timed out",
  },
  {
    id: "exp-4398",
    report: "no_shows",
    format: "CSV",
    status: "PROCESSING",
    requestedBy: "Samuel Ndegwa",
    createdAt: "29 Oct 2026, 10:30",
    size: "—",
  },
];

export type AIFeature =
  "TRIAGE" | "VISIT_SUMMARY" | "NO_SHOW_RISK" | "REPORT_QUERY" | "DOCTOR_SUGGESTION";
export type AIInteraction = {
  id: string;
  feature: AIFeature;
  input: string;
  output: string;
  status: "DRAFT" | "COMPLETED" | "APPROVED" | "FAILED";
  approved: boolean;
  provider: string;
  createdAt: string;
};

export const aiInteractions: AIInteraction[] = [
  {
    id: "ai-3301",
    feature: "REPORT_QUERY",
    input: "Show revenue by payment method this month",
    output: "revenue · method · KSh 3.76M total",
    status: "COMPLETED",
    approved: false,
    provider: "deterministic",
    createdAt: "29 Oct 2026, 09:30",
  },
  {
    id: "ai-3300",
    feature: "VISIT_SUMMARY",
    input: "Visit V-3101 notes",
    output: "54-year-old male with exertional chest tightness…",
    status: "APPROVED",
    approved: true,
    provider: "deterministic",
    createdAt: "29 Oct 2026, 09:45",
  },
  {
    id: "ai-3299",
    feature: "TRIAGE",
    input: "Fever, headache and stiff neck for 2 days",
    output: "Urgency: EMERGENCY · Suggested: Outpatient",
    status: "COMPLETED",
    approved: false,
    provider: "deterministic",
    createdAt: "28 Oct 2026, 21:10",
  },
];

/* ------------------------------------------------------------------ */
/* Audit                                                               */
/* ------------------------------------------------------------------ */

export type AuditType =
  "void" | "delete" | "edit" | "approve" | "create" | "login" | "export" | "read" | "ai";
export type AuditEntry = {
  id: string;
  ts: string;
  user: string;
  role: string;
  type: AuditType;
  action: string;
  record: string;
  entityType: string;
  entityId: string;
  device: string;
  ip: string;
  requestId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
};

export const audit: AuditEntry[] = [
  {
    id: "au-1",
    ts: "29 Oct 2026, 16:21",
    user: "Grace Mutua",
    role: "CASHIER",
    type: "approve",
    action: "Approved SHA claim #332",
    record: "SHA-0332",
    entityType: "claim",
    entityId: "SHA-0332",
    device: "10.0.4.17 · Chrome / Windows",
    ip: "10.0.4.17",
    requestId: "req-9f2a",
    after: { status: "APPROVED", approved_amount_minor: 2780000 },
  },
  {
    id: "au-2",
    ts: "29 Oct 2026, 15:58",
    user: "Joy Wairimu",
    role: "RECEPTIONIST",
    type: "void",
    action: "Requested void for invoice #1184",
    record: "INV-1184",
    entityType: "invoice",
    entityId: "inv-1184",
    device: "10.0.2.31 · iPad Safari",
    ip: "10.0.2.31",
    requestId: "req-8b11",
    after: { status: "PENDING" },
  },
  {
    id: "au-3",
    ts: "29 Oct 2026, 15:12",
    user: "Dr. Peter Kiprono",
    role: "DOCTOR",
    type: "edit",
    action: "Updated visit V-3101",
    record: "V-3101",
    entityType: "visit",
    entityId: "V-3101",
    device: "10.0.6.08 · Chrome / macOS",
    ip: "10.0.6.08",
    requestId: "req-7c3d",
    after: { diagnosis: "Stable angina — suspected" },
  },
  {
    id: "au-4",
    ts: "29 Oct 2026, 14:40",
    user: "Ali Hassan",
    role: "RECEPTIONIST",
    type: "create",
    action: "Registered patient MF-2026-004028",
    record: "P-4028",
    entityType: "patient",
    entityId: "P-4028",
    device: "10.0.2.33 · iPad Safari",
    ip: "10.0.2.33",
    requestId: "req-6d44",
  },
  {
    id: "au-5",
    ts: "29 Oct 2026, 13:05",
    user: "Samuel Ndegwa",
    role: "ADMIN",
    type: "export",
    action: "Exported audit events (128 rows)",
    record: "audit_log",
    entityType: "audit_log",
    entityId: "—",
    device: "10.0.1.02 · Firefox / Linux",
    ip: "10.0.1.02",
    requestId: "req-5a90",
  },
  {
    id: "au-6",
    ts: "29 Oct 2026, 11:47",
    user: "Nurse Faith Njeri",
    role: "DOCTOR",
    type: "edit",
    action: "Updated vitals for patient #4021",
    record: "P-4021",
    entityType: "visit",
    entityId: "V-3099",
    device: "10.0.5.14 · Android tablet",
    ip: "10.0.5.14",
    requestId: "req-4e21",
  },
  {
    id: "au-7",
    ts: "29 Oct 2026, 10:18",
    user: "Samuel Ndegwa",
    role: "ADMIN",
    type: "ai",
    action: "Ran AI report query",
    record: "ai_interaction",
    entityType: "ai_interaction",
    entityId: "ai-3301",
    device: "10.0.1.02 · Firefox / Linux",
    ip: "10.0.1.02",
    requestId: "req-3b78",
  },
  {
    id: "au-8",
    ts: "29 Oct 2026, 09:02",
    user: "Grace Mutua",
    role: "CASHIER",
    type: "login",
    action: "Signed in",
    record: "—",
    entityType: "user",
    entityId: "usr-grace",
    device: "10.0.4.17 · Chrome / Windows",
    ip: "10.0.4.17",
    requestId: "req-2a10",
  },
  {
    id: "au-9",
    ts: "28 Oct 2026, 17:30",
    user: "Grace Mutua",
    role: "CASHIER",
    type: "approve",
    action: "Approved refund RF-500",
    record: "RF-500",
    entityType: "refund",
    entityId: "rf-500",
    device: "10.0.4.17 · Chrome / Windows",
    ip: "10.0.4.17",
    requestId: "req-1c55",
    after: { status: "APPROVED" },
  },
  {
    id: "au-10",
    ts: "28 Oct 2026, 16:15",
    user: "Joy Wairimu",
    role: "RECEPTIONIST",
    type: "void",
    action: "Voided invoice #1182",
    record: "INV-1182",
    entityType: "invoice",
    entityId: "inv-1182",
    device: "10.0.2.31 · iPad Safari",
    ip: "10.0.2.31",
    requestId: "req-0d91",
  },
  {
    id: "au-11",
    ts: "28 Oct 2026, 12:44",
    user: "Dr. Achieng Odhiambo",
    role: "DOCTOR",
    type: "create",
    action: "Issued prescription RX-2201",
    record: "RX-2201",
    entityType: "prescription",
    entityId: "RX-2201",
    device: "10.0.6.11 · Chrome / macOS",
    ip: "10.0.6.11",
    requestId: "req-9e02",
  },
  {
    id: "au-12",
    ts: "28 Oct 2026, 08:00",
    user: "System",
    role: "SYSTEM",
    type: "create",
    action: "Queued claim aging notifications",
    record: "—",
    entityType: "notification",
    entityId: "nt-6098",
    device: "celery · worker-1",
    ip: "—",
    requestId: "req-7f31",
  },
];

/* ------------------------------------------------------------------ */
/* Misc seed used on the dashboard                                     */
/* ------------------------------------------------------------------ */

export const cashSummary = {
  date: "29 Oct 2026",
  expected: 18400,
  counted: 18400,
  variance: 0,
  byMethod: [
    { method: "Cash", amount: 18400, count: 12 },
    { method: "M-Pesa", amount: 92600, count: 31 },
    { method: "Card", amount: 21400, count: 8 },
    { method: "SHA", amount: 27800, count: 1 },
  ],
};
