"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { CheckCircle2, XCircle, Clock, Users, RefreshCw, Trash2 } from "lucide-react"
import {
  fetchPendingUsers, approveUser, rejectUser, fetchApprovedUsers, deleteUser,
} from "@/lib/supabase-queries"
import { toast } from "sonner"

export interface AppUser {
  id: string
  nama: string
  email: string
  status: "pending" | "approved" | "rejected"
  created_at: string
}

interface UserApprovalPanelProps {
  open: boolean
  onClose: () => void
}

export function UserApprovalPanel({ open, onClose }: UserApprovalPanelProps) {
  const [tab, setTab] = useState<"pending" | "approved">("pending")
  const [pendingUsers, setPendingUsers] = useState<AppUser[]>([])
  const [approvedUsers, setApprovedUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [confirmReject, setConfirmReject] = useState<AppUser | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<AppUser | null>(null)

  const loadData = async () => {
    setLoading(true)
    try {
      const [pending, approved] = await Promise.all([
        fetchPendingUsers(),
        fetchApprovedUsers(),
      ])
      setPendingUsers(pending)
      setApprovedUsers(approved)
    } catch {
      toast.error("Gagal memuat data pengguna.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) loadData()
  }, [open])

  const handleApprove = async (user: AppUser) => {
    setActionLoading(user.id)
    try {
      await approveUser(user.id)
      toast.success(`${user.nama} berhasil disetujui.`)
      await loadData()
    } catch {
      toast.error("Gagal menyetujui pengguna.")
    } finally {
      setActionLoading(null)
    }
  }

  const handleReject = async (user: AppUser) => {
    setActionLoading(user.id)
    try {
      await rejectUser(user.id)
      toast.success(`${user.nama} ditolak.`)
      setConfirmReject(null)
      await loadData()
    } catch {
      toast.error("Gagal menolak pengguna.")
    } finally {
      setActionLoading(null)
    }
  }

  const handleDelete = async (user: AppUser) => {
    setActionLoading(user.id)
    try {
      await deleteUser(user.id)
      toast.success(`Akun ${user.nama} dihapus.`)
      setConfirmDelete(null)
      await loadData()
    } catch {
      toast.error("Gagal menghapus pengguna.")
    } finally {
      setActionLoading(null)
    }
  }

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString("id-ID", {
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    })
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-2xl bg-card max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-foreground font-bold flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Manajemen Pengguna
            </DialogTitle>
          </DialogHeader>

          {/* Tabs */}
          <div className="flex gap-1 rounded-xl bg-muted/50 p-1 shrink-0">
            <button
              onClick={() => setTab("pending")}
              className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-bold transition-all ${
                tab === "pending"
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
            <button
              onClick={() => setTab("approved")}
              className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-bold transition-all ${
                tab === "approved"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <CheckCircle2 className="h-4 w-4" />
              Disetujui
              {approvedUsers.length > 0 && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-white text-[10px] font-extrabold">
                  {approvedUsers.length}
                </span>
              )}
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <RefreshCw className="h-5 w-5 animate-spin mr-2" />
                <span className="text-sm font-medium">Memuat data...</span>
              </div>
            ) : tab === "pending" ? (
              pendingUsers.length === 0 ? (
                <div className="flex flex-col items-center py-14 text-muted-foreground">
                  <CheckCircle2 className="h-10 w-10 mb-3 opacity-30" />
                  <p className="text-sm font-semibold">Tidak ada pendaftaran yang menunggu</p>
                  <p className="text-xs mt-1 opacity-70">Semua pendaftaran sudah diproses</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3 py-2">
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
              )
            ) : (
              approvedUsers.length === 0 ? (
                <div className="flex flex-col items-center py-14 text-muted-foreground">
                  <Users className="h-10 w-10 mb-3 opacity-30" />
                  <p className="text-sm font-semibold">Belum ada pengguna disetujui</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3 py-2">
                  {approvedUsers.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center gap-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-200 text-green-800 font-extrabold text-sm">
                        {user.nama.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-foreground truncate">{user.nama}</p>
                          <Badge className="bg-green-100 text-green-700 border-green-200 text-[10px] font-bold px-1.5 py-0 shrink-0">
                            Aktif
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                        <p className="text-xs text-green-600 mt-0.5">
                          <CheckCircle2 className="h-3 w-3 inline mr-0.5" />
                          Bergabung {formatDate(user.created_at)}
                        </p>
                      </div>
                      <button
                        onClick={() => setConfirmDelete(user)}
                        disabled={actionLoading === user.id}
                        className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        title="Hapus pengguna"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>

          <DialogFooter className="shrink-0 pt-2 border-t border-border/40">
            <Button
              variant="outline"
              size="sm"
              onClick={loadData}
              disabled={loading}
              className="gap-1.5 text-xs font-bold border-border"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button variant="outline" onClick={onClose} className="border-border font-bold">
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Reject */}
      <AlertDialog open={!!confirmReject} onOpenChange={() => setConfirmReject(null)}>
        <AlertDialogContent className="bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground font-bold">Tolak Pendaftaran</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin menolak pendaftaran <strong>{confirmReject?.nama}</strong> ({confirmReject?.email})?
              Data pendaftaran akan dihapus.
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

      {/* Confirm Delete */}
      <AlertDialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <AlertDialogContent className="bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground font-bold">Hapus Pengguna</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin menghapus akun <strong>{confirmDelete?.nama}</strong>?
              Pengguna tidak akan bisa login lagi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border text-foreground font-bold">Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDelete && handleDelete(confirmDelete)}
              className="bg-destructive text-white hover:bg-destructive/90 font-bold"
            >
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}