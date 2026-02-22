"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  CalendarRange, Plus, Phone, ExternalLink, Trash2,
  ChevronLeft, ChevronRight, Lock,
} from "lucide-react"
import type { WeeklySlot, Department, Patient, WeeklySlotData } from "@/lib/types"
import { parseSlotValue, serializeSlotData, formatPhoneForWA } from "@/lib/types"
import { upsertWeeklySlot, fetchWeeklySlots } from "@/lib/supabase-queries"
import { toast } from "sonner"

// ─── Types ──────────────────────────────────────────────────────────────────

interface WeeklyPlanningProps {
  slots: WeeklySlot[]          // current week's slots (template + data)
  onUpdate: (slots: WeeklySlot[]) => void
  departments: Department[]
}

type DayKey = "senin" | "selasa" | "rabu" | "kamis" | "jumat"

// ─── Constants ───────────────────────────────────────────────────────────────

const DAYS: { key: DayKey; label: string }[] = [
  { key: "senin",  label: "Senin"  },
  { key: "selasa", label: "Selasa" },
  { key: "rabu",   label: "Rabu"   },
  { key: "kamis",  label: "Kamis"  },
  { key: "jumat",  label: "Jumat"  },
]

const MONTHS_ID = [
  "Januari","Februari","Maret","April","Mei","Juni",
  "Juli","Agustus","September","Oktober","November","Desember",
]

// ─── Date helpers ────────────────────────────────────────────────────────────

/** Returns Monday 00:00:00 of the week containing `date` */
function getMondayOf(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d
}

/** ISO "YYYY-MM-DD" */
function toISO(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Monday ISO of the current real-world week */
function todayWeekKey(): string {
  return toISO(getMondayOf(new Date()))
}

/** Offset a Monday date by N weeks */
function shiftWeek(monday: Date, n: number): Date {
  const d = new Date(monday)
  d.setDate(d.getDate() + n * 7)
  return d
}

/**
 * Human-readable week label, e.g.:
 *   "3 – 7 Februari 2025"
 *   "28 April – 2 Mei 2025"
 */
function weekRangeLabel(monday: Date): string {
  const friday = shiftWeek(monday, 0)
  friday.setDate(friday.getDate() + 4)

  const sd = monday.getDate()
  const ed = friday.getDate()
  const sm = MONTHS_ID[monday.getMonth()]
  const em = MONTHS_ID[friday.getMonth()]
  const ey = friday.getFullYear()

  if (monday.getMonth() === friday.getMonth()) {
    return `${sd} – ${ed} ${sm} ${ey}`
  }
  return `${sd} ${sm} – ${ed} ${em} ${ey}`
}

function getTodayDayKey(): DayKey | null {
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

/** Build a blank week (all slots empty) from a template */
function blankWeek(template: WeeklySlot[]): WeeklySlot[] {
  return template.map((s) => ({
    ...s,
    senin: "", selasa: "", rabu: "", kamis: "", jumat: "",
  }))
}

// ─── Component ───────────────────────────────────────────────────────────────

export function WeeklyPlanning({ slots, onUpdate, departments }: WeeklyPlanningProps) {
  const currentWeekKey = todayWeekKey()
  const currentMonday  = getMondayOf(new Date())

  // weekOffset: 0 = this week, -1 = prev, +1 = next, etc.
  const [weekOffset,   setWeekOffset]   = useState(0)
  const [historyCache, setHistoryCache] = useState<Record<string, WeeklySlot[]>>({})
  const [loadingWeek,  setLoadingWeek]  = useState(false)

  // Which Monday is being viewed
  const viewMonday  = shiftWeek(currentMonday, weekOffset)
  const viewWeekKey = toISO(viewMonday)
  const isCurrentWeek = viewWeekKey === currentWeekKey
  const isPastWeek    = viewMonday < currentMonday

  // Slots to display: current week from prop, others from cache
  const viewSlots: WeeklySlot[] = isCurrentWeek
    ? slots
    : (historyCache[viewWeekKey] ?? blankWeek(slots))

  // ── Fetch past/future week from DB when navigating ───────────────────────
  useEffect(() => {
    if (isCurrentWeek) return
    if (historyCache[viewWeekKey]) return   // already loaded

    setLoadingWeek(true)
    fetchWeeklySlots(viewWeekKey)
      .then((fetched: WeeklySlot[]) => {
        setHistoryCache((c) => ({ ...c, [viewWeekKey]: fetched }))
      })
      .catch(() => {
        // silently fall back to blank week; already initialised above
      })
      .finally(() => setLoadingWeek(false))
  }, [viewWeekKey, isCurrentWeek, historyCache])

  // ── Modal state ──────────────────────────────────────────────────────────
  const [slotOpen,   setSlotOpen]   = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [editSlotId, setEditSlotId] = useState<string | null>(null)
  const [editDay,    setEditDay]    = useState<DayKey>("senin")

  const [selectedDeptId,    setSelectedDeptId]    = useState("")
  const [selectedPatientId, setSelectedPatientId] = useState("")
  const [manualName,        setManualName]         = useState("")
  const [manualTelp,        setManualTelp]         = useState("")
  const [manualDept,        setManualDept]         = useState("")
  const [inputMode,         setInputMode]          = useState<"select" | "manual">("select")

  const [waOpen,  setWaOpen]  = useState(false)
  const [waPhone, setWaPhone] = useState("")
  const [waName,  setWaName]  = useState("")

  const todayDayKey     = getTodayDayKey()
  const selectedDept    = departments.find((d) => d.id === selectedDeptId)
  const deptPatients    = selectedDept ? getDeptPatients(selectedDept) : []
  const selectedPatient = deptPatients.find((p) => p.id === selectedPatientId)
  const currentSlot     = viewSlots.find((s) => s.id === editSlotId)
  const editingRaw      = currentSlot ? (currentSlot[editDay] || "") : ""
  const editingParsed   = parseSlotValue(editingRaw)
  const isEditing       = editingParsed !== "" && editingParsed !== "ISTIRAHAT"

  // ── Open slot modal ───────────────────────────────────────────────────────
  const openSlot = (slotId: string, day: DayKey, rawValue: string) => {
    if (!isCurrentWeek) return   // past/future weeks are read-only
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
      setManualName(""); setManualTelp(""); setManualDept("")
      setInputMode("select")
    }
    setSlotOpen(true)
  }

  // ── Optimistic update (current week only) ────────────────────────────────
  const updateSlot = async (slotId: string, day: DayKey, value: string): Promise<boolean> => {
    const snapshot = slots
    const updated  = slots.map((s) => s.id === slotId ? { ...s, [day]: value } : s)
    onUpdate(updated)

    const target = updated.find((s) => s.id === slotId)
    if (!target) {
      onUpdate(snapshot)
      toast.error("Slot tidak ditemukan. Perubahan dibatalkan.")
      return false
    }
    try {
      await upsertWeeklySlot({ ...target, weekKey: currentWeekKey })
      return true
    } catch {
      onUpdate(snapshot)
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
        n: selectedPatient.namaPasien, t: selectedPatient.nomorTelp,
        d: selectedDept?.name ?? "", pid: selectedPatient.id,
      })
    } else {
      if (!manualName.trim()) { setSaving(false); return }
      valueToSave = serializeSlotData({
        n: manualName.trim(), t: manualTelp.trim(),
        d: manualDept === "__none__" ? "" : manualDept.trim(), pid: "",
      })
    }

    const ok = await updateSlot(editSlotId, editDay, valueToSave)
    setSaving(false)
    if (ok) { setSlotOpen(false); toast.success("Jadwal berhasil disimpan") }
  }

  const handleClear = async () => {
    if (!editSlotId || saving) return
    setSaving(true)
    const ok = await updateSlot(editSlotId, editDay, "")
    setSaving(false)
    if (ok) { setSlotOpen(false); toast.success("Jadwal dihapus") }
  }

  // ── Stats ─────────────────────────────────────────────────────────────────
  const filledCount = viewSlots
    .filter((s) => s.jam >= "08:00" && s.jam <= "16:00")
    .reduce((n, s) =>
      n + DAYS.filter((d) => {
        const v = parseSlotValue(s[d.key])
        return v !== "" && v !== "ISTIRAHAT"
      }).length, 0
    )

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <Card className="border-border/60 shadow-sm overflow-hidden">
        <CardHeader className="pb-3 pt-4 px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

            {/* Title */}
            <div className="flex items-center gap-3">
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                isCurrentWeek ? "bg-[#e8d6f5]" : "bg-muted/60"
              }`}>
                <CalendarRange className={`h-4.5 w-4.5 ${isCurrentWeek ? "text-[#5a2080]" : "text-muted-foreground"}`} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-extrabold text-foreground tracking-tight">Weekly Planning</h3>
                  {isCurrentWeek && (
                    <span className="inline-flex items-center rounded-full bg-[#5a2080] px-2 py-0.5 text-[10px] font-black text-white tracking-wide">
                      MINGGU INI
                    </span>
                  )}
                  {isPastWeek && !isCurrentWeek && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                      <Lock className="h-2.5 w-2.5" />ARSIP
                    </span>
                  )}
                </div>
                <p className="text-xs font-medium text-muted-foreground">
                  {filledCount} slot terisi
                  {loadingWeek && <span className="ml-2 text-[#5a2080]">Memuat...</span>}
                </p>
              </div>
            </div>

            {/* Week navigator */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setWeekOffset((o) => o - 1)}
                className="rounded-lg border border-border/60 p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                aria-label="Minggu sebelumnya"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <div className={`flex flex-col items-center rounded-xl px-4 py-1.5 min-w-44 text-center border transition-all ${
                isCurrentWeek
                  ? "bg-[#f5eeff] border-[#c4a0e8]/60"
                  : "bg-muted/30 border-border/40"
              }`}>
                <span className={`text-xs font-black tracking-tight ${
                  isCurrentWeek ? "text-[#5a2080]" : "text-muted-foreground"
                }`}>
                  {weekRangeLabel(viewMonday)}
                </span>
              </div>

              <button
                onClick={() => setWeekOffset((o) => o + 1)}
                className="rounded-lg border border-border/60 p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                aria-label="Minggu berikutnya"
              >
                <ChevronRight className="h-4 w-4" />
              </button>

              {weekOffset !== 0 && (
                <button
                  onClick={() => setWeekOffset(0)}
                  className="ml-1 rounded-lg border border-[#c4a0e8]/60 bg-[#f5eeff] px-3 py-1.5 text-xs font-bold text-[#5a2080] hover:bg-[#ecdff8] transition-colors"
                >
                  Hari ini
                </button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="px-0 pb-0">
          {/* Read-only banner for non-current weeks */}
          {!isCurrentWeek && (
            <div className={`flex items-center gap-2 px-5 py-2 text-xs font-semibold border-b border-border/30 ${
              isPastWeek
                ? "bg-muted/30 text-muted-foreground"
                : "bg-blue-50 text-blue-700 border-blue-100"
            }`}>
              <Lock className="h-3.5 w-3.5 shrink-0" />
              {isPastWeek
                ? "Rekam jejak — minggu ini sudah lewat dan tidak dapat diedit."
                : "Minggu mendatang — belum dapat diedit sebelum minggunya tiba."}
            </div>
          )}

          <div className="w-full overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: "800px" }}>
              <thead>
                <tr className={`border-b border-border/60 ${isCurrentWeek ? "bg-muted/40" : "bg-muted/20"}`}>
                  <th className={`px-3 py-2 text-left font-bold text-muted-foreground text-xs w-16 sticky left-0 z-10 ${
                    isCurrentWeek ? "bg-muted/40" : "bg-muted/20"
                  }`}>
                    Jam
                  </th>
                  {DAYS.map((d) => {
                    const isToday = isCurrentWeek && d.key === todayDayKey
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
                {viewSlots
                  .filter((slot) => slot.jam >= "08:00" && slot.jam <= "16:00")
                  .map((slot) => (
                    <tr
                      key={slot.id}
                      className={`border-b border-border/20 transition-colors ${
                        isCurrentWeek ? "hover:bg-muted/10" : "opacity-80"
                      }`}
                    >
                      <td className="px-3 py-1.5 font-bold text-xs text-muted-foreground sticky left-0 bg-card z-10 border-r border-border/20">
                        {slot.jam}
                      </td>
                      {DAYS.map((d) => {
                        const raw    = slot[d.key] || ""
                        const parsed = parseSlotValue(raw)
                        const isToday = isCurrentWeek && d.key === todayDayKey

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
                                disabled={!isCurrentWeek}
                                className={`w-full text-left rounded-lg px-2.5 py-1.5 border transition-all ${
                                  isCurrentWeek
                                    ? "bg-[#e8d6f5]/60 hover:bg-[#e8d6f5] border-[#c4a0e8]/40 cursor-pointer"
                                    : "bg-[#e8d6f5]/30 border-[#c4a0e8]/20 cursor-default"
                                }`}
                              >
                                <p className="text-xs font-bold text-[#3d1060] leading-tight truncate max-w-30">{data.n}</p>
                                {data.d && <p className="text-[10px] text-[#7a40a0] font-medium truncate max-w-30">{data.d}</p>}
                                {data.t && <p className="text-[10px] text-[#5a2080]/70">{data.t}</p>}
                              </button>
                            </td>
                          )
                        }

                        // Empty slot
                        return (
                          <td key={d.key} className={`px-2 py-1.5 ${isToday ? "bg-[#f5eeff]/30" : ""}`}>
                            {isCurrentWeek ? (
                              <button
                                onClick={() => openSlot(slot.id, d.key, raw)}
                                className="w-full h-10 rounded-lg border border-dashed border-border/40 hover:border-[#c4a0e8] hover:bg-[#f5eeff]/40 transition-all flex items-center justify-center text-muted-foreground/30 hover:text-[#9b59d0]"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            ) : (
                              <div className="w-full h-10 rounded-lg border border-dashed border-border/20 flex items-center justify-center">
                                <span className="text-[10px] text-muted-foreground/25">—</span>
                              </div>
                            )}
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

      {/* ─── Edit/Add Modal (current week only) ─────────────────────────────── */}
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
              <span className="ml-auto text-[10px] font-bold text-[#5a2080] bg-[#f5eeff] rounded-full px-2 py-0.5">
                {weekRangeLabel(viewMonday)}
              </span>
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

            {/* Select from patients */}
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

            {/* Manual input */}
            {inputMode === "manual" && (
              <>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-foreground">Nama Pasien / Keterangan</label>
                  <Input value={manualName} onChange={(e) => setManualName(e.target.value)}
                    placeholder="Nama pasien atau keterangan" className="bg-background h-10" autoFocus maxLength={100} />
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
                  <Input value={manualTelp} onChange={(e) => setManualTelp(e.target.value)}
                    placeholder="08xxxxxxxxxx" className="bg-background h-10" maxLength={20} />
                </div>
                {isEditing && manualTelp && (
                  <button
                    onClick={() => { setWaPhone(manualTelp); setWaName(manualName); setWaOpen(true) }}
                    className="flex items-center gap-2 rounded-lg bg-[#f0faea] border border-[#c8ecc0] px-3 py-2.5 text-sm font-semibold text-[#1a6010] hover:bg-[#e0f5d8] transition-colors"
                  >
                    <Phone className="h-4 w-4" />Hubungi via WhatsApp
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
              className="border-border text-foreground font-bold">Batal</Button>
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

      {/* ─── WhatsApp Modal ──────────────────────────────────────────────────── */}
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