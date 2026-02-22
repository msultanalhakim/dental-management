import { supabase } from "./supabase"
import type { Department, Patient, PatientEntry, SubDepartment, Appointment, WeeklySlot, Photo } from "./types"
import { syncLegacyFields } from "./types"
import bcryptjs from "bcryptjs"

// ─── AUTH ─────────────────────────────────────────────────────────────────────

export async function verifyPassword(password: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("admin_auth")
    .select("password_hash")
    .limit(1)
    .single()
  if (error || !data) return false
  return bcryptjs.compare(password, data.password_hash)
}

// ─── DEPARTMENTS ─────────────────────────────────────────────────────────────

export async function fetchDepartments(): Promise<Department[]> {
  const { data: depts, error } = await supabase
    .from("departments")
    .select("*")
    .order("sort_order", { ascending: true })
  if (error || !depts) return []

  const { data: subs } = await supabase
    .from("sub_departments")
    .select("*")
    .order("sort_order", { ascending: true })

  const { data: patients } = await supabase
    .from("patients")
    .select("*")
    .order("sort_order", { ascending: true })

  const { data: photos } = await supabase.from("patient_photos").select("*")

  const photosByPatient: Record<string, Photo[]> = {}
  for (const ph of photos || []) {
    if (!photosByPatient[ph.patient_id]) photosByPatient[ph.patient_id] = []
    photosByPatient[ph.patient_id].push({
      id: ph.id,
      url: ph.photo_url,
      storagePath: ph.storage_path,
    })
  }

  const toPatient = (row: Record<string, unknown>): Patient => {
    // Parse pasienList from JSON or build from legacy fields
    let pasienList: PatientEntry[] = []
    try {
      if (row.pasien_list) {
        pasienList = JSON.parse(row.pasien_list as string)
      }
    } catch { /* empty */ }
    // Fallback: if pasienList empty but legacy fields exist, migrate
    if (pasienList.length === 0 && row.has_pasien && row.nama_pasien) {
      pasienList = [{
        id: `pe-${row.id}`,
        namaPasien: row.nama_pasien as string,
        nomorTelp: row.nomor_telp as string,
      }]
    }
    const first = pasienList[0]
    return {
      id: row.id as string,
      requirement: row.requirement as string,
      status: row.status as Patient["status"],
      pasienList,
      hasPasien: pasienList.length > 0,
      namaPasien: first?.namaPasien ?? (row.nama_pasien as string ?? ""),
      nomorTelp: first?.nomorTelp ?? (row.nomor_telp as string ?? ""),
      photos: photosByPatient[row.id as string] || [],
    }
  }

  return depts.map((d) => {
    const deptSubs = (subs || []).filter((s) => s.department_id === d.id)
    const directPatients = (patients || []).filter((p) => p.department_id === d.id && !p.sub_department_id)
    return {
      id: d.id,
      name: d.name,
      hasSubDepartments: d.has_sub_departments,
      patients: directPatients.map(toPatient),
      subDepartments: deptSubs.map((s) => ({
        id: s.id,
        name: s.name,
        patients: (patients || []).filter((p) => p.sub_department_id === s.id).map(toPatient),
      })),
    } as Department
  })
}

export async function upsertDepartment(dept: Department) {
  await supabase.from("departments").upsert({
    id: dept.id,
    name: dept.name,
    has_sub_departments: dept.hasSubDepartments,
  })
}

export async function deleteDepartment(id: string) {
  await supabase.from("departments").delete().eq("id", id)
}

// ─── SUB DEPARTMENTS ─────────────────────────────────────────────────────────

export async function upsertSubDepartment(sub: SubDepartment, departmentId: string) {
  await supabase.from("sub_departments").upsert({
    id: sub.id,
    department_id: departmentId,
    name: sub.name,
  })
}

export async function deleteSubDepartment(id: string) {
  await supabase.from("sub_departments").delete().eq("id", id)
}

// ─── PATIENTS ────────────────────────────────────────────────────────────────

export async function upsertPatient(
  patient: Patient,
  departmentId: string,
  subDepartmentId?: string
) {
  const synced = syncLegacyFields(patient)
  await supabase.from("patients").upsert({
    id: synced.id,
    department_id: departmentId,
    sub_department_id: subDepartmentId || null,
    requirement: synced.requirement,
    status: synced.status,
    has_pasien: synced.hasPasien,
    nama_pasien: synced.namaPasien,
    nomor_telp: synced.nomorTelp,
    pasien_list: JSON.stringify(synced.pasienList),
  })
}

export async function deletePatient(id: string) {
  // Delete from storage first
  const { data: photos } = await supabase
    .from("patient_photos")
    .select("storage_path")
    .eq("patient_id", id)

  if (photos && photos.length > 0) {
    const paths = photos.map((p) => p.storage_path).filter(Boolean)
    if (paths.length > 0) {
      await supabase.storage.from("patient-photos").remove(paths)
    }
  }
  await supabase.from("patients").delete().eq("id", id)
}

// ─── PHOTOS ──────────────────────────────────────────────────────────────────

export async function uploadPhotoBase64(patientId: string, base64: string): Promise<Photo | null> {
  const res = await fetch(base64)
  const blob = await res.blob()

  // 5MB limit
  if (blob.size > 5 * 1024 * 1024) {
    throw new Error("Ukuran foto maksimum 5 MB")
  }

  const ext = blob.type.split("/")[1] || "jpg"
  const path = `${patientId}/${Date.now()}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from("patient-photos")
    .upload(path, blob, { contentType: blob.type, upsert: true })

  if (uploadError) return null

  const { data: { publicUrl } } = supabase.storage
    .from("patient-photos")
    .getPublicUrl(path)

  const { data, error } = await supabase
    .from("patient_photos")
    .insert({ patient_id: patientId, storage_path: path, photo_url: publicUrl })
    .select()
    .single()

  if (error || !data) return null
  return { id: data.id, url: publicUrl, storagePath: path }
}

export async function deletePhoto(photo: Photo) {
  if (photo.storagePath) {
    await supabase.storage.from("patient-photos").remove([photo.storagePath])
  }
  await supabase.from("patient_photos").delete().eq("id", photo.id)
}

// ─── APPOINTMENTS ─────────────────────────────────────────────────────────────

export async function fetchAppointments(): Promise<Appointment[]> {
  const { data, error } = await supabase
    .from("appointments")
    .select("*")
    .order("tanggal", { ascending: false })
  if (error || !data) return []
  return data.map((row) => ({
    id: row.id,
    tanggal: row.tanggal,
    jam: row.jam.substring(0, 5),
    kubikel: row.kubikel,
    rencanaPerawatan: row.rencana_perawatan,
    kasus: row.kasus,
    departemen: row.departemen,
    namaPasien: row.nama_pasien,
    nomorTelp: row.nomor_telp,
    checklist: row.checklist,
  }))
}

export async function upsertAppointment(appt: Appointment) {
  await supabase.from("appointments").upsert({
    id: appt.id,
    tanggal: appt.tanggal,
    jam: appt.jam,
    kubikel: appt.kubikel,
    rencana_perawatan: appt.rencanaPerawatan,
    kasus: appt.kasus,
    departemen: appt.departemen,
    nama_pasien: appt.namaPasien,
    nomor_telp: appt.nomorTelp,
    checklist: appt.checklist,
  })
}

export async function deleteAppointment(id: string) {
  await supabase.from("appointments").delete().eq("id", id)
}

// ─── WEEKLY SLOTS ─────────────────────────────────────────────────────────────

export async function fetchWeeklySlots(): Promise<WeeklySlot[]> {
  const { data, error } = await supabase
    .from("weekly_slots")
    .select("*")
    .order("sort_order", { ascending: true })
  if (error || !data) return []
  return data.map((row) => ({
    id: row.id, jam: row.jam,
    senin: row.senin || "", selasa: row.selasa || "", rabu: row.rabu || "",
    kamis: row.kamis || "", jumat: row.jumat || "", sabtu: row.sabtu || "",
    minggu: row.minggu || "",
  }))
}

export async function upsertWeeklySlot(slot: WeeklySlot) {
  await supabase.from("weekly_slots").upsert({
    id: slot.id, jam: slot.jam,
    senin: slot.senin, selasa: slot.selasa, rabu: slot.rabu,
    kamis: slot.kamis, jumat: slot.jumat, sabtu: slot.sabtu, minggu: slot.minggu,
  })
}

// ─── CHANGE PASSWORD ──────────────────────────────────────────────────────────

export async function changePassword(newPassword: string): Promise<void> {
  const hash = await bcryptjs.hash(newPassword, 10)
  // Update the first (and only) admin_auth row
  const { data } = await supabase.from("admin_auth").select("id").limit(1).single()
  if (data) {
    await supabase.from("admin_auth").update({ password_hash: hash }).eq("id", data.id)
  } else {
    await supabase.from("admin_auth").insert({ password_hash: hash })
  }
}