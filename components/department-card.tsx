"use client"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import {
  Plus, Pencil, Trash2, Image as ImageIcon, ChevronDown, ChevronRight, GripVertical,
  Users, Layers, Phone, UserPlus, ExternalLink, PartyPopper,
} from "lucide-react"
import type { Department, Patient, PatientStatus, PatientEntry, SubDepartment, Photo } from "@/lib/types"
import {
  STATUS_COLORS, STATUS_OPTIONS, STATUS_WEIGHT, getProgressColor,
  formatPhoneForWA, syncLegacyFields,
} from "@/lib/types"
import {
  upsertPatient, deletePatient, upsertSubDepartment,
  upsertDepartment, uploadPhotoBase64, deletePhoto, upsertPatientSortOrder, getNextSortOrder,
} from "@/lib/supabase-queries"
import { PatientFormModal } from "./patient-form-modal"
import { PhotoModal } from "./photo-modal"
import { WhatsAppModal } from "./dashboard"
import { toast } from "sonner"
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ProgressBar({ percent }: { percent: number }) {
  const color = getProgressColor(percent)
  return (
    <div className="flex items-center gap-3 w-full">
      <div className="relative h-4 flex-1 rounded-full bg-muted/70 overflow-hidden">
        <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-500" style={{ width: `${percent}%`, backgroundColor: color }} />
      </div>
      <span className="inline-flex items-center rounded-lg px-2.5 py-1 text-sm font-extrabold min-w-16 justify-center" style={{ backgroundColor: `${color}22`, color, border: `1.5px solid ${color}40` }}>
        {percent}%
      </span>
    </div>
  )
}

function StatusBadge({ status }: { status: PatientStatus }) {
  const c = STATUS_COLORS[status]
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-extrabold ring-1 ring-inset ${c.bg} ${c.text} ${c.ring}`}>
      {status}
    </span>
  )
}

function calcWeightedProgress(patients: Patient[]): number {
  if (patients.length === 0) return 0
  return Math.round((patients.reduce((a, p) => a + STATUS_WEIGHT[p.status], 0) / (patients.length * 5)) * 100)
}

function calcCompleted(patients: Patient[]): number {
  return patients.filter((p) => p.status === "Selesai").length
}

// ─── Celebration Modal ────────────────────────────────────────────────────────

function CelebrationModal({ open, onClose, deptName }: { open: boolean; onClose: () => void; deptName: string }) {
  // Confetti dots generated once
  const confetti = useRef(
    Array.from({ length: 30 }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      delay: `${Math.random() * 1.5}s`,
      size: Math.random() * 8 + 6,
      color: ["#f5a623","#7ed321","#4a90e2","#d0021b","#9013fe","#50e3c2","#ff6b6b"][i % 7],
    }))
  ).current

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md bg-card border-none shadow-2xl overflow-hidden p-0">
        <DialogTitle className="sr-only">Selamat — Departemen Selesai</DialogTitle>
        {/* Confetti layer */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
          {confetti.map((c) => (
            <div
              key={c.id}
              className="absolute top-0 rounded-full animate-bounce"
              style={{
                left: c.left,
                width: c.size,
                height: c.size,
                backgroundColor: c.color,
                animationDelay: c.delay,
                animationDuration: `${1 + Math.random()}s`,
              }}
            />
          ))}
        </div>

        <div className="relative flex flex-col items-center gap-5 px-8 py-10 text-center">
          {/* Icon */}
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-linear-to-br from-[#ffeaa7] to-[#fdcb6e] shadow-lg">
            <PartyPopper className="h-10 w-10 text-[#8a5d10]" />
          </div>

          {/* Text */}
          <div>
            <h2 className="text-2xl font-extrabold text-foreground mb-2">Selamat! 🎉</h2>
            <p className="text-base font-semibold text-foreground mb-1">
              Departemen <span className="text-primary">{deptName}</span> selesai!
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Semua requirement telah diselesaikan dengan baik. Kerja keras kamu luar biasa, terus pertahankan!
            </p>
          </div>

          {/* Stars decoration */}
          <div className="flex gap-2 text-2xl" aria-hidden="true">
            {["⭐", "🌟", "✨", "🌟", "⭐"].map((s, i) => <span key={i}>{s}</span>)}
          </div>

          <Button
            onClick={onClose}
            className="bg-primary text-primary-foreground hover:bg-primary/90 font-bold px-8 py-2.5"
          >
            🤍
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Pasien List Modal ─────────────────────────────────────────────────────────

interface PasienListModalProps {
  open: boolean
  onClose: () => void
  patient: Patient
  onSave: (updatedPasienList: PatientEntry[]) => void
}

function PasienListModal({ open, onClose, patient, onSave }: PasienListModalProps) {
  const [list, setList] = useState<PatientEntry[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editNama, setEditNama] = useState("")
  const [editTelp, setEditTelp] = useState("")
  const [addMode, setAddMode] = useState(false)
  const [newNama, setNewNama] = useState("")
  const [newTelp, setNewTelp] = useState("")
  const [waOpen, setWaOpen] = useState(false)
  const [waPhone, setWaPhone] = useState("")
  const [waName, setWaName] = useState("")

  useEffect(() => {
    if (open) {
      setList(patient.pasienList.map((p) => ({ ...p })))
      setEditingId(null); setAddMode(false); setNewNama(""); setNewTelp("")
    }
  }, [open, patient])

  const startEdit = (entry: PatientEntry) => {
    setEditingId(entry.id); setEditNama(entry.namaPasien); setEditTelp(entry.nomorTelp); setAddMode(false)
  }

  const saveEdit = () => {
    if (!editNama.trim()) return
    setList((prev) => prev.map((p) => p.id === editingId ? { ...p, namaPasien: editNama.trim(), nomorTelp: editTelp.trim() } : p))
    setEditingId(null)
  }

  const deleteEntry = (id: string) => {
    setList((prev) => prev.filter((p) => p.id !== id))
    if (editingId === id) setEditingId(null)
  }

  const addEntry = () => {
    if (!newNama.trim()) return
    const entry: PatientEntry = { id: `pe-${Date.now()}`, namaPasien: newNama.trim(), nomorTelp: newTelp.trim() }
    setList((prev) => [...prev, entry])
    setNewNama(""); setNewTelp(""); setAddMode(false)
  }

  const handleSave = () => {
    // If currently editing inline, auto-save it
    if (editingId && editNama.trim()) {
      const finalList = list.map((p) => p.id === editingId ? { ...p, namaPasien: editNama.trim(), nomorTelp: editTelp.trim() } : p)
      onSave(finalList)
    } else {
      onSave(list)
    }
    onClose()
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-lg bg-card">
          <DialogHeader>
            <DialogTitle className="text-foreground font-bold">Kelola Pasien</DialogTitle>
            <p className="text-sm text-muted-foreground mt-0.5">{patient.requirement}</p>
          </DialogHeader>

          <div className="flex flex-col gap-2 max-h-[50vh] overflow-y-auto pr-1">
            {list.length === 0 && !addMode && (
              <div className="flex flex-col items-center py-8 text-muted-foreground">
                <Users className="h-8 w-8 mb-2 opacity-30" />
                <p className="text-sm font-medium">Belum ada pasien</p>
              </div>
            )}

            {list.map((entry, idx) => (
              <div key={entry.id} className={`rounded-xl border transition-all ${editingId === entry.id ? "border-primary/50 bg-primary/5" : "border-border/60 bg-muted/20"}`}>
                {editingId === entry.id ? (
                  // Inline edit form
                  <div className="flex flex-col gap-2 p-3">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-primary mb-1">
                      <Pencil className="h-3 w-3" /> Edit Pasien {idx + 1}
                    </div>
                    <Input
                      value={editNama}
                      onChange={(e) => setEditNama(e.target.value)}
                      placeholder="Nama pasien"
                      className="bg-background h-9 text-sm"
                      autoFocus
                    />
                    <Input
                      value={editTelp}
                      onChange={(e) => setEditTelp(e.target.value)}
                      placeholder="Nomor telepon (opsional)"
                      className="bg-background h-9 text-sm"
                    />
                    <div className="flex gap-2 justify-end mt-1">
                      <Button type="button" size="sm" variant="outline" onClick={() => setEditingId(null)} className="h-8 text-xs font-bold">Batal</Button>
                      <Button type="button" size="sm" onClick={saveEdit} disabled={!editNama.trim()} className="h-8 text-xs font-bold bg-primary text-primary-foreground">Simpan</Button>
                    </div>
                  </div>
                ) : (
                  // Display row
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-extrabold text-primary">
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-foreground truncate">{entry.namaPasien}</p>
                      {entry.nomorTelp && (
                        <p className="text-xs text-muted-foreground">{entry.nomorTelp}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      {entry.nomorTelp && (
                        <button
                          onClick={() => { setWaPhone(entry.nomorTelp); setWaName(entry.namaPasien); setWaOpen(true) }}
                          className="rounded-md p-1.5 text-[#1a6010] hover:bg-[#e6f5e0] transition-colors"
                          title="Hubungi via WhatsApp"
                        >
                          <Phone className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => startEdit(entry)}
                        className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => deleteEntry(entry.id)}
                        className="rounded-md p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Add new patient inline form */}
            {addMode && (
              <div className="rounded-xl border border-dashed border-primary/50 bg-primary/5 p-3 flex flex-col gap-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-primary mb-1">
                  <UserPlus className="h-3 w-3" /> Pasien Baru
                </div>
                <Input
                  value={newNama}
                  onChange={(e) => setNewNama(e.target.value)}
                  placeholder="Nama pasien"
                  className="bg-background h-9 text-sm"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addEntry() } }}
                />
                <Input
                  value={newTelp}
                  onChange={(e) => setNewTelp(e.target.value)}
                  placeholder="Nomor telepon (opsional)"
                  className="bg-background h-9 text-sm"
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addEntry() } }}
                />
                <div className="flex gap-2 justify-end mt-1">
                  <Button type="button" size="sm" variant="outline" onClick={() => { setAddMode(false); setNewNama(""); setNewTelp("") }} className="h-8 text-xs font-bold">Batal</Button>
                  <Button type="button" size="sm" onClick={addEntry} disabled={!newNama.trim()} className="h-8 text-xs font-bold bg-primary text-primary-foreground">
                    <Plus className="h-3 w-3 mr-1" /> Tambah
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Add button */}
          {!addMode && (
            <button
              onClick={() => { setAddMode(true); setEditingId(null) }}
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border/60 py-2.5 text-sm font-bold text-muted-foreground hover:border-primary/50 hover:text-primary hover:bg-primary/5 transition-all"
            >
              <UserPlus className="h-4 w-4" />
              Tambah Pasien
            </button>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} className="border-border text-foreground font-bold">Batal</Button>
            <Button onClick={handleSave} className="bg-primary text-primary-foreground hover:bg-primary/90 font-bold">
              Simpan ({list.length} pasien)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <WhatsAppModal open={waOpen} onClose={() => setWaOpen(false)} phone={waPhone} name={waName} />
    </>
  )
}

// ─── Patient Table ─────────────────────────────────────────────────────────────

interface PatientTableProps {
  patients: Patient[]
  onStatusChange: (patientId: string, status: PatientStatus) => void
  onEditPatient: (patient: Patient) => void
  onDeletePatient: (patientId: string) => void
  onOpenPhotos: (patient: Patient) => void
  onOpenWA: (phone: string, name: string) => void
  onOpenPasienList: (patient: Patient) => void
  onReorder?: (newPatients: Patient[]) => void
  searchQuery?: string
}

// ─── Highlight matching text ──────────────────────────────────────────────────

function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <span className="font-bold text-foreground text-sm">{text}</span>
  const lowerText = text.toLowerCase()
  const lowerQ = query.toLowerCase()
  const idx = lowerText.indexOf(lowerQ)
  if (idx === -1) return <span className="font-bold text-foreground text-sm">{text}</span>
  return (
    <span className="font-bold text-foreground text-sm">
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 text-yellow-900 rounded px-0.5 not-italic font-extrabold">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </span>
  )
}

// ─── Sortable Row ──────────────────────────────────────────────────────────────

interface SortableRowProps {
  patient: Patient
  onStatusChange: (patientId: string, status: PatientStatus) => void
  onEditPatient: (patient: Patient) => void
  onDeletePatient: (patientId: string) => void
  onOpenPhotos: (patient: Patient) => void
  onOpenWA: (phone: string, name: string) => void
  onOpenPasienList: (patient: Patient) => void
  searchQuery?: string
}

function SortableRow({
  patient, onStatusChange, onEditPatient, onDeletePatient,
  onOpenPhotos, onOpenWA, onOpenPasienList, searchQuery = "",
}: SortableRowProps) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: patient.id })

  const [isGrabbing, setIsGrabbing] = useState(false)

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
    position: isDragging ? "relative" : undefined,
  }

  const pasienCount = patient.pasienList.length
  const firstPasien = patient.pasienList[0]
  const rowBg = pasienCount === 0
    ? "bg-[#fdf0ef]"
    : patient.status === "Selesai"
    ? "bg-[#e6f5e0]"
    : ""
  const rowHover = pasienCount === 0
    ? "hover:bg-[#f5e5e3]"
    : patient.status === "Selesai"
    ? "hover:bg-[#d8f0ce]"
    : "hover:bg-muted/20"

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`border-b border-border/30 transition-colors ${rowBg} ${rowHover} ${isDragging ? "shadow-lg" : ""}`}
    >
      {/* Requirement + Drag Handle */}
      <td className="px-3 py-2">
        <div className="flex items-center gap-1.5">
          <button
            {...attributes}
            {...listeners}
            onMouseDown={() => setIsGrabbing(true)}
            onMouseUp={() => setIsGrabbing(false)}
            onMouseLeave={() => setIsGrabbing(false)}
            className="shrink-0 rounded p-0.5 text-muted-foreground/30 hover:text-muted-foreground/70 transition-colors touch-none"
            style={{ cursor: isGrabbing ? "grabbing" : "grab" }}
            title="Geser untuk ubah urutan"
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <HighlightText text={patient.requirement} query={searchQuery} />
        </div>
      </td>

      {/* Status - right aligned */}
      <td className="px-3 py-2 text-right">
        <div className="flex justify-end">
          <Select value={patient.status} onValueChange={(val) => onStatusChange(patient.id, val as PatientStatus)}>
            <SelectTrigger className="h-auto w-auto border-none bg-transparent shadow-none px-0 text-xs focus:ring-0 justify-end">
              <StatusBadge status={patient.status} />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}><StatusBadge status={s} /></SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </td>

      {/* Patients column */}
      <td className="px-3 py-2">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onOpenPasienList(patient)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-all border ${
              pasienCount === 0
                ? "border-dashed border-border/60 text-muted-foreground hover:border-primary/50 hover:text-primary hover:bg-primary/5"
                : "border-[#5cb848] bg-[#e6f5e0] text-[#1a6010] hover:bg-[#d0ecc5]"
            }`}
          >
            <Users className="h-3.5 w-3.5 shrink-0" />
            {pasienCount === 0 ? (
              <span>Belum ada pasien</span>
            ) : pasienCount === 1 ? (
              <span className="truncate max-w-25">{firstPasien?.namaPasien}</span>
            ) : (
              <span>{pasienCount} pasien</span>
            )}
          </button>
          {pasienCount > 0 && firstPasien?.nomorTelp && (
            <button
              onClick={() => onOpenWA(firstPasien.nomorTelp, firstPasien.namaPasien)}
              className="flex items-center justify-center rounded-md p-1.5 text-[#1a6010] hover:bg-[#e6f5e0] transition-colors"
              title={`WA ${firstPasien.namaPasien}`}
            >
              <Phone className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </td>

      {/* Photos */}
      <td className="px-3 py-2 text-center">
        <button
          onClick={() => onOpenPhotos(patient)}
          className="relative inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        >
          <ImageIcon className="h-4 w-4" />
          {patient.photos.length > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {patient.photos.length}
            </span>
          )}
        </button>
      </td>

      {/* Actions */}
      <td className="px-3 py-2 text-center">
        <div className="flex items-center justify-center gap-0.5">
          <button onClick={() => onEditPatient(patient)} className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => onDeletePatient(patient.id)} className="rounded-md p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  )
}

function PatientTable({
  patients, onStatusChange, onEditPatient, onDeletePatient, onOpenPhotos, onOpenWA, onOpenPasienList,
  onReorder, searchQuery = "",
}: PatientTableProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = patients.findIndex((p) => p.id === active.id)
    const newIndex = patients.findIndex((p) => p.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = arrayMove(patients, oldIndex, newIndex)
    onReorder?.(reordered)
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={patients.map((p) => p.id)} strategy={verticalListSortingStrategy}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-t border-b border-border/60 bg-muted/50">
                <th className="px-3 py-2 text-left font-bold text-muted-foreground text-xs min-w-37.5">Requirement</th>
                <th className="px-3 py-2 text-right font-bold text-muted-foreground text-xs min-w-45">Status</th>
                <th className="px-3 py-2 text-left font-bold text-muted-foreground text-xs min-w-37.5">Pasien</th>
                <th className="px-3 py-2 text-center font-bold text-muted-foreground text-xs w-14">Foto</th>
                <th className="px-3 py-2 text-center font-bold text-muted-foreground text-xs w-16">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {patients.map((patient) => (
                <SortableRow
                  key={patient.id}
                  patient={patient}
                  onStatusChange={onStatusChange}
                  onEditPatient={onEditPatient}
                  onDeletePatient={onDeletePatient}
                  onOpenPhotos={onOpenPhotos}
                  onOpenWA={onOpenWA}
                  onOpenPasienList={onOpenPasienList}
                  searchQuery={searchQuery}
                />
              ))}
            </tbody>
          </table>
        </div>
      </SortableContext>
    </DndContext>
  )
}

// ─── Department Card ───────────────────────────────────────────────────────────

interface DepartmentCardProps {
  department: Department
  onUpdate: (department: Department) => void
  onDeleteDepartment: () => void
  searchQuery?: string
}

export function DepartmentCard({ department, onUpdate, onDeleteDepartment, searchQuery = "" }: DepartmentCardProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const [expandedSubs, setExpandedSubs] = useState<Set<string>>(
    new Set(department.subDepartments?.map((s) => s.id) || [])
  )
  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState<"add" | "edit">("add")
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null)
  const [targetSubDeptId, setTargetSubDeptId] = useState<string | null>(null)

  const [pasienListOpen, setPasienListOpen] = useState(false)
  const [pasienListPatient, setPasienListPatient] = useState<Patient | null>(null)
  const [pasienListSubDeptId, setPasienListSubDeptId] = useState<string | null>(null)

  const [photoModalOpen, setPhotoModalOpen] = useState(false)
  const [photoPatient, setPhotoPatient] = useState<Patient | null>(null)
  const [photoSubDeptId, setPhotoSubDeptId] = useState<string | null>(null)

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deletingPatientId, setDeletingPatientId] = useState<string | null>(null)
  const [deletingSubDeptId, setDeletingSubDeptId] = useState<string | null>(null)
  const [deleteDeptOpen, setDeleteDeptOpen] = useState(false)
  const [addSubDeptOpen, setAddSubDeptOpen] = useState(false)
  const [newSubDeptName, setNewSubDeptName] = useState("")

  const [waOpen, setWaOpen] = useState(false)
  const [waPhone, setWaPhone] = useState("")
  const [waName, setWaName] = useState("")

  const [celebrationOpen, setCelebrationOpen] = useState(false)
  const prevProgressRef = useRef<number>(-1)

  const hasSubDepartments = department.hasSubDepartments
  const allPatients: Patient[] = hasSubDepartments
    ? (department.subDepartments || []).flatMap((s) => s.patients)
    : department.patients
  const totalPatients = allPatients.length
  const completedPatients = calcCompleted(allPatients)
  const weightedProgress = calcWeightedProgress(allPatients)

  // Filter patients by searchQuery (requirement match)
  const q = searchQuery.trim().toLowerCase()
  const filterPatients = (patients: Patient[]) =>
    q ? patients.filter((p) => p.requirement.toLowerCase().includes(q)) : patients

  // Trigger celebration when dept hits 100%
  useEffect(() => {
    if (
      totalPatients > 0 &&
      weightedProgress === 100 &&
      prevProgressRef.current !== 100 &&
      prevProgressRef.current !== -1
    ) {
      setCelebrationOpen(true)
    }
    prevProgressRef.current = weightedProgress
  }, [weightedProgress, totalPatients])

  const toggleSub = (id: string) => {
    setExpandedSubs((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  // Patient form (requirement + status only)
  const handleAddPatient = (subDeptId?: string) => {
    setFormMode("add"); setEditingPatient(null); setTargetSubDeptId(subDeptId || null); setFormOpen(true)
  }

  const handleEditPatient = (patient: Patient, subDeptId?: string) => {
    setFormMode("edit"); setEditingPatient(patient); setTargetSubDeptId(subDeptId || null); setFormOpen(true)
  }

  const handleSavePatientForm = async (data: Pick<Patient, "requirement" | "status">) => {
    let updated: Department
    let patientToSave: Patient
    let subDeptIdForSave: string | undefined
    let sortOrderForSave: number | undefined

    if (targetSubDeptId && hasSubDepartments) {
      if (formMode === "add") {
        const newP: Patient = syncLegacyFields({ id: `p-${Date.now()}`, ...data, pasienList: [], hasPasien: false, namaPasien: "", nomorTelp: "", photos: [] })
        updated = { ...department, subDepartments: department.subDepartments!.map((s) => s.id === targetSubDeptId ? { ...s, patients: [...s.patients, newP] } : s) }
        patientToSave = newP; subDeptIdForSave = targetSubDeptId
        sortOrderForSave = await getNextSortOrder(department.id, targetSubDeptId)
      } else if (editingPatient) {
        const upd = syncLegacyFields({ ...editingPatient, ...data })
        updated = { ...department, subDepartments: department.subDepartments!.map((s) => s.id === targetSubDeptId ? { ...s, patients: s.patients.map((p) => p.id === editingPatient.id ? upd : p) } : s) }
        patientToSave = upd; subDeptIdForSave = targetSubDeptId
      } else return
    } else {
      if (formMode === "add") {
        const newP: Patient = syncLegacyFields({ id: `p-${Date.now()}`, ...data, pasienList: [], hasPasien: false, namaPasien: "", nomorTelp: "", photos: [] })
        updated = { ...department, patients: [...department.patients, newP] }
        patientToSave = newP; subDeptIdForSave = undefined
        sortOrderForSave = await getNextSortOrder(department.id)
      } else if (editingPatient) {
        const upd = syncLegacyFields({ ...editingPatient, ...data })
        updated = { ...department, patients: department.patients.map((p) => p.id === editingPatient.id ? upd : p) }
        patientToSave = upd; subDeptIdForSave = undefined
      } else return
    }
    // Optimistic update
    onUpdate(updated)
    try {
      await upsertPatient(patientToSave, department.id, subDeptIdForSave, sortOrderForSave)
      toast.success(formMode === "add" ? "Requirement ditambahkan" : "Requirement diperbarui")
    } catch {
      onUpdate(department)  // ROLLBACK to original department state
      toast.error("Gagal menyimpan. Perubahan dibatalkan.")
    }
  }

  // Pasien list modal
  const handleOpenPasienList = (patient: Patient, subDeptId?: string) => {
    setPasienListPatient(patient); setPasienListSubDeptId(subDeptId || null); setPasienListOpen(true)
  }

  const handleSavePasienList = async (updatedList: PatientEntry[]) => {
    if (!pasienListPatient) return
    const updatedPatient = syncLegacyFields({ ...pasienListPatient, pasienList: updatedList })

    let updated: Department
    let subDeptId: string | undefined
    if (pasienListSubDeptId && hasSubDepartments) {
      updated = { ...department, subDepartments: department.subDepartments!.map((s) => s.id === pasienListSubDeptId ? { ...s, patients: s.patients.map((p) => p.id === updatedPatient.id ? updatedPatient : p) } : s) }
      subDeptId = pasienListSubDeptId
    } else {
      updated = { ...department, patients: department.patients.map((p) => p.id === updatedPatient.id ? updatedPatient : p) }
      subDeptId = undefined
    }
    onUpdate(updated)
    try {
      await upsertPatient(updatedPatient, department.id, subDeptId)
      toast.success("Daftar pasien diperbarui")
    } catch {
      onUpdate(department)  // ROLLBACK
      toast.error("Gagal menyimpan pasien. Perubahan dibatalkan.")
    }
  }

  // Status change
  const handleStatusChange = async (patientId: string, status: PatientStatus, subDeptId?: string) => {
    let updated: Department
    if (subDeptId && hasSubDepartments) {
      updated = { ...department, subDepartments: department.subDepartments!.map((s) => s.id === subDeptId ? { ...s, patients: s.patients.map((p) => p.id === patientId ? { ...p, status } : p) } : s) }
    } else {
      updated = { ...department, patients: department.patients.map((p) => p.id === patientId ? { ...p, status } : p) }
    }
    onUpdate(updated)
    const patient = allPatients.find((p) => p.id === patientId)
    if (patient) {
      try {
        await upsertPatient({ ...patient, status }, department.id, subDeptId)
      } catch {
        onUpdate(department)  // ROLLBACK
        toast.error("Gagal mengubah status. Perubahan dibatalkan.")
      }
    }
  }

  // Delete patient
  const handleDeletePatient = (patientId: string, subDeptId?: string) => {
    setDeletingPatientId(patientId); setDeletingSubDeptId(subDeptId || null); setDeleteConfirmOpen(true)
  }

  const confirmDeletePatient = async () => {
    if (!deletingPatientId) return
    let updated: Department
    if (deletingSubDeptId && hasSubDepartments) {
      updated = { ...department, subDepartments: department.subDepartments!.map((s) => s.id === deletingSubDeptId ? { ...s, patients: s.patients.filter((p) => p.id !== deletingPatientId) } : s) }
    } else {
      updated = { ...department, patients: department.patients.filter((p) => p.id !== deletingPatientId) }
    }
    onUpdate(updated)
    try {
      await deletePatient(deletingPatientId)
      toast.success("Requirement dihapus")
    } catch {
      onUpdate(department)  // ROLLBACK
      toast.error("Gagal menghapus. Perubahan dibatalkan.")
    }
    setDeleteConfirmOpen(false); setDeletingPatientId(null); setDeletingSubDeptId(null)
  }

  // Photos
  const handleOpenPhotos = (patient: Patient, subDeptId?: string) => {
    setPhotoPatient(patient); setPhotoSubDeptId(subDeptId || null); setPhotoModalOpen(true)
  }

  const updatePhotosInState = (patientId: string, photos: Photo[], subDeptId: string | null): Department => {
    const fn = (p: Patient) => p.id === patientId ? { ...p, photos } : p
    if (subDeptId && hasSubDepartments) {
      return { ...department, subDepartments: department.subDepartments!.map((s) => s.id === subDeptId ? { ...s, patients: s.patients.map(fn) } : s) }
    }
    return { ...department, patients: department.patients.map(fn) }
  }

  const handleAddPhoto = async (base64: string) => {
    if (!photoPatient) return
    const photo = await uploadPhotoBase64(photoPatient.id, base64)
    if (photo) {
      const newPhotos = [...photoPatient.photos, photo]
      setPhotoPatient({ ...photoPatient, photos: newPhotos })
      onUpdate(updatePhotosInState(photoPatient.id, newPhotos, photoSubDeptId))
    }
  }

  const handleRemovePhoto = async (index: number) => {
    if (!photoPatient) return
    const photo = photoPatient.photos[index]
    if (!photo) return
    await deletePhoto(photo)
    const newPhotos = photoPatient.photos.filter((_, i) => i !== index)
    setPhotoPatient({ ...photoPatient, photos: newPhotos })
    onUpdate(updatePhotosInState(photoPatient.id, newPhotos, photoSubDeptId))
    toast.success("Foto dihapus")
  }

  // Sub department
  const handleAddSubDept = async () => {
    if (!newSubDeptName.trim()) return
    const newSub: SubDepartment = { id: `sub-${Date.now()}`, name: newSubDeptName.trim(), patients: [] }
    const updated = { ...department, subDepartments: [...(department.subDepartments || []), newSub] }
    onUpdate(updated)
    try {
      await upsertSubDepartment(newSub, department.id)
    } catch {
      onUpdate(department)  // ROLLBACK
      toast.error("Gagal menambah sub-departemen. Perubahan dibatalkan.")
    }
    setNewSubDeptName(""); setAddSubDeptOpen(false)
    toast.success(`Sub-departemen "${newSub.name}" ditambahkan`)
  }

  // Reorder patients (called after drag-and-drop)
  const handleReorderPatients = async (newList: Patient[], subDeptId?: string) => {
    let updated: Department
    if (subDeptId && hasSubDepartments) {
      updated = { ...department, subDepartments: department.subDepartments!.map((s) => s.id === subDeptId ? { ...s, patients: newList } : s) }
    } else {
      updated = { ...department, patients: newList }
    }
    onUpdate(updated)

    // Persist all new sort_order values
    try {
      await Promise.all(
        newList.map((p, idx) => upsertPatientSortOrder(p.id, idx + 1))
      )
    } catch {
      onUpdate(department)
      toast.error("Gagal menyimpan urutan.")
    }
  }

  return (
    <>
      <Card className="border-border/60 shadow-sm overflow-hidden">
        <CardHeader className="pb-2 pt-4 px-5">
          <div className="flex items-start justify-between gap-4">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-start gap-2.5 text-left hover:opacity-80 transition-opacity min-w-0"
            >
              <div className="mt-0.5">
                {isExpanded ? <ChevronDown className="h-5 w-5 text-muted-foreground" /> : <ChevronRight className="h-5 w-5 text-muted-foreground" />}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-extrabold text-foreground tracking-tight truncate">{department.name}</h2>
                  {hasSubDepartments && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-[#e8d6f5] px-1.5 py-0.5 text-[10px] font-extrabold text-[#5a2080] uppercase tracking-wide">
                      <Layers className="h-3 w-3" />Sub
                    </span>
                  )}
                  {totalPatients > 0 && completedPatients === totalPatients && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-[#c8ecc0] px-1.5 py-0.5 text-[10px] font-extrabold text-[#1a6010] uppercase tracking-wide">
                      ✓ Selesai
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                    <Users className="h-3 w-3" />
                    <span className="font-extrabold text-foreground">{totalPatients}</span> requirement
                  </span>
                  <span className="text-border">|</span>
                  <span className="text-xs font-medium">
                    <span className="font-extrabold text-[#1a6010]">{completedPatients}</span>
                    <span className="text-muted-foreground">/{totalPatients} selesai</span>
                  </span>
                </div>
              </div>
            </button>
            <div className="flex items-center gap-2 shrink-0">
              {!hasSubDepartments && (
                <Button size="sm" variant="outline" onClick={() => handleAddPatient()} className="h-8 gap-1 border-border text-foreground text-xs font-bold">
                  <Plus className="h-3.5 w-3.5" /><span className="hidden sm:inline">Requirement</span>
                </Button>
              )}
              {hasSubDepartments && (
                <Button size="sm" variant="outline" onClick={() => setAddSubDeptOpen(true)} className="h-8 gap-1 border-border text-foreground text-xs font-bold">
                  <Plus className="h-3.5 w-3.5" /><span className="hidden sm:inline">Sub-Dept</span>
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => setDeleteDeptOpen(true)} className="h-8 border-border text-destructive hover:bg-destructive/10">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <div className="mt-4 mb-1">
            <ProgressBar percent={weightedProgress} />
          </div>
        </CardHeader>

        {isExpanded && (
          <CardContent className="px-0 pb-0 pt-1">
            {hasSubDepartments ? (
              <div className="flex flex-col">
                {(department.subDepartments || []).map((sub) => {
                  const isSubExp = expandedSubs.has(sub.id)
                  return (
                    <div key={sub.id} className="border-t border-border/40">
                      <div className="flex items-center justify-between px-5 py-3 bg-muted/30">
                        <button onClick={() => toggleSub(sub.id)} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                          {isSubExp ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                          <span className="text-sm font-extrabold text-foreground">{sub.name}</span>
                          <span className="text-xs font-medium text-muted-foreground">
                            (<span className="font-bold text-[#1a6010]">{calcCompleted(sub.patients)}</span>/{sub.patients.length})
                          </span>
                        </button>
                        <Button size="sm" variant="outline" onClick={() => handleAddPatient(sub.id)} className="h-7 gap-1 border-border text-foreground text-xs font-bold">
                          <Plus className="h-3 w-3" />Requirement
                        </Button>
                      </div>
                      {isSubExp && (
                        sub.patients.length === 0 ? (
                          <div className="flex flex-col items-center py-6 text-muted-foreground border-t border-border/30">
                            <Users className="h-6 w-6 mb-1.5 opacity-40" />
                            <p className="text-sm font-medium">Belum ada requirement</p>
                          </div>
                        ) : (
                          <PatientTable
                            patients={filterPatients(sub.patients)}
                            onStatusChange={(pid, s) => handleStatusChange(pid, s, sub.id)}
                            onEditPatient={(p) => handleEditPatient(p, sub.id)}
                            onDeletePatient={(pid) => handleDeletePatient(pid, sub.id)}
                            onOpenPhotos={(p) => handleOpenPhotos(p, sub.id)}
                            onOpenWA={(phone, name) => { setWaPhone(phone); setWaName(name); setWaOpen(true) }}
                            onOpenPasienList={(p) => handleOpenPasienList(p, sub.id)}
                            onReorder={(newList) => handleReorderPatients(newList, sub.id)}
                            searchQuery={q}
                          />
                        )
                      )}
                    </div>
                  )
                })}
                {(department.subDepartments || []).length === 0 && (
                  <div className="flex flex-col items-center py-10 text-muted-foreground">
                    <Layers className="h-8 w-8 mb-2 opacity-40" />
                    <p className="text-sm font-medium">Belum ada sub-departemen</p>
                    <Button size="sm" variant="ghost" onClick={() => setAddSubDeptOpen(true)} className="mt-2 text-primary font-bold">
                      <Plus className="mr-1 h-3.5 w-3.5" />Tambah Sub-Departemen
                    </Button>
                  </div>
                )}
              </div>
            ) : department.patients.length === 0 ? (
              <div className="flex flex-col items-center py-10 text-muted-foreground">
                <Users className="h-8 w-8 mb-2 opacity-40" />
                <p className="text-sm font-medium">Belum ada requirement</p>
                <Button size="sm" variant="ghost" onClick={() => handleAddPatient()} className="mt-2 text-primary font-bold">
                  <Plus className="mr-1 h-3.5 w-3.5" />Tambah Requirement
                </Button>
              </div>
            ) : (
              <PatientTable
                patients={filterPatients(department.patients)}
                onStatusChange={(pid, s) => handleStatusChange(pid, s)}
                onEditPatient={(p) => handleEditPatient(p)}
                onDeletePatient={(pid) => handleDeletePatient(pid)}
                onOpenPhotos={(p) => handleOpenPhotos(p)}
                onOpenWA={(phone, name) => { setWaPhone(phone); setWaName(name); setWaOpen(true) }}
                onOpenPasienList={(p) => handleOpenPasienList(p)}
                onReorder={(newList) => handleReorderPatients(newList)}
                searchQuery={q}
              />
            )}
          </CardContent>
        )}
      </Card>

      {/* Modals */}
      <PatientFormModal open={formOpen} onClose={() => setFormOpen(false)} onSave={handleSavePatientForm} patient={editingPatient} mode={formMode} />

      {pasienListPatient && (
        <PasienListModal
          open={pasienListOpen}
          onClose={() => { setPasienListOpen(false); setPasienListPatient(null) }}
          patient={pasienListPatient}
          onSave={handleSavePasienList}
        />
      )}

      {photoPatient && (
        <PhotoModal
          open={photoModalOpen}
          onClose={() => { setPhotoModalOpen(false); setPhotoPatient(null); setPhotoSubDeptId(null) }}
          photos={photoPatient.photos}
          onAddPhoto={handleAddPhoto}
          onRemovePhoto={handleRemovePhoto}
          patientName={photoPatient.namaPasien}
          requirement={photoPatient.requirement}
        />
      )}

      <WhatsAppModal open={waOpen} onClose={() => setWaOpen(false)} phone={waPhone} name={waName} />

      <CelebrationModal open={celebrationOpen} onClose={() => setCelebrationOpen(false)} deptName={department.name} />

      {/* Add Sub-Department */}
      <Dialog open={addSubDeptOpen} onOpenChange={setAddSubDeptOpen}>
        <DialogContent className="sm:max-w-md bg-card">
          <DialogHeader>
            <DialogTitle className="text-foreground text-lg font-bold">Tambah Sub-Departemen</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleAddSubDept() }} className="flex flex-col gap-4">
            <Input value={newSubDeptName} onChange={(e) => setNewSubDeptName(e.target.value)} placeholder="Nama sub-departemen" className="bg-background h-10 font-medium" required autoFocus />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddSubDeptOpen(false)} className="border-border text-foreground font-bold">Batal</Button>
              <Button type="submit" className="bg-primary text-primary-foreground hover:bg-primary/90 font-bold">Tambah</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Patient Confirm */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent className="bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground font-bold">Hapus Requirement</AlertDialogTitle>
            <AlertDialogDescription>Apakah Anda yakin ingin menghapus requirement ini? Semua data pasien dan foto terkait juga akan terhapus.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border text-foreground font-bold">Batal</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeletePatient} className="bg-destructive text-white hover:bg-destructive/90 font-bold">Hapus</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Department Confirm */}
      <AlertDialog open={deleteDeptOpen} onOpenChange={setDeleteDeptOpen}>
        <AlertDialogContent className="bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground font-bold">Hapus Departemen</AlertDialogTitle>
            <AlertDialogDescription>{`Apakah Anda yakin ingin menghapus departemen "${department.name}" beserta semua datanya?`}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border text-foreground font-bold">Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setDeleteDeptOpen(false); onDeleteDepartment() }} className="bg-destructive text-white hover:bg-destructive/90 font-bold">Hapus</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}