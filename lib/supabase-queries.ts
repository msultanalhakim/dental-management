import { supabase } from "./supabase"
import type { Department, Patient, PatientEntry, SubDepartment, Appointment, WeeklySlot, Photo, AppUser } from "./types"
import { syncLegacyFields } from "./types"
import bcryptjs from "bcryptjs"

// ─── AUTH ─────────────────────────────────────────────────────────────────────

export async function loginUser(username: string, password: string): Promise<AppUser | null> {
  const { data, error } = await supabase
    .from("app_users")
    .select("*")
    .eq("username", username.trim().toLowerCase())
    .eq("is_active", true)
    .single()
  if (error || !data) return null
  const ok = await bcryptjs.compare(password, data.password_hash)
  if (!ok) return null
  return {
    id: data.id,
    username: data.username,
    role: data.role,
    displayName: data.display_name || data.username,
    isActive: data.is_active,
  }
}

export async function verifyPassword(password: string): Promise<boolean> {
  // Legacy single-password check (kept for backward compat with admin_auth table)
  const { data, error } = await supabase
    .from("admin_auth")
    .select("password_hash")
    .limit(1)
    .single()
  if (error || !data) return false
  return bcryptjs.compare(password, data.password_hash)
}

// ─── USER MANAGEMENT (admin only) ─────────────────────────────────────────────

export async function fetchUsers(): Promise<AppUser[]> {
  const { data, error } = await supabase
    .from("app_users")
    .select("id, username, role, display_name, is_active, created_at")
    .order("created_at", { ascending: true })
  if (error || !data) return []
  return data.map((u) => ({
    id: u.id,
    username: u.username,
    role: u.role,
    displayName: u.display_name || u.username,
    isActive: u.is_active,
  }))
}

export async function createUser(username: string, password: string, role: "admin" | "user", displayName: string): Promise<AppUser | null> {
  const hash = await bcryptjs.hash(password, 10)
  const { data, error } = await supabase
    .from("app_users")
    .insert({
      username: username.trim().toLowerCase(),
      password_hash: hash,
      role,
      display_name: displayName.trim(),
      is_active: true,
    })
    .select()
    .single()
  if (error || !data) return null
  return {
    id: data.id,
    username: data.username,
    role: data.role,
    displayName: data.display_name,
    isActive: data.is_active,
  }
}

export async function updateUser(id: string, updates: { displayName?: string; role?: "admin" | "user"; isActive?: boolean }): Promise<void> {
  const row: Record<string, unknown> = {}
  if (updates.displayName !== undefined) row.display_name = updates.displayName
  if (updates.role !== undefined) row.role = updates.role
  if (updates.isActive !== undefined) row.is_active = updates.isActive
  await supabase.from("app_users").update(row).eq("id", id)
}

export async function changeUserPassword(userId: string, newPassword: string): Promise<void> {
  const hash = await bcryptjs.hash(newPassword, 10)
  await supabase.from("app_users").update({ password_hash: hash }).eq("id", userId)
}

export async function deleteUser(id: string): Promise<void> {
  await supabase.from("app_users").delete().eq("id", id)
}

// ─── DEPARTMENTS (global — admin manages structure) ───────────────────────────

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

  return depts.map((d) => {
    const deptSubs = (subs || []).filter((s) => s.department_id === d.id)
    return {
      id: d.id,
      name: d.name,
      hasSubDepartments: d.has_sub_departments,
      patients: [],
      subDepartments: deptSubs.map((s) => ({
        id: s.id,
        name: s.name,
        patients: [],
      })),
    } as Department
  })
}

// Fetch departments WITH patient data for a specific user
export async function fetchDepartmentsForUser(userId: string): Promise<Department[]> {
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
    .eq("user_id", userId)
    .order("sort_order", { ascending: true })

  const { data: photos } = await supabase
    .from("patient_photos")
    .select("*")

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
    let pasienList: PatientEntry[] = []
    try {
      if (row.pasien_list) {
        pasienList = JSON.parse(row.pasien_list as string)
      }
    } catch { /* empty */ }
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
      userId: row.user_id as string,
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

export async function getNextSortOrder(departmentId: string, userId: string, subDepartmentId?: string): Promise<number> {
  let query = supabase
    .from("patients")
    .select("sort_order")
    .eq("department_id", departmentId)
    .eq("user_id", userId)
  if (subDepartmentId) {
    query = query.eq("sub_department_id", subDepartmentId)
  } else {
    query = query.is("sub_department_id", null)
  }
  const { data } = await query
  if (!data || data.length === 0) return 0
  return Math.max(...data.map((r) => (r.sort_order ?? 0) as number)) + 1
}

export async function upsertPatient(
  patient: Patient,
  departmentId: string,
  userId: string,
  subDepartmentId?: string,
  sortOrder?: number
) {
  const synced = syncLegacyFields(patient)
  const row: Record<string, unknown> = {
    id: synced.id,
    department_id: departmentId,
    sub_department_id: subDepartmentId || null,
    user_id: userId,
    requirement: synced.requirement,
    status: synced.status,
    has_pasien: synced.hasPasien,
    nama_pasien: synced.namaPasien,
    nomor_telp: synced.nomorTelp,
    pasien_list: JSON.stringify(synced.pasienList),
  }
  if (sortOrder !== undefined) {
    row.sort_order = sortOrder
  }
  await supabase.from("patients").upsert(row)
}

export async function upsertPatientSortOrder(patientId: string, sortOrder: number) {
  await supabase.from("patients").update({ sort_order: sortOrder }).eq("id", patientId)
}

export async function deletePatient(id: string) {
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

// ─── APPOINTMENTS (per user) ──────────────────────────────────────────────────

export async function fetchAppointments(userId: string): Promise<Appointment[]> {
  const { data, error } = await supabase
    .from("appointments")
    .select("*")
    .eq("user_id", userId)
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
    userId: row.user_id,
  }))
}

export async function upsertAppointment(appt: Appointment, userId: string) {
  await supabase.from("appointments").upsert({
    id: appt.id,
    user_id: userId,
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

// ─── WEEKLY SLOTS (per user) ──────────────────────────────────────────────────

export async function fetchWeeklySlots(userId: string, weekKey?: string): Promise<WeeklySlot[]> {
  let query = supabase
    .from("weekly_slots")
    .select("*")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true })

  if (weekKey) {
    query = query.eq("week_key", weekKey)
  }

  const { data, error } = await query
  if (error || !data) return []
  return data.map((row) => ({
    id: row.id,
    jam: row.jam,
    weekKey: row.week_key ?? weekKey ?? "",
    senin: row.senin || "",
    selasa: row.selasa || "",
    rabu: row.rabu || "",
    kamis: row.kamis || "",
    jumat: row.jumat || "",
    userId: row.user_id,
  }))
}

export async function upsertWeeklySlot(slot: WeeklySlot, weekKey: string, userId: string) {
  await supabase.from("weekly_slots").upsert({
    id: `${userId}-${weekKey}-${slot.id}`,
    user_id: userId,
    jam: slot.jam,
    week_key: weekKey,
    senin: slot.senin,
    selasa: slot.selasa,
    rabu: slot.rabu,
    kamis: slot.kamis,
    jumat: slot.jumat,
    sort_order: parseInt(slot.id.replace(/\D/g, "") || "0"),
  })
}

// ─── CHANGE OWN PASSWORD ──────────────────────────────────────────────────────

export async function changePassword(newPassword: string, userId?: string): Promise<void> {
  const hash = await bcryptjs.hash(newPassword, 10)
  if (userId) {
    await supabase.from("app_users").update({ password_hash: hash }).eq("id", userId)
  } else {
    // Legacy: update admin_auth table
    const { data } = await supabase.from("admin_auth").select("id").limit(1).single()
    if (data) {
      await supabase.from("admin_auth").update({ password_hash: hash }).eq("id", data.id)
    } else {
      await supabase.from("admin_auth").insert({ password_hash: hash })
    }
  }
}

// ─── APP SETTINGS ─────────────────────────────────────────────────────────────

export async function loadAppSetting(key: string): Promise<string | null> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .single()
  return data?.value ?? null
}

export async function saveAppSetting(key: string, value: string): Promise<void> {
  await supabase.from("app_settings").upsert({ key, value })
}