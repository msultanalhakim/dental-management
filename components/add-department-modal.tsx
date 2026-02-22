"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"

interface AddDepartmentModalProps {
  open: boolean
  onClose: () => void
  onAdd: (name: string, hasSubDepartments: boolean) => void
}

export function AddDepartmentModal({
  open,
  onClose,
  onAdd,
}: AddDepartmentModalProps) {
  const [name, setName] = useState("")
  const [hasSub, setHasSub] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim()) {
      onAdd(name.trim(), hasSub)
      setName("")
      setHasSub(false)
      onClose()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md bg-card">
        <DialogHeader>
          <DialogTitle className="text-foreground text-lg font-bold">Tambah Departemen Baru</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="deptName" className="text-sm font-bold text-foreground">
              Nama Departemen
            </Label>
            <Input
              id="deptName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Pedodonsia"
              className="bg-background h-10 font-medium"
              required
              autoFocus
            />
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-border/60 px-4 py-3 bg-muted/20">
            <Checkbox
              id="hasSub"
              checked={hasSub}
              onCheckedChange={(checked) => setHasSub(checked === true)}
            />
            <Label htmlFor="hasSub" className="text-sm font-bold text-foreground cursor-pointer">
              Memiliki sub-departemen
            </Label>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="border-border text-foreground font-bold"
            >
              Batal
            </Button>
            <Button
              type="submit"
              className="bg-primary text-primary-foreground hover:bg-primary/90 font-bold"
            >
              Tambah
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
