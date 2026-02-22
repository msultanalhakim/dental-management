"use client"

import { useState, useMemo } from "react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Plus, Pencil, Trash2, CalendarDays, Search, Phone,
  Download, ChevronLeft, ChevronRight,
} from "lucide-react"
import type { Appointment, Department } from "@/lib/types"
import { downloadXlsx } from "@/lib/xlsx-writer"
import { formatDateWithDay } from "@/lib/types"
import { upsertAppointment, deleteAppointment } from "@/lib/supabase-queries"
import { WhatsAppModal } from "./dashboard"
import { toast } from "sonner"

const PAGE_SIZES = [10, "All"] as const
type PageSize = typeof PAGE_SIZES[number]

interface AppointmentsTableProps {
  appointments: Appointment[]
  onUpdate: (appointments: Appointment[]) => void
  departments: Department[]
}

async function exportAppointmentsExcel(rows: Appointment[]) {
  const d = new Date()
  const dateStr = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`
  await downloadXlsx(
    [{
      name: "Appointments",
      columns: [
        { header: "Tanggal",           key: "tanggal",    width: 24 },
        { header: "Jam",               key: "jam",        width: 8  },
        { header: "Kubikel",           key: "kubikel",    width: 18 },
        { header: "Rencana Perawatan", key: "rencana",    width: 30 },
        { header: "Kasus",             key: "kasus",      width: 24 },
        { header: "Departemen",        key: "departemen", width: 24 },
        { header: "Nama Pasien",       key: "nama",       width: 24 },
        { header: "No. Telp",          key: "telp",       width: 18 },
        { header: "Selesai",           key: "selesai",    width: 10 },
      ],
      rows: rows.map((a) => ({
        tanggal:    formatDateWithDay(a.tanggal),
        jam:        a.jam,
        kubikel:    a.kubikel,
        rencana:    a.rencanaPerawatan,
        kasus:      a.kasus,
        departemen: a.departemen,
        nama:       a.namaPasien,
        telp:       a.nomorTelp,
        selesai:    a.checklist ? "Ya" : "Tidak",
      })),
    }],
    `appointments_${dateStr}.xlsx`
  )
  toast.success("Export berhasil diunduh")
}

export function AppointmentsTable({ appointments, onUpdate, departments }: AppointmentsTableProps) {
  const [formOpen, setFormOpen] = useState(false)
  const [editingAppt, setEditingAppt] = useState<Appointment | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [waOpen, setWaOpen] = useState(false)
  const [waPhone, setWaPhone] = useState("")
  const [waName, setWaName] = useState("")
  const [pageSize, setPageSize] = useState<PageSize>(10)
  const [currentPage, setCurrentPage] = useState(1)
  const [exportConfirmOpen, setExportConfirmOpen] = useState(false)

  const [formData, setFormData] = useState({
    tanggal: "", jam: "", kubikel: "", rencanaPerawatan: "",
    kasus: "", departemen: "", namaPasien: "", nomorTelp: "",
  })

  const sorted = useMemo(() =>
    [...appointments].sort((a, b) =>
      new Date(b.tanggal + "T" + b.jam).getTime() - new Date(a.tanggal + "T" + a.jam).getTime()
    ),
  [appointments])

  const filtered = useMemo(() => {
    const t = searchTerm.toLowerCase().trim()
    if (!t) return sorted
    return sorted.filter((a) =>
      a.namaPasien.toLowerCase().includes(t) ||
      a.departemen.toLowerCase().includes(t) ||
      a.rencanaPerawatan.toLowerCase().includes(t) ||
      a.kasus.toLowerCase().includes(t) ||
      a.kubikel.toLowerCase().includes(t)
    )
  }, [sorted, searchTerm])

  const isAll = pageSize === "All"
  const effectivePageSize = isAll ? filtered.length || 1 : pageSize
  const totalPages = Math.max(1, Math.ceil(filtered.length / effectivePageSize))
  const page = Math.min(currentPage, totalPages)
  const paged = isAll ? filtered : filtered.slice((page - 1) * effectivePageSize, page * effectivePageSize)
  const checkedCount = appointments.filter((a) => a.checklist).length

  const openAdd = () => {
    setEditingAppt(null)
    setFormData({ tanggal: "", jam: "", kubikel: "", rencanaPerawatan: "", kasus: "", departemen: "", namaPasien: "", nomorTelp: "" })
    setFormOpen(true)
  }
  const openEdit = (appt: Appointment) => {
    setEditingAppt(appt)
    setFormData({ tanggal: appt.tanggal, jam: appt.jam, kubikel: appt.kubikel, rencanaPerawatan: appt.rencanaPerawatan, kasus: appt.kasus, departemen: appt.departemen, namaPasien: appt.namaPasien, nomorTelp: appt.nomorTelp })
    setFormOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const snapshot = appointments
    if (editingAppt) {
      const updated = { ...editingAppt, ...formData }
      onUpdate(appointments.map((a) => a.id === editingAppt.id ? updated : a))
      try {
        await upsertAppointment(updated)
        setFormOpen(false)
        toast.success("Appointment diperbarui")
      } catch {
        onUpdate(snapshot)
        toast.error("Gagal menyimpan. Perubahan dibatalkan.")
      }
    } else {
      const newAppt: Appointment = { id: `a-${Date.now()}`, ...formData, checklist: false }
      onUpdate([...appointments, newAppt])
      try {
        await upsertAppointment(newAppt)
        setFormOpen(false)
        toast.success("Appointment ditambahkan")
      } catch {
        onUpdate(snapshot)
        toast.error("Gagal menyimpan. Perubahan dibatalkan.")
      }
    }
  }

  const confirmDelete = async () => {
    if (deletingId) {
      const snapshot = appointments
      onUpdate(appointments.filter((a) => a.id !== deletingId))
      try {
        await deleteAppointment(deletingId)
        toast.success("Appointment dihapus")
      } catch {
        onUpdate(snapshot)
        toast.error("Gagal menghapus. Perubahan dibatalkan.")
      }
    }
    setDeleteConfirmOpen(false); setDeletingId(null)
  }

  const toggleChecklist = async (id: string) => {
    const snapshot = appointments
    const updated = appointments.map((a) => a.id === id ? { ...a, checklist: !a.checklist } : a)
    onUpdate(updated)
    const appt = updated.find((a) => a.id === id)
    if (appt) {
      try { await upsertAppointment(appt) } catch {
        onUpdate(snapshot)
        toast.error("Gagal menyimpan status. Perubahan dibatalkan.")
      }
    }
  }

  // Page number list for pagination display
  const pageNums = useMemo(() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
    if (page <= 4) return [1, 2, 3, 4, 5, -1, totalPages]
    if (page >= totalPages - 3) return [1, -1, totalPages-4, totalPages-3, totalPages-2, totalPages-1, totalPages]
    return [1, -1, page-1, page, page+1, -2, totalPages]
  }, [totalPages, page])

  return (
    <>
      <Card className="border-border/60 shadow-sm overflow-hidden">
        <CardHeader className="pb-3 pt-4 px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#d6e8f8]">
                <CalendarDays className="h-4.5 w-4.5 text-[#1a4f80]" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-foreground tracking-tight">Dental Appointments</h3>
                <p className="text-xs font-medium text-muted-foreground">
                  {appointments.length} appointment
                  <span className="mx-1.5 text-border">|</span>
                  <span className="font-bold text-[#1a6010]">{checkedCount} selesai</span>
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Cari..."
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1) }}
                  className="pl-8 h-8 w-44 text-xs bg-card border-border/60 font-medium"
                />
              </div>
              <Button variant="outline" size="sm" onClick={() => setExportConfirmOpen(true)} className="h-8 gap-1.5 border-border text-foreground text-xs font-bold">
                <Download className="h-3.5 w-3.5" />Export Excel
              </Button>
              <Button onClick={openAdd} size="sm" className="h-8 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-bold">
                <Plus className="h-3.5 w-3.5" />Tambah
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="px-0 pb-0 pt-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: 980 }}>
              <thead>
                <tr className="border-t border-b border-border/60 bg-muted/50">
                  <th className="px-3 py-2 text-left font-bold text-muted-foreground text-xs min-w-37.5">Tanggal</th>
                  <th className="px-3 py-2 text-left font-bold text-muted-foreground text-xs w-20">Jam</th>
                  <th className="px-3 py-2 text-left font-bold text-muted-foreground text-xs min-w-35">Kubikel</th>
                  <th className="px-3 py-2 text-left font-bold text-muted-foreground text-xs min-w-40">Rencana Perawatan</th>
                  <th className="px-3 py-2 text-left font-bold text-muted-foreground text-xs min-w-32.5">Kasus</th>
                  <th className="px-3 py-2 text-left font-bold text-muted-foreground text-xs min-w-32.5">Departemen</th>
                  <th className="px-3 py-2 text-left font-bold text-muted-foreground text-xs min-w-32.5">Nama Pasien</th>
                  <th className="px-3 py-2 text-left font-bold text-muted-foreground text-xs min-w-30">No. Telp</th>
                  <th className="px-3 py-2 text-center font-bold text-muted-foreground text-xs w-14">Cek</th>
                  <th className="px-3 py-2 text-center font-bold text-muted-foreground text-xs w-16">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {paged.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-12 text-center text-muted-foreground font-medium">
                      {searchTerm ? "Tidak ditemukan appointment yang sesuai" : "Belum ada appointment"}
                    </td>
                  </tr>
                ) : paged.map((appt) => (
                  <tr key={appt.id} className={`border-b border-border/30 transition-colors ${appt.checklist ? "bg-[#e6f5e0] hover:bg-[#d8f0ce]" : "hover:bg-muted/20"}`}>
                    <td className="px-3 py-2 font-bold text-foreground text-xs">{formatDateWithDay(appt.tanggal)}</td>
                    <td className="px-3 py-2 font-semibold text-foreground text-sm">{appt.jam}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center rounded-md bg-muted/70 px-2 py-1 text-xs font-bold text-foreground">{appt.kubikel}</span>
                    </td>
                    <td className="px-3 py-2 font-medium text-foreground text-sm">{appt.rencanaPerawatan}</td>
                    <td className="px-3 py-2 font-medium text-foreground text-sm">{appt.kasus}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center rounded-md bg-[#d6e8f8] px-2 py-0.5 text-xs font-bold text-[#1a4f80]">{appt.departemen}</span>
                    </td>
                    <td className="px-3 py-2 font-bold text-foreground text-sm">{appt.namaPasien}</td>
                    <td className="px-3 py-2">
                      {appt.nomorTelp ? (
                        <button onClick={() => { setWaPhone(appt.nomorTelp); setWaName(appt.namaPasien); setWaOpen(true) }} className="inline-flex items-center gap-1.5 text-sm font-medium text-[#1a6010] hover:text-[#25D366] transition-colors group">
                          <Phone className="h-3.5 w-3.5" />
                          <span className="group-hover:underline">{appt.nomorTelp}</span>
                        </button>
                      ) : <span className="text-muted-foreground/40">-</span>}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex justify-center">
                        <Checkbox checked={appt.checklist} onCheckedChange={() => toggleChecklist(appt.id)} />
                      </div>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex items-center justify-center gap-0.5">
                        <button onClick={() => openEdit(appt)} className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"><Pencil className="h-3.5 w-3.5" /></button>
                        <button onClick={() => { setDeletingId(appt.id); setDeleteConfirmOpen(true) }} className="rounded-md p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ─── Pagination Footer ─────────────────────────────────────────────── */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-t border-border/40 px-4 py-3 bg-muted/20">
            {/* Page size pills */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Tampilkan:</span>
              <div className="flex items-center gap-1">
                {PAGE_SIZES.map((s) => (
                  <button
                    key={s}
                    onClick={() => { setPageSize(s); setCurrentPage(1) }}
                    className={`rounded-md px-2.5 py-1 text-xs font-bold transition-all ${
                      pageSize === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Page nav — hidden when showing All */}
            {!isAll && (
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-muted-foreground font-medium mr-1">
                  {filtered.length === 0 ? "0 data" : `${(page-1)*effectivePageSize+1}–${Math.min(page*effectivePageSize, filtered.length)} / ${filtered.length}`}
                </span>
                <button onClick={() => setCurrentPage(1)} disabled={page === 1} className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-30 disabled:cursor-not-allowed">
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                {pageNums.map((n, i) =>
                  n < 0 ? (
                    <span key={`ellipsis-${i}`} className="px-1 text-muted-foreground">…</span>
                  ) : (
                    <button
                      key={n}
                      onClick={() => setCurrentPage(n)}
                      className={`rounded-md min-w-7 h-7 px-1 text-xs font-bold transition-all ${
                        page === n ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                      }`}
                    >
                      {n}
                    </button>
                  )
                )}
                <button onClick={() => setCurrentPage(totalPages)} disabled={page === totalPages} className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-30 disabled:cursor-not-allowed">
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            {isAll && (
              <span className="text-xs font-medium text-muted-foreground">
                Menampilkan semua {filtered.length} data
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <WhatsAppModal open={waOpen} onClose={() => setWaOpen(false)} phone={waPhone} name={waName} />

      {/* Form Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-xl bg-card max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground text-lg font-bold">
              {editingAppt ? "Edit Appointment" : "Tambah Appointment Baru"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm font-bold text-foreground">Tanggal</Label>
                <Input type="date" value={formData.tanggal} onChange={(e) => setFormData({ ...formData, tanggal: e.target.value })} className="bg-background font-medium" required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm font-bold text-foreground">Jam</Label>
                <Input type="time" value={formData.jam} onChange={(e) => setFormData({ ...formData, jam: e.target.value })} className="bg-background font-medium" required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm font-bold text-foreground">Kubikel</Label>
                <Input value={formData.kubikel} onChange={(e) => setFormData({ ...formData, kubikel: e.target.value })} placeholder="K-01" className="bg-background font-medium" required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm font-bold text-foreground">Departemen</Label>
                <Select value={formData.departemen} onValueChange={(v) => setFormData({ ...formData, departemen: v })}>
                  <SelectTrigger className="bg-background h-10"><SelectValue placeholder="Pilih departemen..." /></SelectTrigger>
                  <SelectContent>
                    {departments.map((d) => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)}
                    <SelectItem value="__manual__">Lainnya (manual)</SelectItem>
                  </SelectContent>
                </Select>
                {formData.departemen === "__manual__" && (
                  <Input value="" onChange={(e) => setFormData({ ...formData, departemen: e.target.value })} placeholder="Nama departemen" className="bg-background font-medium mt-1" />
                )}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm font-bold text-foreground">Rencana Perawatan</Label>
              <Input value={formData.rencanaPerawatan} onChange={(e) => setFormData({ ...formData, rencanaPerawatan: e.target.value })} placeholder="Deskripsi perawatan" className="bg-background font-medium" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm font-bold text-foreground">Kasus</Label>
              <Input value={formData.kasus} onChange={(e) => setFormData({ ...formData, kasus: e.target.value })} placeholder="Deskripsi kasus" className="bg-background font-medium" required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm font-bold text-foreground">Nama Pasien</Label>
                <Input value={formData.namaPasien} onChange={(e) => setFormData({ ...formData, namaPasien: e.target.value })} placeholder="Nama lengkap" className="bg-background font-medium" required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm font-bold text-foreground">No. Telp</Label>
                <Input value={formData.nomorTelp} onChange={(e) => setFormData({ ...formData, nomorTelp: e.target.value })} placeholder="08xxxxxxxxxx" className="bg-background font-medium" />
              </div>
            </div>
            <DialogFooter className="mt-2">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)} className="border-border text-foreground font-bold">Batal</Button>
              <Button type="submit" className="bg-primary text-primary-foreground hover:bg-primary/90 font-bold">{editingAppt ? "Simpan" : "Tambah"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent className="bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground font-bold">Hapus Appointment</AlertDialogTitle>
            <AlertDialogDescription>Apakah Anda yakin ingin menghapus appointment ini?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border text-foreground font-bold">Batal</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-white hover:bg-destructive/90 font-bold">Hapus</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={exportConfirmOpen} onOpenChange={setExportConfirmOpen}>
        <AlertDialogContent className="bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground font-bold flex items-center gap-2">
              <Download className="h-5 w-5 text-primary" />
              Export ke Excel
            </AlertDialogTitle>
            <AlertDialogDescription>
              {searchTerm
                ? `Mengekspor ${filtered.length} appointment yang sesuai filter "${searchTerm}".`
                : `Mengekspor seluruh ${filtered.length} appointment ke file Excel.`}
              {" "}File akan diunduh ke perangkat Anda.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border text-foreground font-bold">Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => exportAppointmentsExcel(filtered).catch(() => toast.error('Gagal export'))}
              className="bg-primary text-primary-foreground hover:bg-primary/90 font-bold"
            >
              <Download className="h-4 w-4 mr-1.5" />Ya, Export
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}