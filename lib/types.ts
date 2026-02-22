export type PatientStatus =
  | "Belum Dikerjakan"
  | "Identifikasi Pasien"
  | "Diskusi DPJP"
  | "Tindakan"
  | "Kontrol Pasca Tindakan"
  | "Selesai"

export interface Photo {
  id: string
  url: string
  storagePath: string
}

// Individual patient entry within a requirement
export interface PatientEntry {
  id: string
  namaPasien: string
  nomorTelp: string
}

export interface Patient {
  id: string
  requirement: string
  status: PatientStatus
  // Multi-patient list (primary source of truth)
  pasienList: PatientEntry[]
  // Legacy single-patient fields (derived / backward compat)
  hasPasien: boolean
  namaPasien: string
  nomorTelp: string
  photos: Photo[]
}

export interface SubDepartment {
  id: string
  name: string
  patients: Patient[]
}

export interface Department {
  id: string
  name: string
  patients: Patient[]
  hasSubDepartments: boolean
  subDepartments?: SubDepartment[]
}

export interface Appointment {
  id: string
  tanggal: string
  jam: string
  kubikel: string
  rencanaPerawatan: string
  kasus: string
  departemen: string
  namaPasien: string
  nomorTelp: string
  checklist: boolean
}

export interface WeeklySlotData {
  n: string
  t: string
  d: string
  pid: string
}

export interface WeeklySlot {
  id: string
  jam: string
  senin: string
  selasa: string
  rabu: string
  kamis: string
  jumat: string
  sabtu: string
  minggu: string
}

export function parseSlotValue(val: string): WeeklySlotData | "ISTIRAHAT" | "" {
  if (!val || val.trim() === "") return ""
  if (val === "ISTIRAHAT") return "ISTIRAHAT"
  try {
    const parsed = JSON.parse(val)
    if (parsed && typeof parsed === "object" && "n" in parsed) return parsed as WeeklySlotData
  } catch {
    const parts = val.split(" - ")
    return { n: parts[0] || val, t: "", d: parts[1] || "", pid: "" }
  }
  return ""
}

export function serializeSlotData(data: WeeklySlotData): string {
  return JSON.stringify(data)
}

// Sync legacy fields from pasienList
export function syncLegacyFields(p: Patient): Patient {
  const first = p.pasienList[0]
  return {
    ...p,
    hasPasien: p.pasienList.length > 0,
    namaPasien: first?.namaPasien ?? "",
    nomorTelp: first?.nomorTelp ?? "",
  }
}

export const STATUS_OPTIONS: PatientStatus[] = [
  "Belum Dikerjakan",
  "Identifikasi Pasien",
  "Diskusi DPJP",
  "Tindakan",
  "Kontrol Pasca Tindakan",
  "Selesai",
]

export const STATUS_COLORS: Record<PatientStatus, { bg: string; text: string; ring: string }> = {
  "Belum Dikerjakan":       { bg: "bg-[#f8e0de]", text: "text-[#9e2b22]",  ring: "ring-[#e8a8a2]" },
  "Identifikasi Pasien":    { bg: "bg-[#d6e8f8]", text: "text-[#1a4f80]",  ring: "ring-[#8cbae0]" },
  "Diskusi DPJP":           { bg: "bg-[#fcedd0]", text: "text-[#8a5d10]",  ring: "ring-[#dbb560]" },
  "Tindakan":               { bg: "bg-[#e8d6f5]", text: "text-[#5a2080]",  ring: "ring-[#b888d8]" },
  "Kontrol Pasca Tindakan": { bg: "bg-[#d0f0dc]", text: "text-[#1a6040]",  ring: "ring-[#6cc498]" },
  "Selesai":                { bg: "bg-[#c8ecc0]", text: "text-[#1a6010]",  ring: "ring-[#5cb848]" },
}

export const STATUS_WEIGHT: Record<PatientStatus, number> = {
  "Belum Dikerjakan": 0, "Identifikasi Pasien": 1, "Diskusi DPJP": 2,
  "Tindakan": 3, "Kontrol Pasca Tindakan": 4, "Selesai": 5,
}

export function getProgressColor(percent: number): string {
  if (percent <= 20) return "#c0392b"
  if (percent <= 40) return "#d35400"
  if (percent <= 60) return "#d4a017"
  if (percent <= 80) return "#6aab3d"
  return "#1e8c3a"
}

export function getRowStatusClass(status: PatientStatus): string {
  if (status === "Selesai") return "bg-[#e6f5e0]"
  if (status === "Belum Dikerjakan") return "bg-[#fdf0ef]"
  return ""
}

export function formatPhoneForWA(phone: string): string {
  let clean = phone.replace(/[^\d+]/g, "")
  if (clean.startsWith("0")) clean = "62" + clean.slice(1)
  else if (clean.startsWith("+62")) clean = clean.slice(1)
  else if (!clean.startsWith("62")) clean = "62" + clean
  return clean
}

export function formatDateWithDay(dateStr: string): string {
  if (!dateStr) return "-"
  const date = new Date(dateStr + "T00:00:00")
  const dayNames = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"]
  const dd = String(date.getDate()).padStart(2, "0")
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  return `${dayNames[date.getDay()]}, ${dd}/${mm}/${date.getFullYear()}`
}

export const formatDateDDMMYYYY = formatDateWithDay

// ─── Default Data ──────────────────────────────────────────────────────────────
export const DEFAULT_WEEKLY: WeeklySlot[] = [
  { id: "w1",  jam: "08:00", senin: "", selasa: "", rabu: "", kamis: "", jumat: "", sabtu: "", minggu: "" },
  { id: "w2",  jam: "09:00", senin: "", selasa: "", rabu: "", kamis: "", jumat: "", sabtu: "", minggu: "" },
  { id: "w3",  jam: "10:00", senin: "", selasa: "", rabu: "", kamis: "", jumat: "", sabtu: "", minggu: "" },
  { id: "w4",  jam: "11:00", senin: "", selasa: "", rabu: "", kamis: "", jumat: "", sabtu: "", minggu: "" },
  { id: "w5",  jam: "12:00", senin: "ISTIRAHAT", selasa: "ISTIRAHAT", rabu: "ISTIRAHAT", kamis: "ISTIRAHAT", jumat: "ISTIRAHAT", sabtu: "ISTIRAHAT", minggu: "ISTIRAHAT" },
  { id: "w6",  jam: "13:00", senin: "", selasa: "", rabu: "", kamis: "", jumat: "", sabtu: "", minggu: "" },
  { id: "w7",  jam: "14:00", senin: "", selasa: "", rabu: "", kamis: "", jumat: "", sabtu: "", minggu: "" },
  { id: "w8",  jam: "15:00", senin: "", selasa: "", rabu: "", kamis: "", jumat: "", sabtu: "", minggu: "" },
  { id: "w9",  jam: "16:00", senin: "", selasa: "", rabu: "", kamis: "", jumat: "", sabtu: "", minggu: "" },
  { id: "w10", jam: "17:00", senin: "", selasa: "", rabu: "", kamis: "", jumat: "", sabtu: "", minggu: "" },
  { id: "w11", jam: "18:00", senin: "", selasa: "", rabu: "", kamis: "", jumat: "", sabtu: "", minggu: "" },
  { id: "w12", jam: "19:00", senin:   "", selasa: "", rabu: "", kamis: "", jumat: "", sabtu: "", minggu: "" },
  { id: "w13", jam: "20:00", senin: "", selasa: "", rabu: "", kamis: "", jumat: "", sabtu: "", minggu: "" },
  { id: "w14", jam: "21:00", senin: "", selasa: "", rabu: "", kamis: "", jumat: "", sabtu: "", minggu: "" },
  { id: "w15", jam: "22:00", senin: "", selasa: "", rabu: "", kamis: "", jumat: "", sabtu: "", minggu: "" },
  { id: "w16", jam: "23:00", senin: "", selasa: "", rabu: "", kamis: "", jumat: "", sabtu: "", minggu: "" },
  { id: "w17", jam: "24:00", senin: "", selasa: "", rabu: "", kamis: "", jumat: "", sabtu: "", minggu: "" },
]