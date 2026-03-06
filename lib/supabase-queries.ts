import { supabase } from "./supabase"
import type {
  Department, Patient, PatientEntry, SubDepartment,
  Appointment, Photo, AppUser,
} from "./types"
import bcryptjs from "bcryptjs"

// ─── ADMIN AUTH (password tunggal lama — tetap dipertahankan untuk backward compat) ──

export async function verifyPassword(password: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("admin_auth")
    .select("password_hash")
    .limit(1)
    .single()
  if (error || !data) return false
  return bcryptjs.compare(password, data.password_hash)
}

export async function changePassword(newPassword: string): Promise<void> {
  const hash = await bcryptjs.hash(newPassword, 10)
  const { data } = await supabase.from("admin_auth").select("id").limit(1).single()
  if (data) {
    await supabase.from("admin_auth").update({ password_hash: hash }).eq("id", data.id)
  } else {
    await supabase.from("admin_auth").insert({ password_hash: hash })
  }
}

// ─── USER REGISTRATION ────────────────────────────────────────────────────────

export async function registerUser({
  nama,
  email,
  password,
}: {
  nama: string
  email: string
  password: string
}): Promise<boolean> {
  // Cek apakah email sudah terdaftar
  const { data: existing } = await supabase
    .from("app_users")
    .select("id")
    .eq("email", email)
    .maybeSingle()

  if (existing) return false

  const password_hash = await bcryptjs.hash(password, 10)

  const { error } = await supabase.from("app_users").insert({
    nama,
    email,
    password_hash,
    status: "pending",
  })

  return !error
}

// ─── USER LOGIN (email + password, status harus 'approved') ──────────────────

export type LoginResult =
  | { status: "ok"; role: "admin" | "user"; canUploadPhoto: boolean }
  | { status: "pending" }
  | { status: "rejected" }
  | { status: "invalid" }

export async function verifyUserLogin(
  email: string,
  password: string
): Promise<LoginResult> {
  const { data, error } = await supabase
    .from("app_users")
    .select("password_hash, status, role, can_upload_photo, is_active")
    .eq("email", email)
    .maybeSingle()

  if (error || !data) return { status: "invalid" }

  // Tolak jika akun dinonaktifkan
  if (data.is_active === false) return { status: "rejected" }

  const hash: string = (data.password_hash as string) ?? ""
  if (!hash) return { status: "invalid" }

  const match = await bcryptjs.compare(password, hash)
  if (!match) return { status: "invalid" }

  if (data.status === "approved") return {
    status: "ok",
    role: (data.role as "admin" | "user") ?? "user",
    canUploadPhoto: data.can_upload_photo !== false,
  }
  if (data.status === "pending") return { status: "pending" }
  if (data.status === "rejected") return { status: "rejected" }
  return { status: "invalid" }
}

// ─── ADMIN: KELOLA PENGGUNA ───────────────────────────────────────────────────

export async function fetchPendingUsers(): Promise<AppUser[]> {
  const { data, error } = await supabase
    .from("app_users")
    .select("id, nama, email, status, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true })

  if (error || !data) return []
  return data as AppUser[]
}

export async function fetchApprovedUsers(): Promise<AppUser[]> {
  const { data, error } = await supabase
    .from("app_users")
    .select("id, nama, email, status, created_at")
    .eq("status", "approved")
    .order("created_at", { ascending: true })

  if (error || !data) return []
  return data as AppUser[]
}

export async function approveUser(id: string): Promise<void> {
  const { error } = await supabase
    .from("app_users")
    .update({ status: "approved" })
    .eq("id", id)
  if (error) throw error
}

export async function rejectUser(id: string): Promise<void> {
  const { error } = await supabase
    .from("app_users")
    .delete()
    .eq("id", id)
  if (error) throw error
}

export async function deleteUser(id: string): Promise<void> {
  const { error } = await supabase
    .from("app_users")
    .delete()
    .eq("id", id)
  if (error) throw error
}

// Helper: map raw DB row → AppUser (dengan derived fields)
function rowToAppUser(row: Record<string, unknown>): AppUser {
  const email = (row.email as string) ?? ""
  return {
    id: row.id as string,
    nama: (row.nama as string) ?? "",
    email,
    status: (row.status as AppUser["status"]) ?? "pending",
    created_at: (row.created_at as string) ?? "",
    role: (row.role as "admin" | "user") ?? "user",
    isActive: row.is_active !== undefined ? Boolean(row.is_active) : true,
    canUploadPhoto: row.can_upload_photo !== undefined ? Boolean(row.can_upload_photo) : true,
    displayName: (row.nama as string) ?? email,
    username: email.split("@")[0],
  }
}

// ─── ADMIN: Kelola semua user (fetch, create, update) ────────────────────────

export async function fetchUsers(): Promise<AppUser[]> {
  const { data, error } = await supabase
    .from("app_users")
    .select("id, nama, email, status, created_at, role, is_active, can_upload_photo")
    .order("created_at", { ascending: true })
  if (error || !data) return []
  return (data as Record<string, unknown>[]).map(rowToAppUser)
}

export async function createUser(
  username: string,
  password: string,
  role: "admin" | "user",
  displayName: string,
): Promise<AppUser | null> {
  // username dipakai sebagai prefix email; jika sudah berupa email, pakai apa adanya
  const email = username.includes("@") ? username : `${username}@internal.local`

  // Cek duplikat
  const { data: existing } = await supabase
    .from("app_users")
    .select("id")
    .eq("email", email)
    .maybeSingle()
  if (existing) return null

  const password_hash = await bcryptjs.hash(password, 10)

  const { data, error } = await supabase
    .from("app_users")
    .insert({
      nama: displayName,
      email,
      password_hash,
      status: "approved" as const,
      role,
      is_active: true,
    })
    .select("id, nama, email, status, created_at, role, is_active, can_upload_photo")
    .single()

  if (error || !data) return null
  return rowToAppUser(data as Record<string, unknown>)
}

export async function updateUser(
  id: string,
  patch: Partial<{ displayName: string; role: "admin" | "user"; isActive: boolean; canUploadPhoto: boolean }>,
): Promise<void> {
  const dbPatch: Record<string, unknown> = {}
  if (patch.displayName !== undefined) dbPatch.nama = patch.displayName
  if (patch.role !== undefined) dbPatch.role = patch.role
  if (patch.isActive !== undefined) dbPatch.is_active = patch.isActive
  if (patch.canUploadPhoto !== undefined) dbPatch.can_upload_photo = patch.canUploadPhoto

  const { error } = await supabase
    .from("app_users")
    .update(dbPatch)
    .eq("id", id)
  if (error) throw error
}

export async function changeUserPassword(id: string, newPassword: string): Promise<void> {
  const password_hash = await bcryptjs.hash(newPassword, 10)
  const { data, error } = await supabase
    .from("app_users")
    .update({ password_hash })
    .eq("id", id)
    .select("id")
  if (error) throw new Error(`Gagal update password: ${error.message}`)
  if (!data || data.length === 0) throw new Error("User tidak ditemukan atau tidak ada perubahan")
}

// ─── DEPARTMENTS ─────────────────────────────────────────────────────────────

export async function fetchDepartments(userId: string): Promise<Department[]> {
  // departments & sub_departments & patients = global (shared semua user)
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

  const { data: photos } = await supabase
    .from("patient_photos")
    .select("*")
    .eq("user_id", userId)

  // pasienList per-user: satu row per (patient_id, user_id)
  const { data: userPatientData } = await supabase
    .from("patient_user_data")
    .select("patient_id, pasien_list")
    .eq("user_id", userId)

  // Build lookup: patient_id → pasienList milik user ini
  const userPasienMap: Record<string, PatientEntry[]> = {}
  for (const row of userPatientData || []) {
    try {
      userPasienMap[row.patient_id] = JSON.parse(row.pasien_list)
    } catch { userPasienMap[row.patient_id] = [] }
  }

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
    // Pakai pasienList milik user ini (default kosong jika belum ada)
    const pasienList: PatientEntry[] = userPasienMap[row.id as string] ?? []
    const first = pasienList[0]
    return {
      id: row.id as string,
      requirement: row.requirement as string,
      status: row.status as Patient["status"],
      pasienList,
      hasPasien: pasienList.length > 0,
      namaPasien: first?.namaPasien ?? "",
      nomorTelp: first?.nomorTelp ?? "",
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

export async function getNextSortOrder(departmentId: string, subDepartmentId?: string): Promise<number> {
  let query = supabase.from("patients").select("sort_order").eq("department_id", departmentId)
  if (subDepartmentId) {
    query = query.eq("sub_department_id", subDepartmentId)
  } else {
    query = query.is("sub_department_id", null)
  }
  const { data } = await query
  if (!data || data.length === 0) return 0
  return Math.max(...data.map((r) => (r.sort_order ?? 0) as number)) + 1
}

// Upsert requirement/status ke tabel patients (global, shared semua user)
export async function upsertPatient(
  patient: Patient,
  departmentId: string,
  subDepartmentId?: string,
  sortOrder?: number
) {
  const row: Record<string, unknown> = {
    id: patient.id,
    department_id: departmentId,
    sub_department_id: subDepartmentId || null,
    requirement: patient.requirement,
    status: patient.status,
  }
  if (sortOrder !== undefined) row.sort_order = sortOrder
  await supabase.from("patients").upsert(row)
}

// Simpan pasienList per-user ke tabel patient_user_data
export async function upsertPatientUserData(
  patientId: string,
  userId: string,
  pasienList: PatientEntry[]
) {
  await supabase.from("patient_user_data").upsert(
    {
      patient_id: patientId,
      user_id: userId,
      pasien_list: JSON.stringify(pasienList),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "patient_id,user_id" }
  )
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

export async function uploadPhotoBase64(patientId: string, base64: string, userId: string): Promise<Photo | null> {
  const res = await fetch(base64)
  const blob = await res.blob()

  if (blob.size > 1 * 1024 * 1024) {
    throw new Error("Ukuran foto maksimum 1 MB")
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
    .insert({ patient_id: patientId, storage_path: path, photo_url: publicUrl, user_id: userId })
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

// ─── WEEKLY SLOTS ─────────────────────────────────────────────────────────────

// Fetch sel terisi untuk (userId, weekKey) → Record<jam, Record<hari, value>>
export async function fetchWeeklyCells(
  userId: string,
  weekKey: string
): Promise<Record<string, Record<string, string>>> {
  const { data, error } = await supabase
    .from("weekly_slots")
    .select("jam, hari, value")
    .eq("user_id", userId)
    .eq("week_key", weekKey)

  const result: Record<string, Record<string, string>> = {}
  if (error || !data) return result

  for (const row of data) {
    if (!result[row.jam]) result[row.jam] = {}
    result[row.jam][row.hari] = row.value
  }
  return result
}

// Upsert satu sel (jam + hari) untuk user & week tertentu
export async function upsertWeeklyCell(
  userId: string,
  weekKey: string,
  jam: string,
  hari: string,
  value: string
) {
  if (!value) {
    // Hapus jika kosong (sparse: sel kosong tidak disimpan)
    await supabase
      .from("weekly_slots")
      .delete()
      .eq("user_id", userId)
      .eq("week_key", weekKey)
      .eq("jam", jam)
      .eq("hari", hari)
    return
  }
  await supabase.from("weekly_slots").upsert(
    { user_id: userId, week_key: weekKey, jam, hari, value, updated_at: new Date().toISOString() },
    { onConflict: "user_id,week_key,jam,hari" }
  )
}