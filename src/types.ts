export type Role = "doctor" | "receptionist";

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: Role;
  createdAt: number;
}

export interface Patient {
  id: string;
  name: string;
  phone: string;
  age: number;
  gender: "male" | "female" | "other";
  createdAt: number;
}

export interface Appointment {
  id: string;
  patientId: string;
  patientName: string;
  date: string; // YYYY-MM-DD
  session: "morning" | "evening";
  tokenNumber: number;
  status: "booked" | "completed" | "cancelled";
  consultationReason: string;
  doctorFee: number;
  platformFee: number;
  medicationFee?: number;
  diagnosis?: string;
  paymentStatus: "pending" | "paid";
  createdAt: number;
}

export interface Prescription {
  id: string;
  appointmentId: string;
  patientId: string;
  pdfDataUri: string;
  createdAt: number;
}

export interface MedicalDocument {
  id: string;
  patientId: string;
  name: string;
  fileDataUri: string;
  createdAt: number;
}
