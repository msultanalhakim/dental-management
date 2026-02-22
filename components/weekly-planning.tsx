"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { CalendarRange, Plus, Phone, ExternalLink, Trash2 } from "lucide-react"
import type { WeeklySlot, Department, Patient, WeeklySlotData } from "@/lib/types"
import { parseSlotValue, serializeSlotData, formatPhoneForWA } from "@/lib/types"
import { upsertWeeklySlot } from "@/lib/supabase-queries"
import { toast } from "sonner"

interface WeeklyPlanningProps {
  slots: WeeklySlot[]
  onUpdate: (slots: WeeklySlot[]) => void
  departments: Department[]
}

const DAYS = [
  { key: "senin"  as const, label: "Senin"  },
  { key: "selasa" as const, label: "Selasa" },
  { key: "rabu"   as const, label: "Rabu"   },
  { key: "kamis"  as const, label: "Kamis"  },
  { key: "jumat"  as const, label: "Jumat"  },
]

type DayKey = "senin" | "selasa" | "rabu" | "kamis" | "jumat"

function getTodayKey(): DayKey | null {
  const map: Record<number, DayKey> = {
    1: "senin", 2: "selasa", 3: "rabu", 4: "kamis", 5: "jumat",
  }
  return map[new Date().getDay()] ?? null
}

function getDeptPatients(dept: Department): (Patient & { subDeptName?: string })[] {
  if (dept.hasSubDepartments) {
    return (dept.subDepartments || []).flatMap((sub) =>
      sub.patients.map((p) => ({ ...p, subDeptName: sub.name }))
    )
  }
  return dept.patients.filter((p) => p.hasPasien)
}

export function WeeklyPlanning({ slots, onUpdate, departments }: WeeklyPlanningProps) {
  const [slotOpen,  setSlotOpen]  = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [editSlotId, setEditSlotId] = useState<string | null>(null)
  const [editDay,   setEditDay]   = useState<DayKey>("senin")

  const [selectedDeptId,     setSelectedDeptId]     = useState("")
  const [selectedPatientId,  setSelectedPatientId]  = useState("")
  const [manualName,         setManualName]          = useState("")
  const [manualTelp,         setManualTelp]          = useState("")
  const [manualDept,         setManualDept]          = useState("")
  const [inputMode,          setInputMode]           = useState<"select" | "manual">("select")

  const [waOpen,  setWaOpen]  = useState(false)
  const [waPhone, setWaPhone] = useState("")
  const [waName,  setWaName]  = useState("")

  const todayKey       = getTodayKey()
  const selectedDept   = departments.find((d) => d.id === selectedDeptId)
  const deptPatients   = selectedDept ? getDeptPatients(selectedDept) : []
  const selectedPatient = deptPatients.find((p) => p.id === selectedPatientId)
  const currentSlot    = slots.find((s) => s.id === editSlotId)
  const editingRaw     = currentSlot ? (currentSlot[editDay] || "") : ""
  const editingParsed  = parseSlotValue(editingRaw)
  const isEditing      = editingParsed !== "" && editingParsed !== "ISTIRAHAT"

  const openSlot = (slotId: string, day: DayKey, rawValue: string) => {
    const parsed = parseSlotValue(rawValue)
    if (parsed === "ISTIRAHAT") return

    setEditSlotId(slotId)
    setEditDay(day)
    setSelectedDeptId("")
    setSelectedPatientId("")

    if (parsed !== "") {
      const data = parsed as WeeklySlotData
      setManualName(data.n ?? "")
      setManualTelp(data.t ?? "")
      setManualDept(data.d ?? "")
      setInputMode("manual")
    } else {
      setManualName("")
      setManualTelp("")
      setManualDept("")
      setInputMode("select")
    }
    setSlotOpen(true)
  }

  // Optimistic update with rollback on DB failure
  const updateSlot = async (slotId: string, day: DayKey, value: string): Promise<boolean> => {
    const snapshot = slots  // capture before mutation
    const updated  = slots.map((s) => s.id === slotId ? { ...s, [day]: value } : s)
    onUpdate(updated)       // optimistic apply

    const target = updated.find((s) => s.id === slotId)
    if (!target) {
      onUpdate(snapshot)
      toast.error("Slot tidak ditemukan. Perubahan dibatalkan.")
      return false
    }

    try {
      await upsertWeeklySlot(target)
      return true
    } catch {
      onUpdate(snapshot)    // ROLLBACK — data is restored
      toast.error("Gagal menyimpan jadwal. Perubahan dibatalkan.")
      return false
    }
  }

  const handleSave = async () => {
    if (!editSlotId || saving) return
    setSaving(true)

    let valueToSave = ""

    if (inputMode === "select") {
      if (!selectedPatient) { setSaving(false); return }
      valueToSave = serializeSlotData({
        n:   selectedPatient.namaPasien,
        t:   selectedPatient.nomorTelp,
        d:   selectedDept?.name ?? "",
        pid: selectedPatient.id,
      })
    } else {
      if (!manualName.trim()) { setSaving(false); return }
      valueToSave = serializeSlotData({
        n:   manualName.trim(),
        t:   manualTelp.trim(),
        d:   manualDept === "__none__" ? "" : manualDept.trim(),
        pid: "",
      })
    }

    const ok = await updateSlot(editSlotId, editDay, valueToSave)
    setSaving(false)
    if (ok) {
      setSlotOpen(false)
      toast.success("Jadwal berhasil disimpan")
    }
  }

  const handleClear = async () => {
    if (!editSlotId || saving) return
    setSaving(true)
    const ok = await updateSlot(editSlotId, editDay, "")
    setSaving(false)
    if (ok) {
      setSlotOpen(false)
      toast.success("Jadwal dihapus")
    }
  }

  const filledCount = slots
    .filter((slot) => slot.jam >= "08:00" && slot.jam <= "16:00")
    .reduce((count, slot) =>
      count + DAYS.filter((d) => {
        const v = parseSlotValue(slot[d.key])
        return v !== "" && v !== "ISTIRAHAT"
      }).length, 0
    )

  return (
    <>
      <Card className="border-border/60 shadow-sm overflow-hidden">
        <CardHeader className="pb-3 pt-4 px-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#e8d6f5]">
              <CalendarRange className="h-4.5 w-4.5 text-[#5a2080]" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-foreground tracking-tight">Weekly Planning</h3>
              <p className="text-xs font-medium text-muted-foreground">{filledCount} slot terisi minggu ini</p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="px-0 pb-0">
          <div className="w-full overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: "800px" }}>
              <thead>
                <tr className="border-b border-border/60 bg-muted/40">
                  <th className="px-3 py-2 text-left font-bold text-muted-foreground text-xs w-16 sticky left-0 bg-muted/40 z-10">
                    Jam
                  </th>
                  {DAYS.map((d) => {
                    const isToday = d.key === todayKey
                    return (
                      <th
                        key={d.key}
                        className={`px-2 py-2 text-center font-bold text-xs min-w-32.5 ${
                          isToday ? "text-[#5a2080] bg-[#f5eeff]" : "text-muted-foreground"
                        }`}
                      >
                        {d.label}
                        {isToday && <span className="ml-1 text-[9px] font-black text-[#5a2080]">●</span>}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {slots.filter((slot) => slot.jam >= "08:00" && slot.jam <= "16:00").map((slot) => (
                  <tr key={slot.id} className="border-b border-border/20 hover:bg-muted/10 transition-colors">
                    <td className="px-3 py-1.5 font-bold text-xs text-muted-foreground sticky left-0 bg-card z-10 border-r border-border/20">
                      {slot.jam}
                    </td>
                    {DAYS.map((d) => {
                      const raw    = slot[d.key] || ""
                      const parsed = parseSlotValue(raw)
                      const isToday = d.key === todayKey

                      if (parsed === "ISTIRAHAT") {
                        return (
                          <td key={d.key} className={`px-2 py-1.5 text-center ${isToday ? "bg-[#f5eeff]/50" : ""}`}>
                            <span className="text-[10px] font-bold text-muted-foreground/50 tracking-widest">ISTIRAHAT</span>
                          </td>
                        )
                      }

                      if (parsed !== "") {
                        const data = parsed as WeeklySlotData
                        return (
                          <td key={d.key} className={`px-2 py-1.5 ${isToday ? "bg-[#f5eeff]/50" : ""}`}>
                            <button
                              onClick={() => openSlot(slot.id, d.key, raw)}
                              className="w-full text-left rounded-lg bg-[#e8d6f5]/60 hover:bg-[#e8d6f5] border border-[#c4a0e8]/40 px-2.5 py-1.5 transition-all"
                            >
                              <p className="text-xs font-bold text-[#3d1060] leading-tight truncate max-w-30">{data.n}</p>
                              {data.d && <p className="text-[10px] text-[#7a40a0] font-medium truncate max-w-30">{data.d}</p>}
                              {data.t && <p className="text-[10px] text-[#5a2080]/70">{data.t}</p>}
                            </button>
                          </td>
                        )
                      }

                      return (
                        <td key={d.key} className={`px-2 py-1.5 ${isToday ? "bg-[#f5eeff]/30" : ""}`}>
                          <button
                            onClick={() => openSlot(slot.id, d.key, raw)}
                            className="w-full h-10 rounded-lg border border-dashed border-border/40 hover:border-[#c4a0e8] hover:bg-[#f5eeff]/40 transition-all flex items-center justify-center text-muted-foreground/30 hover:text-[#9b59d0]"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ─── Edit/Add Modal ─────────────────────────────────────────────────── */}
      <Dialog open={slotOpen} onOpenChange={(open) => { if (!saving) setSlotOpen(open) }}>
        <DialogContent className="sm:max-w-md bg-card">
          <DialogHeader>
            <DialogTitle className="text-foreground font-bold">
              {isEditing ? "Edit Jadwal" : "Tambah Jadwal"}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-3 py-1">
            <div className="flex items-center gap-2 text-sm rounded-lg bg-muted/30 px-3 py-2">
              <span className="font-extrabold text-foreground capitalize">{editDay}</span>
              <span className="text-muted-foreground">—</span>
              <span className="font-extrabold text-foreground">{currentSlot?.jam}</span>
            </div>

            {/* Mode toggle */}
            <div className="flex gap-2">
              {(["select", "manual"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setInputMode(mode)}
                  className={`flex-1 rounded-lg px-3 py-2 text-xs font-bold border transition-all ${
                    inputMode === mode
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {mode === "select" ? "Pilih dari Pasien" : "Input Manual"}
                </button>
              ))}
            </div>

            {/* ─── Select from patients ─── */}
            {inputMode === "select" && (
              <>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-foreground">Departemen</label>
                  <Select value={selectedDeptId} onValueChange={(v) => { setSelectedDeptId(v); setSelectedPatientId("") }}>
                    <SelectTrigger className="bg-background h-10"><SelectValue placeholder="Pilih departemen..." /></SelectTrigger>
                    <SelectContent>
                      {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {selectedDeptId && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-foreground">Pasien</label>
                    <Select value={selectedPatientId} onValueChange={setSelectedPatientId}>
                      <SelectTrigger className="bg-background h-10"><SelectValue placeholder="Pilih pasien..." /></SelectTrigger>
                      <SelectContent>
                        {deptPatients.length === 0
                          ? <div className="px-3 py-2 text-xs text-muted-foreground">Tidak ada pasien</div>
                          : deptPatients.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                <span className="font-semibold">{p.namaPasien}</span>
                                {p.subDeptName && <span className="text-muted-foreground text-xs ml-1">({p.subDeptName})</span>}
                              </SelectItem>
                            ))
                        }
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {selectedPatient && (
                  <div className="rounded-lg bg-[#f0faea] border border-[#c8ecc0] px-3 py-2.5">
                    <p className="text-xs font-bold text-[#1a6010]">{selectedPatient.namaPasien}</p>
                    {selectedDept && <p className="text-xs text-[#2d7a20]/70 mt-0.5">{selectedDept.name}</p>}
                    {selectedPatient.nomorTelp && <p className="text-xs text-[#2d7a20] mt-0.5">{selectedPatient.nomorTelp}</p>}
                  </div>
                )}
              </>
            )}

            {/* ─── Manual input ─── */}
            {inputMode === "manual" && (
              <>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-foreground">Nama Pasien / Keterangan</label>
                  <Input
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                    placeholder="Nama pasien atau keterangan"
                    className="bg-background h-10"
                    autoFocus
                    maxLength={100}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-foreground">
                    Departemen <span className="text-muted-foreground font-normal">(opsional)</span>
                  </label>
                  <Select value={manualDept} onValueChange={setManualDept}>
                    <SelectTrigger className="bg-background h-10"><SelectValue placeholder="Pilih departemen (opsional)..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Tidak ada —</SelectItem>
                      {departments.map((d) => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-foreground">
                    Nomor WhatsApp <span className="text-muted-foreground font-normal">(opsional)</span>
                  </label>
                  <Input
                    value={manualTelp}
                    onChange={(e) => setManualTelp(e.target.value)}
                    placeholder="08xxxxxxxxxx"
                    className="bg-background h-10"
                    maxLength={20}
                  />
                </div>

                {isEditing && manualTelp && (
                  <button
                    onClick={() => { setWaPhone(manualTelp); setWaName(manualName); setWaOpen(true) }}
                    className="flex items-center gap-2 rounded-lg bg-[#f0faea] border border-[#c8ecc0] px-3 py-2.5 text-sm font-semibold text-[#1a6010] hover:bg-[#e0f5d8] transition-colors"
                  >
                    <Phone className="h-4 w-4" />
                    Hubungi via WhatsApp
                  </button>
                )}
              </>
            )}
          </div>

          <DialogFooter className="flex gap-2">
            {isEditing && (
              <Button type="button" variant="outline" onClick={handleClear} disabled={saving}
                className="border-destructive text-destructive hover:bg-destructive/10 font-bold mr-auto gap-1">
                <Trash2 className="h-3.5 w-3.5" />Hapus
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => setSlotOpen(false)} disabled={saving}
              className="border-border text-foreground font-bold">
              Batal
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || (inputMode === "select" ? !selectedPatient : !manualName.trim())}
              className="bg-primary text-primary-foreground hover:bg-primary/90 font-bold min-w-22.5"
            >
              {saving ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── WhatsApp Modal ─────────────────────────────────────────────────── */}
      <Dialog open={waOpen} onOpenChange={setWaOpen}>
        <DialogContent className="sm:max-w-sm bg-card">
          <DialogHeader>
            <DialogTitle className="text-foreground text-lg font-bold">Hubungi via WhatsApp</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <p className="text-sm text-muted-foreground">
              Anda akan menghubungi <span className="font-bold text-foreground">{waName}</span> melalui WhatsApp.
            </p>
            <div className="flex items-center gap-2 rounded-lg bg-[#f0faea] border border-[#c8ecc0] px-4 py-3">
              <span className="text-sm font-bold text-[#1a6010]">{waPhone}</span>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setWaOpen(false)} className="border-border font-semibold">Batal</Button>
            <a href={`https://wa.me/${formatPhoneForWA(waPhone)}`} target="_blank" rel="noopener noreferrer" onClick={() => setWaOpen(false)}>
              <Button className="bg-[#25D366] text-white hover:bg-[#1ebe57] font-semibold gap-1.5">
                <ExternalLink className="h-4 w-4" />Buka WhatsApp
              </Button>
            </a>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}