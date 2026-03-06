"use client"

import { useState, useEffect } from "react"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Users, Plus, Pencil, Trash2, Eye, EyeOff, LockKeyhole,
  ShieldCheck, User, ToggleLeft, ToggleRight, Camera,
  Clock, CheckCircle2, XCircle, RefreshCw,
} from "lucide-react"
import type { AppUser } from "@/lib/types"
import {
  fetchUsers, createUser, updateUser, deleteUser, changeUserPassword,
  fetchPendingUsers, approveUser, rejectUser,
} from "@/lib/supabase-queries"
import { toast } from "sonner"

interface UserManagementModalProps {
  open: boolean
  onClose: () => void
  currentUserId: string
}

type MainTab = "users" | "pending"
type ViewMode = "list" | "add" | "edit" | "password"

export function UserManagementModal({ open, onClose, currentUserId }: UserManagementModalProps) {
  const [mainTab, setMainTab] = useState<MainTab>("users")

  // ── Tab Users ────────────────────────────────────────────────────────────────
  const [users, setUsers] = useState<AppUser[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [view, setView] = useState<ViewMode>("list")
  const [editingUser, setEditingUser] = useState<AppUser | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AppUser | null>(null)

  const [formUsername, setFormUsername] = useState("")
  const [formDisplayName, setFormDisplayName] = useState("")
  const [formRole, setFormRole] = useState<"admin" | "user">("user")
  const [formCanUploadPhoto, setFormCanUploadPhoto] = useState(true)
  const [formPassword, setFormPassword] = useState("")
  const [formConfirmPw, setFormConfirmPw] = useState("")
  const [showPw, setShowPw] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [saving, setSaving] = useState(false)

  // ── Tab Pending ──────────────────────────────────────────────────────────────
  const [pendingUsers, setPendingUsers] = useState<AppUser[]>([])
  const [loadingPending, setLoadingPending] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [confirmReject, setConfirmReject] = useState<AppUser | null>(null)

  // ── Init ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      setMainTab("users")
      setView("list")
      loadUsers()
      loadPending()
    }
  }, [open])

  async function loadUsers() {
    setLoadingUsers(true)
    const data = await fetchUsers()
    setUsers(data)
    setLoadingUsers(false)
  }

  async function loadPending() {
    setLoadingPending(true)
    try {
      setPendingUsers(await fetchPendingUsers())
    } catch {
      toast.error("Gagal memuat pendaftar.")
    } finally {
      setLoadingPending(false)
    }
  }

  // ── Handlers: Users ──────────────────────────────────────────────────────────
  function openAdd() {
    setFormUsername(""); setFormDisplayName(""); setFormRole("user")
    setFormCanUploadPhoto(true); setFormPassword(""); setFormConfirmPw("")
    setShowPw(false); setShowConfirm(false); setEditingUser(null)
    setView("add")
  }

  function openEdit(user: AppUser) {
    setEditingUser(user)
    setFormDisplayName(user.displayName)
    setFormRole(user.role)
    setFormCanUploadPhoto(user.canUploadPhoto)
    setView("edit")
  }

  function openChangePassword(user: AppUser) {
    setEditingUser(user)
    setFormPassword(""); setFormConfirmPw("")
    setShowPw(false); setShowConfirm(false)
    setView("password")
  }

  async function handleAdd() {
    if (!formUsername.trim()) { toast.error("Username tidak boleh kosong"); return }
    if (formPassword.length < 6) { toast.error("Password minimal 6 karakter"); return }
    if (formPassword !== formConfirmPw) { toast.error("Password tidak cocok"); return }
    setSaving(true)
    try {
      const user = await createUser(formUsername, formPassword, formRole, formDisplayName || formUsername)
      if (!user) { toast.error("Gagal membuat user — username mungkin sudah ada"); return }
      toast.success(`User "${user.username}" berhasil dibuat`)
      await loadUsers()
      setView("list")
    } catch {
      toast.error("Gagal membuat user")
    } finally { setSaving(false) }
  }

  async function handleEdit() {
    if (!editingUser) return
    setSaving(true)
    try {
      await updateUser(editingUser.id, {
        displayName: formDisplayName,
        role: formRole,
        canUploadPhoto: formCanUploadPhoto,
      })
      toast.success("User berhasil diperbarui")
      await loadUsers()
      setView("list")
    } catch {
      toast.error("Gagal memperbarui user")
    } finally { setSaving(false) }
  }

  async function handleChangePassword() {
    if (!editingUser) return
    if (formPassword.length < 6) { toast.error("Password minimal 6 karakter"); return }
    if (formPassword !== formConfirmPw) { toast.error("Password tidak cocok"); return }
    setSaving(true)
    try {
      await changeUserPassword(editingUser.id, formPassword)
      toast.success(`Password "${editingUser.username}" berhasil diubah`)
      setView("list")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengubah password")
    } finally { setSaving(false) }
  }

  async function handleToggleActive(user: AppUser) {
    if (user.id === currentUserId) { toast.error("Tidak bisa menonaktifkan akun sendiri"); return }
    try {
      await updateUser(user.id, { isActive: !user.isActive })
      toast.success(`User "${user.username}" ${!user.isActive ? "diaktifkan" : "dinonaktifkan"}`)
      await loadUsers()
    } catch { toast.error("Gagal mengubah status user") }
  }

  async function handleTogglePhoto(user: AppUser) {
    try {
      await updateUser(user.id, { canUploadPhoto: !user.canUploadPhoto })
      toast.success(`Fitur foto "${user.username}" ${!user.canUploadPhoto ? "diaktifkan" : "dinonaktifkan"}`)
      await loadUsers()
    } catch { toast.error("Gagal mengubah fitur foto") }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    if (deleteTarget.id === currentUserId) {
      toast.error("Tidak bisa menghapus akun sendiri")
      setDeleteTarget(null); return
    }
    try {
      await deleteUser(deleteTarget.id)
      toast.success(`User "${deleteTarget.username}" berhasil dihapus`)
      setDeleteTarget(null)
      await loadUsers()
    } catch { toast.error("Gagal menghapus user") }
  }

  // ── Handlers: Pending ────────────────────────────────────────────────────────
  async function handleApprove(user: AppUser) {
    setActionLoading(user.id)
    try {
      await approveUser(user.id)
      toast.success(`${user.nama} berhasil disetujui.`)
      await Promise.all([loadPending(), loadUsers()])
    } catch {
      toast.error("Gagal menyetujui pengguna.")
    } finally { setActionLoading(null) }
  }

  async function handleReject(user: AppUser) {
    setActionLoading(user.id)
    try {
      await rejectUser(user.id)
      toast.success(`${user.nama} ditolak.`)
      setConfirmReject(null)
      await loadPending()
    } catch {
      toast.error("Gagal menolak pengguna.")
    } finally { setActionLoading(null) }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("id-ID", {
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    })

  const PasswordField = ({
    label, value, onChange, show, onToggleShow, placeholder,
  }: {
    label: string; value: string; onChange: (v: string) => void
    show: boolean; onToggleShow: () => void; placeholder?: string
  }) => (
    <div className="flex flex-col gap-1.5">
      <Label className="text-sm font-bold text-foreground">{label}</Label>
      <div className="relative">
        <LockKeyhole className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder || "Minimal 6 karakter"}
          className="bg-background pl-9 pr-10 h-10 font-medium"
        />
        <button type="button" onClick={onToggleShow}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          tabIndex={-1}>
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )

  const PhotoToggleRow = () => (
    <div className="flex items-center justify-between rounded-xl border border-border/50 bg-background px-4 py-3">
      <div className="flex items-center gap-3">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${formCanUploadPhoto ? "bg-[#e8f5e3]" : "bg-muted"}`}>
          <Camera className={`h-4 w-4 ${formCanUploadPhoto ? "text-[#1a6010]" : "text-muted-foreground"}`} />
        </div>
        <div>
          <p className="text-sm font-bold text-foreground">Izin Upload Foto</p>
          <p className="text-xs text-muted-foreground">Upload foto pada kolom requirement</p>
        </div>
      </div>
      <button type="button" onClick={() => setFormCanUploadPhoto(!formCanUploadPhoto)} className="shrink-0">
        {formCanUploadPhoto
          ? <ToggleRight className="h-6 w-6 text-[#1a6010]" />
          : <ToggleLeft className="h-6 w-6 text-muted-foreground" />}
      </button>
    </div>
  )

  // ── Render ───────────────────────────────────────────────────────────────────
  const dialogTitle =
    view === "add" ? "Tambah User Baru" :
    view === "edit" ? "Edit User" :
    view === "password" ? "Ganti Password User" :
    "Manajemen User"

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-lg bg-card max-h-[90vh] overflow-y-auto p-0">

          {/* ── Header ── */}
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/40">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-lg font-extrabold text-foreground">
                  {dialogTitle}
                </DialogTitle>
                {view === "list" && (
                  <p className="text-xs text-muted-foreground font-medium">
                    {users.length} user terdaftar
                  </p>
                )}
              </div>
            </div>
          </DialogHeader>

          <div className="px-6 py-5 flex flex-col gap-4">

            {/* ── Main tabs — hanya tampil di view list ── */}
            {view === "list" && (
              <div className="flex gap-1 rounded-xl bg-muted/50 p-1 shrink-0">
                <button
                  onClick={() => setMainTab("users")}
                  className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-bold transition-all ${
                    mainTab === "users"
                      ? "bg-background shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Users className="h-4 w-4" />
                  Semua User
                </button>
                <button
                  onClick={() => setMainTab("pending")}
                  className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-bold transition-all ${
                    mainTab === "pending"
                      ? "bg-background shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Clock className="h-4 w-4" />
                  Menunggu
                  {pendingUsers.length > 0 && (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-white text-[10px] font-extrabold">
                      {pendingUsers.length}
                    </span>
                  )}
                </button>
              </div>
            )}

            {/* ══════════════════════════════════════════════
                TAB: SEMUA USER
            ══════════════════════════════════════════════ */}

            {/* ── LIST ── */}
            {view === "list" && mainTab === "users" && (
              <>
                <div className="flex justify-end">
                  <Button onClick={openAdd} size="sm" className="gap-1.5 bg-primary text-primary-foreground font-bold h-9">
                    <Plus className="h-4 w-4" /> Tambah User
                  </Button>
                </div>
                {loadingUsers ? (
                  <div className="flex justify-center py-8">
                    <RefreshCw className="h-5 w-5 animate-spin text-primary" />
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {users.map((user) => (
                      <div
                        key={user.id}
                        className={`flex items-center justify-between rounded-xl border px-4 py-3 transition-colors ${
                          user.isActive ? "border-border/50 bg-background" : "border-border/30 bg-muted/30 opacity-60"
                        }`}
                      >
                        {/* Info */}
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                            user.role === "admin" ? "bg-primary/10" : "bg-muted"
                          }`}>
                            {user.role === "admin"
                              ? <ShieldCheck className="h-4 w-4 text-primary" />
                              : <User className="h-4 w-4 text-muted-foreground" />}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="text-sm font-bold text-foreground truncate">{user.displayName}</p>
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                user.role === "admin" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                              }`}>
                                {user.role === "admin" ? "Admin" : "User"}
                              </span>
                              {!user.isActive && (
                                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold bg-destructive/10 text-destructive">
                                  Nonaktif
                                </span>
                              )}
                              {!user.canUploadPhoto && (
                                <span className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold bg-muted text-muted-foreground">
                                  <Camera className="h-2.5 w-2.5" />Foto Off
                                </span>
                              )}
                              {user.id === currentUserId && (
                                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold bg-[#c8ecc0] text-[#1a6010]">
                                  Saya
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground font-medium">@{user.username}</p>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          <button
                            onClick={() => handleTogglePhoto(user)}
                            className="rounded-lg p-1.5 transition-colors"
                            style={{ color: user.canUploadPhoto ? "#1a6010" : "#888" }}
                            title={user.canUploadPhoto ? "Nonaktifkan izin foto" : "Aktifkan izin foto"}
                          >
                            <Camera className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleToggleActive(user)}
                            disabled={user.id === currentUserId}
                            className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-30"
                            title={user.isActive ? "Nonaktifkan akun" : "Aktifkan akun"}
                          >
                            {user.isActive
                              ? <ToggleRight className="h-4 w-4 text-[#1a6010]" />
                              : <ToggleLeft className="h-4 w-4" />}
                          </button>
                          <button
                            onClick={() => openChangePassword(user)}
                            className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                            title="Ganti password"
                          >
                            <LockKeyhole className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => openEdit(user)}
                            className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(user)}
                            disabled={user.id === currentUserId}
                            className="rounded-lg p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-30"
                            title="Hapus"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* ── ADD ── */}
            {view === "add" && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-sm font-bold text-foreground">Username</Label>
                  <Input
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value.toLowerCase().replace(/\s/g, ""))}
                    placeholder="Contoh: drsusan"
                    className="bg-background h-10 font-medium"
                    autoFocus
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-sm font-bold text-foreground">Nama Tampilan</Label>
                  <Input
                    value={formDisplayName}
                    onChange={(e) => setFormDisplayName(e.target.value)}
                    placeholder="Contoh: Dr. Susan"
                    className="bg-background h-10 font-medium"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-sm font-bold text-foreground">Role</Label>
                  <Select value={formRole} onValueChange={(v) => setFormRole(v as "admin" | "user")}>
                    <SelectTrigger className="bg-background h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">User — akses data sendiri</SelectItem>
                      <SelectItem value="admin">Admin — kelola departemen & semua user</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <PhotoToggleRow />
                <PasswordField label="Password" value={formPassword} onChange={setFormPassword} show={showPw} onToggleShow={() => setShowPw(!showPw)} />
                <PasswordField label="Konfirmasi Password" value={formConfirmPw} onChange={setFormConfirmPw} show={showConfirm} onToggleShow={() => setShowConfirm(!showConfirm)} placeholder="Ulangi password" />
                {formPassword && formConfirmPw && formPassword !== formConfirmPw && (
                  <p className="text-xs font-bold text-destructive bg-destructive/10 px-3 py-2 rounded-lg">Password tidak cocok</p>
                )}
                <div className="flex gap-2 pt-1">
                  <Button variant="outline" onClick={() => setView("list")} className="flex-1 font-bold border-border">Batal</Button>
                  <Button onClick={handleAdd} disabled={saving} className="flex-1 bg-primary text-primary-foreground font-bold">
                    {saving ? "Menyimpan..." : "Buat User"}
                  </Button>
                </div>
              </div>
            )}

            {/* ── EDIT ── */}
            {view === "edit" && editingUser && (
              <div className="flex flex-col gap-4">
                <div className="rounded-xl bg-muted/30 border border-border/40 px-4 py-3">
                  <p className="text-xs text-muted-foreground font-medium">Username</p>
                  <p className="text-sm font-bold text-foreground">@{editingUser.username}</p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-sm font-bold text-foreground">Nama Tampilan</Label>
                  <Input value={formDisplayName} onChange={(e) => setFormDisplayName(e.target.value)} className="bg-background h-10 font-medium" autoFocus />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-sm font-bold text-foreground">Role</Label>
                  <Select value={formRole} onValueChange={(v) => setFormRole(v as "admin" | "user")}>
                    <SelectTrigger className="bg-background h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">User</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <PhotoToggleRow />
                <div className="flex gap-2 pt-1">
                  <Button variant="outline" onClick={() => setView("list")} className="flex-1 font-bold border-border">Batal</Button>
                  <Button onClick={handleEdit} disabled={saving} className="flex-1 bg-primary text-primary-foreground font-bold">
                    {saving ? "Menyimpan..." : "Simpan"}
                  </Button>
                </div>
              </div>
            )}

            {/* ── CHANGE PASSWORD ── */}
            {view === "password" && editingUser && (
              <div className="flex flex-col gap-4">
                <div className="rounded-xl bg-muted/30 border border-border/40 px-4 py-3">
                  <p className="text-xs text-muted-foreground font-medium">Ganti password untuk</p>
                  <p className="text-sm font-bold text-foreground">{editingUser.displayName} (@{editingUser.username})</p>
                </div>
                <PasswordField label="Password Baru" value={formPassword} onChange={setFormPassword} show={showPw} onToggleShow={() => setShowPw(!showPw)} />
                <PasswordField label="Konfirmasi Password Baru" value={formConfirmPw} onChange={setFormConfirmPw} show={showConfirm} onToggleShow={() => setShowConfirm(!showConfirm)} placeholder="Ulangi password baru" />
                {formPassword && formConfirmPw && formPassword !== formConfirmPw && (
                  <p className="text-xs font-bold text-destructive bg-destructive/10 px-3 py-2 rounded-lg">Password tidak cocok</p>
                )}
                <div className="flex gap-2 pt-1">
                  <Button variant="outline" onClick={() => setView("list")} className="flex-1 font-bold border-border">Batal</Button>
                  <Button onClick={handleChangePassword} disabled={saving || !formPassword || !formConfirmPw} className="flex-1 bg-primary text-primary-foreground font-bold">
                    {saving ? "Menyimpan..." : "Ubah Password"}
                  </Button>
                </div>
              </div>
            )}

            {/* ══════════════════════════════════════════════
                TAB: MENUNGGU PERSETUJUAN
            ══════════════════════════════════════════════ */}
            {view === "list" && mainTab === "pending" && (
              <>
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadPending}
                    disabled={loadingPending}
                    className="gap-1.5 text-xs font-bold border-border h-9"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${loadingPending ? "animate-spin" : ""}`} />
                    Refresh
                  </Button>
                </div>

                {loadingPending ? (
                  <div className="flex items-center justify-center py-12 text-muted-foreground">
                    <RefreshCw className="h-5 w-5 animate-spin mr-2" />
                    <span className="text-sm font-medium">Memuat data...</span>
                  </div>
                ) : pendingUsers.length === 0 ? (
                  <div className="flex flex-col items-center py-14 text-muted-foreground">
                    <CheckCircle2 className="h-10 w-10 mb-3 opacity-30" />
                    <p className="text-sm font-semibold">Tidak ada pendaftaran yang menunggu</p>
                    <p className="text-xs mt-1 opacity-70">Semua pendaftaran sudah diproses</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {pendingUsers.map((user) => (
                      <div
                        key={user.id}
                        className="flex items-center gap-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3"
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-200 text-amber-800 font-extrabold text-sm">
                          {user.nama.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-foreground truncate">{user.nama}</p>
                          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                          <p className="text-xs text-amber-600 mt-0.5">
                            <Clock className="h-3 w-3 inline mr-0.5" />
                            Daftar {formatDate(user.created_at)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            size="sm"
                            onClick={() => handleApprove(user)}
                            disabled={actionLoading === user.id}
                            className="h-8 gap-1 bg-green-600 hover:bg-green-700 text-white text-xs font-bold"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Setujui
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setConfirmReject(user)}
                            disabled={actionLoading === user.id}
                            className="h-8 gap-1 border-destructive/40 text-destructive hover:bg-destructive/10 text-xs font-bold"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Tolak
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm delete user */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent className="bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground font-bold">Hapus User</AlertDialogTitle>
            <AlertDialogDescription>
              Hapus user <span className="font-bold text-foreground">"{deleteTarget?.displayName}"</span>?
              Semua data pasien, appointment, dan weekly planning milik user ini akan ikut terhapus.
              Tindakan ini tidak dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border text-foreground font-bold">Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-white hover:bg-destructive/90 font-bold">
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm reject pendaftar */}
      <AlertDialog open={!!confirmReject} onOpenChange={() => setConfirmReject(null)}>
        <AlertDialogContent className="bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground font-bold">Tolak Pendaftaran</AlertDialogTitle>
            <AlertDialogDescription>
              Tolak pendaftaran <strong>{confirmReject?.nama}</strong> ({confirmReject?.email})?
              Data pendaftaran akan dihapus permanen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border text-foreground font-bold">Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmReject && handleReject(confirmReject)}
              className="bg-destructive text-white hover:bg-destructive/90 font-bold"
            >
              Tolak
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}