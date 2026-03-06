"use client"

import { useState, useMemo, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Plus, LogOut, Search, LayoutDashboard, CalendarDays,
  CalendarRange, Bell, Clock, AlertTriangle, Download,
  Settings, Upload, Eye, EyeOff, LockKeyhole, Users,
} from "lucide-react"
import { UserApprovalPanel } from "./user-approval-panel"
import { ImageCropModal } from "./image-crop-modal"
import type { Department, Appointment, WeeklySlot } from "@/lib/types"
import { downloadXlsx, type XlsxSheet } from "@/lib/xlsx-writer"
import {
  WEEK_TEMPLATE,
  parseSlotValue,
} from "@/lib/types"
import {
  fetchDepartments, fetchAppointments,
  upsertDepartment, deleteDepartment,
} from "@/lib/supabase-queries"
import { supabase } from "@/lib/supabase"
import { DepartmentCard } from "./department-card"
import { AddDepartmentModal } from "./add-department-modal"
import { AppointmentsTable } from "./appointments-table"
import { WeeklyPlanning } from "./weekly-planning"
import { toast } from "sonner"

type TabKey = "dashboard" | "appointments" | "weekly"

interface DashboardProps {
  onLogout: () => void
  currentUser: { email: string; role: "admin" | "user"; canUploadPhoto: boolean }
}

// ─── Brand Settings ────────────────────────────────────────────────────────────
type BrandSettings = {
  title: string
  subtitle: string
  logoUrl: string | null   // public URL from Supabase Storage (or null)
}

const DEFAULT_BRAND: BrandSettings = {
  title: "Klinik Gigi",
  subtitle: "Manajemen Pasien",
  logoUrl: null,
}

async function loadBrand(email: string): Promise<BrandSettings> {
  // Try user-specific brand first, then fall back to global "brand" key
  const userKey = `brand:${email}`
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", userKey)
    .maybeSingle()
  if (data?.value) {
    try {
      const parsed = JSON.parse(data.value)
      return { ...DEFAULT_BRAND, ...parsed }
    } catch { /* fall through */ }
  }
  // Fallback: global brand
  const { data: global } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "brand")
    .maybeSingle()
  if (!global?.value) return DEFAULT_BRAND
  try {
    const parsed = JSON.parse(global.value)
    return { ...DEFAULT_BRAND, ...parsed }
  } catch { return DEFAULT_BRAND }
}

async function saveBrandSettings(email: string, b: BrandSettings): Promise<void> {
  const userKey = `brand:${email}`
  await supabase
    .from("app_settings")
    .upsert({ key: userKey, value: JSON.stringify(b) })
}

async function uploadLogoToStorage(file: File, email: string): Promise<string | null> {
  const ext = file.name.split(".").pop() || "png"
  // Sanitize email to be safe as a path segment
  const emailSlug = email.replace(/[^a-zA-Z0-9._-]/g, "_")
  const path = `logo/${emailSlug}/profile.${ext}`

  const { error } = await supabase.storage
    .from("patient-photos")
    .upload(path, file, { contentType: file.type, upsert: true })

  if (error) return null

  const { data: { publicUrl } } = supabase.storage
    .from("patient-photos")
    .getPublicUrl(path)

  return publicUrl
}

async function deleteLogoFromStorage(email: string): Promise<void> {
  const emailSlug = email.replace(/[^a-zA-Z0-9._-]/g, "_")
  // Try all common extensions for this user
  await supabase.storage.from("patient-photos").remove([
    `logo/${emailSlug}/profile.png`,
    `logo/${emailSlug}/profile.jpg`,
    `logo/${emailSlug}/profile.jpeg`,
    `logo/${emailSlug}/profile.webp`,
  ])
}

// ─── Excel export: departments ────────────────────────────────────────────────
async function exportDepartmentsExcel(departments: Department[]) {
  const d = new Date()
  const dateStr = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`

  const sheets: XlsxSheet[] = departments.map((dept) => {
    const rows: Record<string, string | number>[] = []

    const addPatients = (patients: Department["patients"], subName = "") => {
      for (const p of patients) {
        if (p.pasienList && p.pasienList.length > 0) {
          p.pasienList.forEach((pe) => {
            rows.push({ sub: subName, req: p.requirement, status: p.status, nama: pe.namaPasien, telp: pe.nomorTelp, jml: p.pasienList.length })
          })
        } else {
          rows.push({ sub: subName, req: p.requirement, status: p.status, nama: "-", telp: "-", jml: 0 })
        }
      }
    }

    if (dept.hasSubDepartments && dept.subDepartments) {
      dept.subDepartments.forEach((sub) => addPatients(sub.patients, sub.name))
    } else {
      addPatients(dept.patients)
    }

    return {
      name: dept.name.slice(0, 31),
      columns: [
        { header: "Sub-Departemen", key: "sub",    width: 28 },
        { header: "Requirement",    key: "req",    width: 32 },
        { header: "Status",         key: "status", width: 26 },
        { header: "Nama Pasien",    key: "nama",   width: 26 },
        { header: "No. Telp",       key: "telp",   width: 20 },
        { header: "Jml Pasien",     key: "jml",    width: 12 },
      ],
      rows,
    }
  })

  await downloadXlsx(sheets, `departemen_${dateStr}.xlsx`)
  toast.success("Export departemen berhasil diunduh")
}

// ─── Dashboard Reminder ────────────────────────────────────────────────────────
function DashboardReminder({ weeklySlots }: { weeklySlots: WeeklySlot[] }) {
  const now = new Date()
  const currentMinTotal = now.getHours() * 60 + now.getMinutes()
  const dayNames = ["minggu", "senin", "selasa", "rabu", "kamis", "jumat", "sabtu"] as const
  const todayKey = dayNames[now.getDay()]
  const todayDate = now.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })

  const todayPatients: { jam: string; name: string; telp: string; minTotal: number }[] = []
  for (const slot of weeklySlots) {
    const rawVal = slot[todayKey as keyof WeeklySlot] as string
    const parsed = parseSlotValue(rawVal)
    if (parsed && parsed !== "ISTIRAHAT") {
      const [h, m] = slot.jam.split(":").map(Number)
      todayPatients.push({
        jam: slot.jam,
        name: typeof parsed === "object" ? parsed.n : parsed,
        telp: typeof parsed === "object" ? parsed.t : "",
        minTotal: h * 60 + m,
      })
    }
  }

  const upcoming = todayPatients.filter((p) => p.minTotal >= currentMinTotal)
  const nearest = upcoming[0] ?? null

  function getTimeLabel(p: { jam: string; minTotal: number }): string {
    const diff = p.minTotal - currentMinTotal
    if (diff === 0) return "Sekarang"
    if (diff < 60) return `${diff} menit lagi`
    const hrs = Math.floor(diff / 60), mins = diff % 60
    return mins > 0 ? `${hrs} jam ${mins} menit lagi` : `${hrs} jam lagi`
  }

  if (todayPatients.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card px-5 py-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#eae5dd]">
          <Bell className="h-5 w-5 text-[#6b5d4f]" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Tidak ada pasien hari ini</p>
          <p className="text-xs text-muted-foreground">{todayDate}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-[#c8ecc0] bg-[#f0faea] px-5 py-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#c8ecc0]">
          <Bell className="h-5 w-5 text-[#1a6010]" />
        </div>
        <div>
          <p className="text-sm font-bold text-foreground">
            Terdapat <span className="text-[#1a6010]">{todayPatients.length} pasien</span> hari ini
          </p>
          <p className="text-xs text-muted-foreground">{todayDate}</p>
        </div>
      </div>
      {nearest ? (
        <div className="flex items-center gap-2 rounded-lg bg-card border border-border/60 px-4 py-2.5">
          <Clock className="h-4 w-4 text-[#8a5d10] shrink-0" />
          <div className="text-xs">
            <span className="font-extrabold text-[#8a5d10]">{getTimeLabel(nearest)}</span>
            <span className="text-muted-foreground mx-1">·</span>
            <span className="font-bold text-foreground">{nearest.jam}</span>
            <span className="text-muted-foreground mx-1">—</span>
            <span className="font-semibold text-foreground">{nearest.name}</span>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg bg-card border border-border/60 px-4 py-2.5">
          <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
          <p className="text-xs text-muted-foreground font-medium">Semua pasien hari ini telah selesai</p>
        </div>
      )}
    </div>
  )
}

// ─── WhatsApp Modal (exported for use by other components) ────────────────────
export function WhatsAppModal({ open, onClose, phone, name }: {
  open: boolean; onClose: () => void; phone: string; name: string
}) {
  const clean = (() => {
    let c = phone.replace(/[^\d+]/g, "")
    if (c.startsWith("0")) c = "62" + c.slice(1)
    else if (c.startsWith("+62")) c = c.slice(1)
    else if (!c.startsWith("62")) c = "62" + c
    return c
  })()

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-sm bg-card">
        <DialogHeader>
          <DialogTitle className="text-foreground font-bold text-lg">Hubungi via WhatsApp</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Buka WhatsApp untuk menghubungi <span className="font-bold text-foreground">{name || "Pasien"}</span> di nomor{" "}
          <span className="font-bold text-foreground">{phone}</span>
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-border text-foreground font-semibold">Batal</Button>
          <a href={`https://wa.me/${clean}`} target="_blank" rel="noopener noreferrer" onClick={onClose}>
            <Button className="bg-[#25D366] text-white hover:bg-[#1ebe5d] font-semibold w-full">
              Buka WhatsApp
            </Button>
          </a>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Logout Confirm Modal ──────────────────────────────────────────────────────
function LogoutConfirmModal({ open, onClose, onConfirm }: { open: boolean; onClose: () => void; onConfirm: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-sm bg-card">
        <DialogHeader>
          <DialogTitle className="text-foreground text-lg font-bold flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-[#8a5d10]" />
            Keluar dari Sistem
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground py-2">
          Apakah Anda yakin ingin keluar? Sesi Anda akan berakhir dan Anda perlu login kembali.
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} className="border-border text-foreground font-semibold">Batal</Button>
          <Button onClick={onConfirm} className="bg-destructive text-white hover:bg-destructive/90 font-semibold">Keluar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Settings Modal ────────────────────────────────────────────────────────────
function SettingsModal({ open, onClose, brand, onSaveBrand, currentUserEmail }: {
  open: boolean
  onClose: () => void
  brand: BrandSettings
  onSaveBrand: (b: BrandSettings) => Promise<void>
  currentUserEmail: string
}) {
  const [activeSection, setActiveSection] = useState<"brand" | "password">("brand")
  const [title, setTitle] = useState(brand.title)
  const [subtitle, setSubtitle] = useState(brand.subtitle)
  const [logoUrl, setLogoUrl] = useState<string | null>(brand.logoUrl)
  const [logoPreview, setLogoPreview] = useState<string | null>(brand.logoUrl)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoSaving, setLogoSaving] = useState(false)
  const logoInputRef = useRef<HTMLInputElement>(null)

  // Crop modal state
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [cropOpen, setCropOpen] = useState(false)

  // Password change
  const [currentPw, setCurrentPw] = useState("")
  const [newPw, setNewPw] = useState("")
  const [confirmPw, setConfirmPw] = useState("")
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [pwLoading, setPwLoading] = useState(false)

  useEffect(() => {
    if (open) {
      setTitle(brand.title)
      setSubtitle(brand.subtitle)
      setLogoUrl(brand.logoUrl)
      setLogoPreview(brand.logoUrl)
      setLogoFile(null)
      setActiveSection("brand")
      setCurrentPw(""); setNewPw(""); setConfirmPw("")
    }
  }, [open, brand])

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { toast.error("Ukuran foto maks 5 MB"); return }
    // Read as base64 dan buka crop modal
    const reader = new FileReader()
    reader.onloadend = () => {
      setCropSrc(reader.result as string)
      setCropOpen(true)
    }
    reader.readAsDataURL(file)
    e.target.value = ""
  }

  const handleCropDone = (blob: Blob) => {
    setCropOpen(false)
    setCropSrc(null)
    // Convert blob ke File dan preview URL
    const croppedFile = new File([blob], "profile.png", { type: "image/png" })
    setLogoFile(croppedFile)
    setLogoPreview(URL.createObjectURL(blob))
  }

  const handleSaveBrand = async () => {
    if (!title.trim()) { toast.error("Nama tampilan tidak boleh kosong"); return }
    setLogoSaving(true)
    try {
      let finalLogoUrl = logoUrl

      // Upload new logo to storage if a new file was selected
      if (logoFile) {
        const uploaded = await uploadLogoToStorage(logoFile, currentUserEmail)
        if (!uploaded) { toast.error("Gagal mengunggah foto"); setLogoSaving(false); return }
        finalLogoUrl = uploaded
      }

      // If logo was cleared (preview null, no new file)
      if (!logoPreview && !logoFile) {
        await deleteLogoFromStorage(currentUserEmail)
        finalLogoUrl = null
      }

      await onSaveBrand({ title: title.trim(), subtitle: subtitle.trim(), logoUrl: finalLogoUrl })
      toast.success("Pengaturan tampilan berhasil disimpan")
      onClose()
    } catch {
      toast.error("Gagal menyimpan pengaturan")
    } finally {
      setLogoSaving(false)
    }
  }

  const handleChangePassword = async () => {
    if (!currentPw) { toast.error("Masukkan password saat ini"); return }
    if (newPw.length < 6) { toast.error("Password baru minimal 6 karakter"); return }
    if (newPw !== confirmPw) { toast.error("Konfirmasi password tidak cocok"); return }
    setPwLoading(true)
    try {
      const { verifyPassword, changePassword } = await import("@/lib/supabase-queries")
      const ok = await verifyPassword(currentPw)
      if (!ok) { toast.error("Password saat ini salah"); return }
      await changePassword(newPw)
      toast.success("Password berhasil diubah")
      setCurrentPw(""); setNewPw(""); setConfirmPw("")
      onClose()
    } catch {
      toast.error("Gagal mengubah password")
    } finally {
      setPwLoading(false)
    }
  }

  return (
  <>
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg bg-card max-h-[90vh] overflow-y-auto p-0">
        <DialogTitle className="sr-only">Pengaturan</DialogTitle>
        {/* Header */}
        <div className="flex items-center gap-3 px-6 pt-6 pb-4 border-b border-border/40">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Settings className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-foreground">Pengaturan</h2>
            <p className="text-xs text-muted-foreground font-medium">Tampilan personal & keamanan akun</p>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 px-6 pt-4">
          {(["brand", "password"] as const).map((section) => (
            <button
              key={section}
              onClick={() => setActiveSection(section)}
              className={`rounded-lg px-4 py-2 text-sm font-bold transition-all ${
                activeSection === section
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
              }`}
            >
              {section === "brand" ? "Tampilan" : "Ganti Password"}
            </button>
          ))}
        </div>

        <div className="px-6 pb-6 pt-4">
          {activeSection === "brand" && (
            <div className="flex flex-col gap-5">
              {/* Info banner */}
              <div className="rounded-xl bg-primary/5 border border-primary/20 px-4 py-3">
                <p className="text-xs font-bold text-primary">Tampilan Personal</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Pengaturan ini hanya berlaku untuk akun Anda. Setiap pengguna memiliki tampilan masing-masing.
                </p>
              </div>

              {/* Foto profil */}
              <div className="flex flex-col gap-2">
                <Label className="text-sm font-bold text-foreground">Foto Profil / Logo</Label>
                <div className="flex items-center gap-4">
                  {/* Preview */}
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary shadow-sm overflow-hidden border-2 border-border/40">
                    {logoPreview ? (
                      <img src={logoPreview} alt="Foto profil" className="h-full w-full object-cover" />
                    ) : (
                      <svg viewBox="0 0 32 32" fill="none" className="h-9 w-9" aria-hidden="true">
                        <path d="M16 3C11 3 7 7 7 11c0 2 .5 3.5 1.2 5l2.8 8c.5 1.5 1.5 2 2.5 2s2-.8 2.5-2l.5-1.5.5 1.5c.5 1.2 1.5 2 2.5 2s2-.5 2.5-2l2.8-8C24.5 14.5 25 13 25 11c0-4-4-8-9-8z" fill="currentColor" className="text-primary-foreground" />
                      </svg>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => logoInputRef.current?.click()}
                      className="h-9 gap-2 border-border font-bold"
                      disabled={logoSaving}
                    >
                      <Upload className="h-3.5 w-3.5" />
                      {logoFile ? "Ganti File" : "Upload Foto"}
                    </Button>
                    {logoPreview && (
                      <button
                        onClick={() => { setLogoPreview(null); setLogoUrl(null); setLogoFile(null) }}
                        className="text-xs text-destructive font-bold hover:underline text-left"
                        disabled={logoSaving}
                      >
                        Hapus foto
                      </button>
                    )}
                    {logoFile && (
                      <p className="text-xs text-[#1a6010] font-medium">
                        ✓ {logoFile.name} — akan diupload saat simpan
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">PNG, JPG — maks 5 MB</p>
                  </div>
                </div>
                <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleLogoSelect} className="hidden" />
              </div>

              {/* Nama tampilan */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="clinic-title" className="text-sm font-bold text-foreground">Nama Tampilan</Label>
                <Input
                  id="clinic-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Nama Anda / Nama Klinik"
                  className="bg-background h-10 font-medium"
                  maxLength={40}
                />
              </div>

              {/* Sub-judul */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="clinic-subtitle" className="text-sm font-bold text-foreground">Sub-judul</Label>
                <Input
                  id="clinic-subtitle"
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  placeholder="Jabatan / Spesialisasi"
                  className="bg-background h-10 font-medium"
                  maxLength={50}
                />
              </div>

              {/* Preview */}
              <div className="rounded-xl border border-border/40 bg-muted/20 p-4">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3">Preview Navbar</p>
                <div className="flex items-center gap-2.5 bg-card rounded-xl px-4 py-2.5 border border-border/40 shadow-sm w-fit">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary shadow-sm overflow-hidden">
                    {logoPreview ? (
                      <img src={logoPreview} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <svg viewBox="0 0 32 32" fill="none" className="h-5 w-5" aria-hidden="true">
                        <path d="M16 3C11 3 7 7 7 11c0 2 .5 3.5 1.2 5l2.8 8c.5 1.5 1.5 2 2.5 2s2-.8 2.5-2l.5-1.5.5 1.5c.5 1.2 1.5 2 2.5 2s2-.5 2.5-2l2.8-8C24.5 14.5 25 13 25 11c0-4-4-8-9-8z" fill="currentColor" className="text-primary-foreground" />
                      </svg>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-extrabold text-foreground leading-tight">{title || "Nama Anda"}</p>
                    <p className="text-[10px] font-medium text-muted-foreground leading-tight">{subtitle || "Jabatan / Spesialisasi"}</p>
                  </div>
                </div>
              </div>

              <Button
                onClick={handleSaveBrand}
                disabled={logoSaving}
                className="bg-primary text-primary-foreground hover:bg-primary/90 font-bold h-10"
              >
                {logoSaving ? "Menyimpan..." : "Simpan Pengaturan"}
              </Button>
            </div>
          )}

          {activeSection === "password" && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm font-bold text-foreground">Password Saat Ini</Label>
                <div className="relative">
                  <LockKeyhole className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    type={showCurrent ? "text" : "password"}
                    value={currentPw}
                    onChange={(e) => setCurrentPw(e.target.value)}
                    placeholder="Masukkan password saat ini"
                    className="bg-background pl-9 pr-10 h-10 font-medium"
                  />
                  <button type="button" onClick={() => setShowCurrent(!showCurrent)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" tabIndex={-1}>
                    {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label className="text-sm font-bold text-foreground">Password Baru</Label>
                <div className="relative">
                  <LockKeyhole className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    type={showNew ? "text" : "password"}
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    placeholder="Minimal 6 karakter"
                    className="bg-background pl-9 pr-10 h-10 font-medium"
                  />
                  <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" tabIndex={-1}>
                    {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label className="text-sm font-bold text-foreground">Konfirmasi Password Baru</Label>
                <div className="relative">
                  <LockKeyhole className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    type={showConfirm ? "text" : "password"}
                    value={confirmPw}
                    onChange={(e) => setConfirmPw(e.target.value)}
                    placeholder="Ulangi password baru"
                    className="bg-background pl-9 pr-10 h-10 font-medium"
                    onKeyDown={(e) => { if (e.key === "Enter") handleChangePassword() }}
                  />
                  <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" tabIndex={-1}>
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {newPw && confirmPw && newPw !== confirmPw && (
                <p className="text-xs font-bold text-destructive bg-destructive/10 px-3 py-2 rounded-lg">
                  Password baru dan konfirmasi tidak cocok
                </p>
              )}

              <Button
                onClick={handleChangePassword}
                disabled={pwLoading || !currentPw || !newPw || !confirmPw}
                className="bg-primary text-primary-foreground hover:bg-primary/90 font-bold h-10 mt-1"
              >
                {pwLoading ? "Memproses..." : "Ubah Password"}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>

    {cropSrc && (
      <ImageCropModal
        open={cropOpen}
        onClose={() => { setCropOpen(false); setCropSrc(null) }}
        imageSrc={cropSrc}
        onCropDone={handleCropDone}
      />
    )}
  </>
  )
}

// ─── Logo SVG (default) ────────────────────────────────────────────────────────
function ToothLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <path d="M16 3C11 3 7 7 7 11c0 2 .5 3.5 1.2 5l2.8 8c.5 1.5 1.5 2 2.5 2s2-.8 2.5-2l.5-1.5.5 1.5c.5 1.2 1.5 2 2.5 2s2-.5 2.5-2l2.8-8C24.5 14.5 25 13 25 11c0-4-4-8-9-8z" fill="currentColor" className="text-primary-foreground" />
    </svg>
  )
}

// ─── Main Dashboard ────────────────────────────────────────────────────────────
export function Dashboard({ onLogout, currentUser }: DashboardProps) {
  const isAdmin = currentUser.role === "admin"
  const [departments, setDepartments] = useState<Department[]>([])
  const [appointments, setAppointments] = useState<Appointment[]>([])
  // Weekly slots: template hardcoded, DB hanya simpan sel terisi (sparse)
  // Untuk minggu ini, dikelola langsung oleh WeeklyPlanning component
  const [weeklySlots, setWeeklySlots] = useState<WeeklySlot[]>(WEEK_TEMPLATE)
  const [loading, setLoading] = useState(true)
  const [addDeptOpen, setAddDeptOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<TabKey>("dashboard")
  const [searchDept, setSearchDept] = useState("")
  const [logoutOpen, setLogoutOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [userApprovalOpen, setUserApprovalOpen] = useState(false)
  const [brand, setBrand] = useState<BrandSettings>(DEFAULT_BRAND)
  const [exportDeptConfirmOpen, setExportDeptConfirmOpen] = useState(false)

  // Load all data from Supabase on mount
  useEffect(() => {
    async function loadAll() {
      setLoading(true)
      try {
        const [depts, appts, brandData] = await Promise.all([
          fetchDepartments(currentUser.email),
          fetchAppointments(currentUser.email),
          loadBrand(currentUser.email),
        ])
        if (depts.length > 0) setDepartments(depts)
        if (appts.length > 0) setAppointments(appts)
        setBrand(brandData)
        // Weekly slots untuk minggu ini di-load oleh WeeklyPlanning component
      } catch { /* stay on defaults */ } finally { setLoading(false) }
    }
    loadAll()
  }, [])

  const filteredDepartments = useMemo(() => {
    const q = searchDept.trim().toLowerCase()
    if (!q) return departments
    return departments.filter((d) => {
      // Match department name
      if (d.name.toLowerCase().includes(q)) return true
      // Match any requirement in direct patients
      if (d.patients.some((p) => p.requirement.toLowerCase().includes(q))) return true
      // Match any requirement in sub-department patients
      if (d.subDepartments?.some((s) => s.patients.some((p) => p.requirement.toLowerCase().includes(q)))) return true
      return false
    })
  }, [departments, searchDept])

  const handleUpdateDepartment = async (updated: Department) => {
    setDepartments((prev) => {
      const snapshot = prev
      const next = prev.map((d) => d.id === updated.id ? updated : d)
      upsertDepartment(updated).catch(() => {
        setDepartments(snapshot)
        toast.error("Gagal menyimpan departemen. Perubahan dibatalkan.")
      })
      return next
    })
  }

  const handleDeleteDepartment = async (id: string) => {
    setDepartments((prev) => {
      const snapshot = prev
      const next = prev.filter((d) => d.id !== id)
      deleteDepartment(id)
        .then(() => toast.success("Departemen berhasil dihapus"))
        .catch(() => {
          setDepartments(snapshot)
          toast.error("Gagal menghapus departemen. Perubahan dibatalkan.")
        })
      return next
    })
  }

  const handleAddDepartment = async (name: string, hasSub: boolean) => {
    const newDept: Department = {
      id: `dept-${Date.now()}`,
      name,
      patients: [],
      hasSubDepartments: hasSub,
      subDepartments: hasSub ? [] : undefined,
    }
    setDepartments((prev) => {
      const snapshot = prev
      const next = [...prev, newDept]
      upsertDepartment(newDept)
        .then(() => toast.success(`Departemen "${name}" berhasil ditambahkan`))
        .catch(() => {
          setDepartments(snapshot)
          toast.error("Gagal menambah departemen. Perubahan dibatalkan.")
        })
      return next
    })
  }

  const handleSaveBrand = async (b: BrandSettings) => {
    await saveBrandSettings(currentUser.email, b)
    setBrand(b)
  }

  const tabs: { key: TabKey; label: string; icon: React.ElementType }[] = [
    { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { key: "appointments", label: "Appointments", icon: CalendarDays },
    { key: "weekly", label: "Weekly Planning", icon: CalendarRange },
  ]

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-card/95 backdrop-blur-lg">
        <div className="mx-auto flex h-15 max-w-400 items-center justify-between px-4 lg:px-8 py-3">
          {/* Brand */}
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary shadow-sm overflow-hidden">
              {brand.logoUrl ? (
                <img src={brand.logoUrl} alt="logo" className="h-full w-full object-cover" />
              ) : (
                <ToothLogo className="h-5 w-5" />
              )}
            </div>
            <div>
              <h1 className="text-sm font-extrabold text-foreground leading-tight">{brand.title}</h1>
              <p className="text-[10px] font-medium text-muted-foreground leading-tight">{brand.subtitle}</p>
            </div>
          </div>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1 bg-muted/60 rounded-xl p-1" aria-label="Navigasi">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-bold transition-all ${
                  activeTab === tab.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <tab.icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            ))}
          </nav>

          {/* Right actions */}
          <div className="flex items-center gap-1.5">
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setUserApprovalOpen(true)}
                className="h-8 w-8 p-0 border-border text-foreground"
                title="Kelola Pengguna"
              >
                <Users className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSettingsOpen(true)}
              className="h-8 w-8 p-0 border-border text-foreground"
              title="Pengaturan"
            >
              <Settings className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLogoutOpen(true)}
              className="h-8 gap-1.5 border-border text-foreground text-sm font-bold"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Keluar</span>
            </Button>
          </div>
        </div>

        {/* Mobile nav */}
        <div className="md:hidden border-t border-border/30 px-4">
          <nav className="flex gap-1 py-1.5 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold whitespace-nowrap transition-all ${
                  activeTab === tab.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <tab.icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto max-w-400 px-4 py-5 lg:px-8">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <svg className="h-8 w-8 animate-spin text-primary" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {activeTab === "dashboard" && (
              <>
                <DashboardReminder weeklySlots={weeklySlots} />

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h2 className="text-xl font-extrabold text-foreground tracking-tight">Departemen</h2>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Cari departemen / requirement..."
                        value={searchDept}
                        onChange={(e) => setSearchDept(e.target.value)}
                        className="pl-8 h-9 w-80 text-sm bg-card border-border/60 font-medium"
                      />
                    </div>
                    {isAdmin && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setExportDeptConfirmOpen(true)}
                        className="h-9 gap-1.5 border-border text-foreground text-sm font-bold"
                      >
                        <Download className="h-4 w-4" />Export Excel
                      </Button>
                    )}
                    {isAdmin && (
                      <Button
                        onClick={() => setAddDeptOpen(true)}
                        className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 h-9 font-bold"
                        size="sm"
                      >
                        <Plus className="h-4 w-4" />Departemen
                      </Button>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-4">
                  {filteredDepartments.map((dept) => (
                    <DepartmentCard
                      key={dept.id}
                      department={dept}
                      onUpdate={handleUpdateDepartment}
                      onDeleteDepartment={() => handleDeleteDepartment(dept.id)}
                      searchQuery={searchDept.trim()}
                      isAdmin={isAdmin}
                      userId={currentUser.email}
                      canUploadPhoto={currentUser.canUploadPhoto}
                    />
                  ))}
                  {filteredDepartments.length === 0 && searchDept && (
                    <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border/60 bg-card py-16">
                      <Search className="mb-3 h-10 w-10 text-muted-foreground/30" />
                      <p className="text-muted-foreground font-bold">{`Tidak ditemukan departemen atau requirement "${searchDept}"`}</p>
                    </div>
                  )}
                  {departments.length === 0 && (
                    <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border/60 bg-card py-16">
                      <LayoutDashboard className="mb-3 h-10 w-10 text-muted-foreground/30" />
                      <p className="text-muted-foreground font-bold mb-4">Belum ada departemen</p>
                      {isAdmin && (
                        <Button onClick={() => setAddDeptOpen(true)} className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 font-bold">
                          <Plus className="h-4 w-4" />Tambah Departemen
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}

            {activeTab === "appointments" && (
              <AppointmentsTable appointments={appointments} onUpdate={setAppointments} departments={departments} userId={currentUser.email} />
            )}

            {activeTab === "weekly" && (
              <WeeklyPlanning slots={weeklySlots} onUpdate={setWeeklySlots} departments={departments} userId={currentUser.email} />
            )}
          </div>
        )}
      </main>

      <AddDepartmentModal open={addDeptOpen} onClose={() => setAddDeptOpen(false)} onAdd={handleAddDepartment} />
      <LogoutConfirmModal open={logoutOpen} onClose={() => setLogoutOpen(false)} onConfirm={onLogout} />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} brand={brand} onSaveBrand={handleSaveBrand} currentUserEmail={currentUser.email} />
      <UserApprovalPanel open={userApprovalOpen} onClose={() => setUserApprovalOpen(false)} />

      <AlertDialog open={exportDeptConfirmOpen} onOpenChange={setExportDeptConfirmOpen}>
        <AlertDialogContent className="bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground font-bold flex items-center gap-2">
              <Download className="h-5 w-5 text-primary" />
              Export Departemen ke Excel
            </AlertDialogTitle>
            <AlertDialogDescription>
              Mengekspor <span className="font-bold text-foreground">{departments.length} departemen</span> ke file Excel.
              Setiap departemen akan menjadi sheet terpisah berisi seluruh requirement dan data pasien.
              File akan diunduh ke perangkat Anda.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border text-foreground font-bold">Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => exportDepartmentsExcel(departments).catch(() => toast.error("Gagal export"))}
              className="bg-primary text-primary-foreground hover:bg-primary/90 font-bold"
            >
              <Download className="h-4 w-4 mr-1.5" />Ya, Export
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}