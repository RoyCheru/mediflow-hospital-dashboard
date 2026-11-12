export type QueueStatus = "IN_CONSULTATION" | "CHECKED_IN" | "WAITING" | "SCHEDULED" | "COMPLETED";
export type Urgency = "ROUTINE" | "URGENT" | "EMERGENCY";
export type AppointmentSource = "WALK_IN" | "RECEPTION" | "ONLINE";

export type DoctorHistoryEvent = {
  at: string;
  summary: string;
  detail: string;
  type: "visit" | "prescription" | "lab" | "admission";
};

export type DoctorLab = {
  id: string;
  name: string;
  type: "LAB_REPORT" | "SCAN" | "ECG";
  at: string;
  status: "READY" | "CRITICAL" | "REVIEWED";
};

export type DoctorPrescription = {
  id: string;
  drug: string;
  dose: string;
  frequency: string;
  duration: string;
  route: string;
  status: "ACTIVE" | "COMPLETED";
};

export type DoctorPatient = {
  id: string;
  number: string;
  name: string;
  age: number;
  sex: "MALE" | "FEMALE";
  phone: string;
  blood: string;
  allergies: string;
  chronic: string;
  medications: string;
  condition: string;
  noShowScore: number;
  history: DoctorHistoryEvent[];
  labs: DoctorLab[];
  prescriptions: DoctorPrescription[];
};

export type DoctorQueueItem = {
  id: string;
  patientId: string;
  time: string;
  service: string;
  urgency: Urgency;
  source: AppointmentSource;
  status: QueueStatus;
  room: string;
  wait: string;
};

export type DoctorConsultation = {
  id: string;
  patientId: string;
  patient: string;
  diagnosis: string;
  completedAt: string;
  duration: string;
  summary: string;
  aiApproved: boolean;
  followUp: string;
};

export type ResultAlert = {
  id: string;
  patientId: string;
  patient: string;
  result: string;
  received: string;
  severity: "ROUTINE" | "ABNORMAL" | "CRITICAL";
};

export type WeeklyPoint = {
  day: string;
  patients: number;
  revenue: number;
};

export const doctorProfile = {
  id: "doc-kiprono",
  name: "Dr. Peter Kiprono",
  firstName: "Peter",
  department: "Cardiology",
  specialty: "Cardiologist",
  license: "KMPDC-10442",
  shift: "08:00 – 17:00",
  room: "Cardiology · Room 4",
  date: "Tuesday, 29 October 2026",
};

export const doctorPatients: DoctorPatient[] = [
  {
    id: "P-C101",
    number: "MF-2026-004022",
    name: "Brian Otieno",
    age: 54,
    sex: "MALE",
    phone: "+254 722 190 554",
    blood: "A+",
    allergies: "None",
    chronic: "Hypertension",
    medications: "Amlodipine 5mg",
    condition: "Stable angina — suspected",
    noShowScore: 0.12,
    history: [
      {
        at: "29 Oct 2026, 09:05",
        summary: "Cardiac stress test follow-up",
        detail: "Exertional chest tightness for 2 weeks. ECG normal sinus rhythm.",
        type: "visit",
      },
      {
        at: "12 Oct 2026",
        summary: "Hypertension review",
        detail: "BP 142/92. Continue amlodipine, diet and exercise advice.",
        type: "visit",
      },
      {
        at: "20 Sep 2026",
        summary: "Lipid profile",
        detail: "LDL 3.8 mmol/L. Started atorvastatin 20mg.",
        type: "lab",
      },
    ],
    labs: [
      {
        id: "LB-4022-A",
        name: "ECG strip",
        type: "ECG",
        at: "29 Oct 2026, 09:18",
        status: "REVIEWED",
      },
      {
        id: "LB-4022-B",
        name: "Lipid profile",
        type: "LAB_REPORT",
        at: "20 Sep 2026",
        status: "READY",
      },
    ],
    prescriptions: [
      {
        id: "RX-2201",
        drug: "Aspirin",
        dose: "75mg",
        frequency: "Once daily",
        duration: "30 days",
        route: "Oral",
        status: "ACTIVE",
      },
      {
        id: "RX-2198",
        drug: "Amlodipine",
        dose: "5mg",
        frequency: "Once daily",
        duration: "30 days",
        route: "Oral",
        status: "ACTIVE",
      },
    ],
  },
  {
    id: "P-C102",
    number: "MF-2026-004026",
    name: "Samuel Kiptoo",
    age: 61,
    sex: "MALE",
    phone: "+254 733 881 004",
    blood: "B+",
    allergies: "None",
    chronic: "Atrial fibrillation",
    medications: "Warfarin 5mg",
    condition: "Arrhythmia review",
    noShowScore: 0.18,
    history: [
      {
        at: "18 Oct 2026",
        summary: "INR check",
        detail: "INR 2.4, within target range. Continue warfarin 5mg.",
        type: "lab",
      },
      {
        at: "02 Oct 2026",
        summary: "Palpitations review",
        detail: "Paroxysmal AF. Rate controlled. No anticoagulation changes.",
        type: "visit",
      },
    ],
    labs: [
      {
        id: "LB-4026-A",
        name: "INR / PT",
        type: "LAB_REPORT",
        at: "29 Oct 2026, 08:55",
        status: "READY",
      },
      {
        id: "LB-4026-B",
        name: "12-lead ECG",
        type: "ECG",
        at: "02 Oct 2026",
        status: "REVIEWED",
      },
    ],
    prescriptions: [
      {
        id: "RX-2170",
        drug: "Warfarin",
        dose: "5mg",
        frequency: "Once daily",
        duration: "90 days",
        route: "Oral",
        status: "ACTIVE",
      },
      {
        id: "RX-2169",
        drug: "Bisoprolol",
        dose: "2.5mg",
        frequency: "Once daily",
        duration: "90 days",
        route: "Oral",
        status: "ACTIVE",
      },
    ],
  },
  {
    id: "P-C103",
    number: "MF-2026-004025",
    name: "Hassan Abdi",
    age: 47,
    sex: "MALE",
    phone: "+254 711 223 908",
    blood: "O+",
    allergies: "Sulfa drugs",
    chronic: "Type 2 diabetes",
    medications: "Metformin 500mg",
    condition: "Hypertension review",
    noShowScore: 0.05,
    history: [
      {
        at: "29 Oct 2026, 08:35",
        summary: "Diabetes review",
        detail: "HbA1c 7.4%. Adherence good. Continue metformin.",
        type: "visit",
      },
      {
        at: "15 Sep 2026",
        summary: "Blood pressure review",
        detail: "BP 138/86. Lifestyle advice reinforced.",
        type: "visit",
      },
    ],
    labs: [
      {
        id: "LB-4025-A",
        name: "HbA1c",
        type: "LAB_REPORT",
        at: "29 Oct 2026, 08:20",
        status: "REVIEWED",
      },
    ],
    prescriptions: [
      {
        id: "RX-2200",
        drug: "Metformin",
        dose: "500mg",
        frequency: "Twice daily",
        duration: "90 days",
        route: "Oral",
        status: "ACTIVE",
      },
    ],
  },
  {
    id: "P-C104",
    number: "MF-2026-004028",
    name: "Halima Said",
    age: 36,
    sex: "FEMALE",
    phone: "+254 722 505 119",
    blood: "AB+",
    allergies: "Iodine",
    chronic: "Asthma",
    medications: "Salbutamol inhaler",
    condition: "Chest imaging follow-up",
    noShowScore: 0.07,
    history: [
      {
        at: "26 Oct 2026",
        summary: "Chest CT requested",
        detail: "Persistent cough and exertional breathlessness. CT chest ordered.",
        type: "visit",
      },
      {
        at: "10 Oct 2026",
        summary: "Asthma review",
        detail: "Well controlled. Inhaler technique checked.",
        type: "visit",
      },
    ],
    labs: [
      {
        id: "LB-4028-A",
        name: "CT chest",
        type: "SCAN",
        at: "29 Oct 2026, 09:42",
        status: "CRITICAL",
      },
      {
        id: "LB-4028-B",
        name: "Chest X-ray",
        type: "SCAN",
        at: "26 Oct 2026",
        status: "REVIEWED",
      },
    ],
    prescriptions: [
      {
        id: "RX-2185",
        drug: "Salbutamol",
        dose: "100mcg",
        frequency: "As needed",
        duration: "60 days",
        route: "Inhalation",
        status: "ACTIVE",
      },
    ],
  },
  {
    id: "P-C105",
    number: "MF-2026-004024",
    name: "Kevin Mwangi",
    age: 42,
    sex: "MALE",
    phone: "+254 701 772 600",
    blood: "O-",
    allergies: "None",
    chronic: "None",
    medications: "Ibuprofen 400mg",
    condition: "Post-op cardiac rehab",
    noShowScore: 0.31,
    history: [
      {
        at: "21 Oct 2026",
        summary: "Cardiac rehab assessment",
        detail: "Post CABG week 6. Cleared for supervised exercise.",
        type: "visit",
      },
      {
        at: "08 Oct 2026",
        summary: "Wound review",
        detail: "Surgical wound healed. No signs of infection.",
        type: "visit",
      },
    ],
    labs: [
      {
        id: "LB-4024-A",
        name: "Troponin panel",
        type: "LAB_REPORT",
        at: "08 Oct 2026",
        status: "REVIEWED",
      },
    ],
    prescriptions: [
      {
        id: "RX-2210",
        drug: "Aspirin",
        dose: "75mg",
        frequency: "Once daily",
        duration: "180 days",
        route: "Oral",
        status: "ACTIVE",
      },
    ],
  },
  {
    id: "P-C106",
    number: "MF-2026-004023",
    name: "Mercy Chebet",
    age: 6,
    sex: "FEMALE",
    phone: "+254 733 902 117",
    blood: "A+",
    allergies: "None",
    chronic: "None",
    medications: "None",
    condition: "Pediatric cardiac screening",
    noShowScore: 0.2,
    history: [
      {
        at: "29 Oct 2026",
        summary: "Pediatric cardiac screening",
        detail: "Referred after incidental murmur detected at school screening.",
        type: "visit",
      },
    ],
    labs: [
      {
        id: "LB-4023-A",
        name: "Echocardiogram",
        type: "SCAN",
        at: "29 Oct 2026, 10:12",
        status: "READY",
      },
    ],
    prescriptions: [],
  },
  {
    id: "P-C107",
    number: "MF-2026-004031",
    name: "Margaret Wambui",
    age: 68,
    sex: "FEMALE",
    phone: "+254 720 448 112",
    blood: "B-",
    allergies: "Penicillin",
    chronic: "Coronary artery disease",
    medications: "Atorvastatin 20mg",
    condition: "Chest pain assessment",
    noShowScore: 0.04,
    history: [
      {
        at: "27 Oct 2026",
        summary: "Cardiology clinic",
        detail: "Stable angina. Continue statin and antiplatelet therapy.",
        type: "visit",
      },
      {
        at: "05 Oct 2026",
        summary: "Coronary angiogram",
        detail: "Moderate LAD stenosis. Medical management recommended.",
        type: "lab",
      },
    ],
    labs: [
      {
        id: "LB-4031-A",
        name: "Troponin panel",
        type: "LAB_REPORT",
        at: "29 Oct 2026, 09:35",
        status: "CRITICAL",
      },
      {
        id: "LB-4031-B",
        name: "Coronary angiogram report",
        type: "SCAN",
        at: "05 Oct 2026",
        status: "REVIEWED",
      },
    ],
    prescriptions: [
      {
        id: "RX-2205",
        drug: "Atorvastatin",
        dose: "20mg",
        frequency: "Once at night",
        duration: "90 days",
        route: "Oral",
        status: "ACTIVE",
      },
      {
        id: "RX-2204",
        drug: "Clopidogrel",
        dose: "75mg",
        frequency: "Once daily",
        duration: "90 days",
        route: "Oral",
        status: "ACTIVE",
      },
    ],
  },
  {
    id: "P-C108",
    number: "MF-2026-004032",
    name: "Peter Mwaura",
    age: 58,
    sex: "MALE",
    phone: "+254 712 880 441",
    blood: "A+",
    allergies: "None",
    chronic: "Heart failure",
    medications: "Furosemide 40mg",
    condition: "Post-discharge review",
    noShowScore: 0.09,
    history: [
      {
        at: "29 Oct 2026, 08:30",
        summary: "Post-discharge review",
        detail: "Admitted for decompensated heart failure. Now stable.",
        type: "visit",
      },
      {
        at: "18 Oct 2026",
        summary: "Discharge",
        detail: "Diuresis completed. Weight down 4kg. Follow-up in 10 days.",
        type: "admission",
      },
    ],
    labs: [
      {
        id: "LB-4032-A",
        name: "BNP",
        type: "LAB_REPORT",
        at: "29 Oct 2026, 08:10",
        status: "READY",
      },
      {
        id: "LB-4032-B",
        name: "Chest X-ray",
        type: "SCAN",
        at: "18 Oct 2026",
        status: "REVIEWED",
      },
    ],
    prescriptions: [
      {
        id: "RX-2190",
        drug: "Furosemide",
        dose: "40mg",
        frequency: "Once daily",
        duration: "30 days",
        route: "Oral",
        status: "ACTIVE",
      },
      {
        id: "RX-2191",
        drug: "Sacubitril/Valsartan",
        dose: "50mg",
        frequency: "Twice daily",
        duration: "30 days",
        route: "Oral",
        status: "ACTIVE",
      },
    ],
  },
];

export const doctorQueue: DoctorQueueItem[] = [
  {
    id: "DQ-1",
    patientId: "P-C108",
    time: "08:30",
    service: "Post-discharge review",
    urgency: "ROUTINE",
    source: "ONLINE",
    status: "COMPLETED",
    room: "Room 4",
    wait: "—",
  },
  {
    id: "DQ-2",
    patientId: "P-C101",
    time: "09:00",
    service: "Cardiac stress test",
    urgency: "ROUTINE",
    source: "RECEPTION",
    status: "IN_CONSULTATION",
    room: "Room 4",
    wait: "In progress",
  },
  {
    id: "DQ-3",
    patientId: "P-C102",
    time: "09:30",
    service: "ECG & arrhythmia review",
    urgency: "URGENT",
    source: "WALK_IN",
    status: "CHECKED_IN",
    room: "Room 4",
    wait: "18 min",
  },
  {
    id: "DQ-4",
    patientId: "P-C107",
    time: "10:00",
    service: "Chest pain assessment",
    urgency: "EMERGENCY",
    source: "WALK_IN",
    status: "WAITING",
    room: "Room 4",
    wait: "8 min",
  },
  {
    id: "DQ-5",
    patientId: "P-C103",
    time: "10:30",
    service: "Hypertension review",
    urgency: "ROUTINE",
    source: "RECEPTION",
    status: "CHECKED_IN",
    room: "Room 4",
    wait: "22 min",
  },
  {
    id: "DQ-6",
    patientId: "P-C104",
    time: "11:15",
    service: "Chest imaging follow-up",
    urgency: "URGENT",
    source: "WALK_IN",
    status: "WAITING",
    room: "Room 4",
    wait: "12 min",
  },
  {
    id: "DQ-7",
    patientId: "P-C106",
    time: "12:00",
    service: "Pediatric cardiac screening",
    urgency: "ROUTINE",
    source: "ONLINE",
    status: "SCHEDULED",
    room: "Room 4",
    wait: "Scheduled",
  },
  {
    id: "DQ-8",
    patientId: "P-C105",
    time: "14:15",
    service: "Post-op cardiac rehab",
    urgency: "ROUTINE",
    source: "RECEPTION",
    status: "SCHEDULED",
    room: "Room 4",
    wait: "Scheduled",
  },
];

export const recentConsultations: DoctorConsultation[] = [
  {
    id: "RC-1",
    patientId: "P-C101",
    patient: "Brian Otieno",
    diagnosis: "Stable angina — suspected",
    completedAt: "Today, 09:42",
    duration: "37 min",
    summary:
      "54-year-old male with exertional chest tightness and hypertension. ECG shows normal sinus rhythm. Plan: stress test, aspirin, cardiology review in two weeks.",
    aiApproved: true,
    followUp: "12 Nov 2026",
  },
  {
    id: "RC-2",
    patientId: "P-C108",
    patient: "Peter Mwaura",
    diagnosis: "Heart failure — stable",
    completedAt: "Today, 08:45",
    duration: "15 min",
    summary:
      "Post-discharge review after decompensated heart failure. Weight down 4kg, no orthopnoea. Continue diuretic and sacubitril/valsartan; repeat BNP.",
    aiApproved: false,
    followUp: "05 Nov 2026",
  },
  {
    id: "RC-3",
    patientId: "P-C103",
    patient: "Hassan Abdi",
    diagnosis: "Type 2 diabetes — controlled",
    completedAt: "Yesterday, 16:10",
    duration: "21 min",
    summary:
      "Routine diabetes review. HbA1c 7.4%, adherence good. Continue metformin, reinforce diet and exercise, repeat HbA1c in three months.",
    aiApproved: true,
    followUp: "28 Jan 2027",
  },
];

export const newResults: ResultAlert[] = [
  {
    id: "NR-1",
    patientId: "P-C104",
    patient: "Halima Said",
    result: "CT chest report ready",
    received: "8 min ago",
    severity: "CRITICAL",
  },
  {
    id: "NR-2",
    patientId: "P-C107",
    patient: "Margaret Wambui",
    result: "Troponin panel flagged",
    received: "14 min ago",
    severity: "CRITICAL",
  },
  {
    id: "NR-3",
    patientId: "P-C102",
    patient: "Samuel Kiptoo",
    result: "INR result available",
    received: "22 min ago",
    severity: "ABNORMAL",
  },
  {
    id: "NR-4",
    patientId: "P-C101",
    patient: "Brian Otieno",
    result: "Lipid profile ready",
    received: "45 min ago",
    severity: "ROUTINE",
  },
];

export const weeklyActivity: WeeklyPoint[] = [
  { day: "Mon", patients: 12, revenue: 42 },
  { day: "Tue", patients: 14, revenue: 51 },
  { day: "Wed", patients: 11, revenue: 38 },
  { day: "Thu", patients: 16, revenue: 58 },
  { day: "Fri", patients: 13, revenue: 47 },
  { day: "Sat", patients: 6, revenue: 21 },
  { day: "Sun", patients: 0, revenue: 0 },
];

export const todaySchedule = [
  { time: "08:00", title: "Cardiology clinic opens", detail: "Room 4 · 8 slots" },
  { time: "08:30", title: "Post-discharge review", detail: "Peter Mwaura" },
  { time: "09:00", title: "Cardiac stress test", detail: "Brian Otieno" },
  { time: "10:00", title: "Chest pain assessment", detail: "Margaret Wambui · urgent" },
  { time: "12:30", title: "Open slot", detail: "30 minutes" },
  { time: "14:15", title: "Cardiac rehab", detail: "Kevin Mwangi" },
];

export const availabilitySummary = {
  shift: "08:00 – 17:00",
  slotLength: "30 minutes",
  nextOpen: ["12:30", "13:00", "13:30"],
  exceptions: [
    { date: "Tomorrow", detail: "Theatre list · 09:00 – 13:00" },
    { date: "Friday", detail: "CME session · 15:00 – 17:00" },
  ],
};

export const doctorStats = {
  patientsSeen: 11,
  patientsSeenChange: 12.5,
  avgConsultation: "18 min",
  avgConsultationChange: -8.2,
  monthRevenue: 428500,
  monthRevenueChange: 9.4,
  pendingResults: 4,
  pendingResultsChange: 33.3,
  satisfaction: 4.9,
};
