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
  Users, Plus, Pencil, Trash2, Eye, EyeOff, LockKeyhole, ShieldCheck, User,
  ToggleLeft, ToggleRight,
} from "lucide-react"
import type { AppUser } from "@/lib/types"
import {
  fetchUsers, createUser, updateUser, deleteUser, changeUserPassword,
} from "@/lib/supabase-queries"
import { toast } from "sonner"

interface UserManagementModalProps {
  open: boolean
  onClose: () => void
  currentUserId: string
}

type ViewMode = "list" | "add" | "edit" | "password"

export function UserManagementModal({ open, onClose, currentUserId }: UserManagementModalProps) {
  const [users, setUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState<ViewMode>("list")
  const [editingUser, setEditingUser] = useState<AppUser | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AppUser | null>(null)

  // Form state
  const [formUsername, setFormUsername] = useState("")
  const [formDisplayName, setFormDisplayName] = useState("")
  const [formRole, setFormRole] = useState<"admin" | "user">("user")
  const [formPassword, setFormPassword] = useState("")
  const [formConfirmPw, setFormConfirmPw] = useState("")
  const [showPw, setShowPw] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      loadUsers()
      setView("list")
    }
  }, [open])

  async function loadUsers() {
    setLoading(true)
    const data = await fetchUsers()
    setUsers(data)
    setLoading(false)
  }

  function openAdd() {
    setFormUsername("")
    setFormDisplayName("")
    setFormRole("user")
    setFormPassword("")
    setFormConfirmPw("")
    setShowPw(false)
    setShowConfirm(false)
    setEditingUser(null)
    setView("add")
  }

  function openEdit(user: AppUser) {
    setEditingUser(user)
    setFormDisplayName(user.displayName)
    setFormRole(user.role)
    setView("edit")
  }

  function openChangePassword(user: AppUser) {
    setEditingUser(user)
    setFormPassword("")
    setFormConfirmPw("")
    setShowPw(false)
    setShowConfirm(false)
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
    } finally {
      setSaving(false)
    }
  }

  async function handleEdit() {
    if (!editingUser) return
    setSaving(true)
    try {
      await updateUser(editingUser.id, { displayName: formDisplayName, role: formRole })
      toast.success("User berhasil diperbarui")
      await loadUsers()
      setView("list")
    } catch {
      toast.error("Gagal memperbarui user")
    } finally {
      setSaving(false)
    }
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
    } catch {
      toast.error("Gagal mengubah password")
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleActive(user: AppUser) {
    if (user.id === currentUserId) { toast.error("Tidak bisa menonaktifkan akun sendiri"); return }
    try {
      await updateUser(user.id, { isActive: !user.isActive })
      toast.success(`User "${user.username}" ${!user.isActive ? "diaktifkan" : "dinonaktifkan"}`)
      await loadUsers()
    } catch {
      toast.error("Gagal mengubah status user")
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    if (deleteTarget.id === currentUserId) { toast.error("Tidak bisa menghapus akun sendiri"); setDeleteTarget(null); return }
    try {
      await deleteUser(deleteTarget.id)
      toast.success(`User "${deleteTarget.username}" berhasil dihapus`)
      setDeleteTarget(null)
      await loadUsers()
    } catch {
      toast.error("Gagal menghapus user")
    }
  }

  const PasswordField = ({
    label, value, onChange, show, onToggleShow, placeholder
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
        <button type="button" onClick={onToggleShow} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" tabIndex={-1}>
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-lg bg-card max-h-[90vh] overflow-y-auto p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/40">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-lg font-extrabold text-foreground">
                  {view === "list" && "Manajemen User"}
                  {view === "add" && "Tambah User Baru"}
                  {view === "edit" && "Edit User"}
                  {view === "password" && "Ganti Password User"}
                </DialogTitle>
                <p className="text-xs text-muted-foreground font-medium">
                  {view === "list" ? `${users.length} user terdaftar` : ""}
                </p>
              </div>
            </div>
          </DialogHeader>

          <div className="px-6 py-5 flex flex-col gap-4">
            {/* ── LIST ── */}
            {view === "list" && (
              <>
                <div className="flex justify-end">
                  <Button onClick={openAdd} size="sm" className="gap-1.5 bg-primary text-primary-foreground font-bold h-9">
                    <Plus className="h-4 w-4" /> Tambah User
                  </Button>
                </div>

                {loading ? (
                  <div className="flex justify-center py-8">
                    <svg className="h-6 w-6 animate-spin text-primary" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
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
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                            user.role === "admin" ? "bg-primary/10" : "bg-muted"
                          }`}>
                            {user.role === "admin"
                              ? <ShieldCheck className="h-4 w-4 text-primary" />
                              : <User className="h-4 w-4 text-muted-foreground" />
                            }
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-bold text-foreground truncate">{user.displayName}</p>
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                user.role === "admin"
                                  ? "bg-primary/10 text-primary"
                                  : "bg-muted text-muted-foreground"
                              }`}>
                                {user.role === "admin" ? "Admin" : "User"}
                              </span>
                              {!user.isActive && (
                                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold bg-destructive/10 text-destructive">
                                  Nonaktif
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

                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          <button
                            onClick={() => handleToggleActive(user)}
                            disabled={user.id === currentUserId}
                            className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-30"
                            title={user.isActive ? "Nonaktifkan" : "Aktifkan"}
                          >
                            {user.isActive
                              ? <ToggleRight className="h-4 w-4 text-[#1a6010]" />
                              : <ToggleLeft className="h-4 w-4" />
                            }
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
                    <SelectTrigger className="bg-background h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">User — akses data sendiri</SelectItem>
                      <SelectItem value="admin">Admin — kelola departemen & semua user</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
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
                  <Input
                    value={formDisplayName}
                    onChange={(e) => setFormDisplayName(e.target.value)}
                    className="bg-background h-10 font-medium"
                    autoFocus
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-sm font-bold text-foreground">Role</Label>
                  <Select value={formRole} onValueChange={(v) => setFormRole(v as "admin" | "user")}>
                    <SelectTrigger className="bg-background h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">User</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
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
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
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
    </>
  )
}