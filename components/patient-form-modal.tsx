"use client"

import { useState, useEffect } from "react"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import type { Patient, PatientStatus } from "@/lib/types"
import { STATUS_OPTIONS, STATUS_COLORS } from "@/lib/types"

interface PatientFormModalProps {
  open: boolean
  onClose: () => void
  onSave: (data: Pick<Patient, "requirement" | "status">) => void
  patient?: Patient | null
  mode: "add" | "edit"
}

export function PatientFormModal({
  open, onClose, onSave, patient, mode,
}: PatientFormModalProps) {
  const [requirement, setRequirement] = useState("")
  const [status, setStatus] = useState<PatientStatus>("Belum Dikerjakan")

  useEffect(() => {
    if (patient && mode === "edit") {
      setRequirement(patient.requirement)
      setStatus(patient.status)
    } else {
      setRequirement("")
      setStatus("Belum Dikerjakan")
    }
  }, [patient, mode, open])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave({ requirement, status })
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md bg-card">
        <DialogHeader>
          <DialogTitle className="text-foreground text-lg font-bold">
            {mode === "add" ? "Tambah Requirement Baru" : "Edit Requirement"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="requirement" className="text-sm font-bold text-foreground">Requirement / Tindakan</Label>
            <Input
              id="requirement"
              value={requirement}
              onChange={(e) => setRequirement(e.target.value)}
              placeholder="Contoh: Penambalan Gigi Molar"
              className="bg-background h-10"
              required
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-sm font-bold text-foreground">Status</Label>
            <Select value={status} onValueChange={(val) => setStatus(val as PatientStatus)}>
              <SelectTrigger className="bg-background w-full h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => {
                  const c = STATUS_COLORS[s]
                  return (
                    <SelectItem key={s} value={s}>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${c.bg} ${c.text}`}>{s}</span>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>

          <p className="text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
            Setelah menyimpan, kelola daftar pasien melalui tombol <strong>Pasien</strong> pada baris tabel.
          </p>

          <DialogFooter className="mt-1">
            <Button type="button" variant="outline" onClick={onClose} className="border-border text-foreground font-semibold">Batal</Button>
            <Button type="submit" className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold">
              {mode === "add" ? "Tambah" : "Simpan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}