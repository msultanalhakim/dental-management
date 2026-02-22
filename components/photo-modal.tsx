"use client"

import { useRef, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ImagePlus, Trash2, ChevronLeft, ChevronRight, X, AlertCircle } from "lucide-react"
import type { Photo } from "@/lib/types"

const MAX_FILE_SIZE_MB = 5
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

interface PhotoModalProps {
  open: boolean
  onClose: () => void
  photos: Photo[]
  onAddPhoto: (base64: string) => Promise<void>
  onRemovePhoto: (index: number) => Promise<void>
  patientName: string
  requirement: string
}

export function PhotoModal({
  open,
  onClose,
  photos,
  onAddPhoto,
  onRemovePhoto,
  patientName,
  requirement,
}: PhotoModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [viewingIndex, setViewingIndex] = useState<number | null>(null)
  const [uploading, setUploading] = useState(false)
  const [removing, setRemoving] = useState<number | null>(null)
  const [sizeError, setSizeError] = useState("")

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setSizeError("")

    // Client-side 5MB guard
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setSizeError(`Ukuran foto melebihi batas ${MAX_FILE_SIZE_MB} MB (${(file.size / 1024 / 1024).toFixed(1)} MB). Harap pilih foto yang lebih kecil.`)
      e.target.value = ""
      return
    }

    setUploading(true)
    const reader = new FileReader()
    reader.onloadend = async () => {
      try {
        await onAddPhoto(reader.result as string)
      } catch (err: unknown) {
        if (err instanceof Error) setSizeError(err.message)
        else setSizeError("Gagal mengunggah foto")
      } finally {
        setUploading(false)
      }
    }
    reader.readAsDataURL(file)
    e.target.value = ""
  }

  const handleRemove = async (e: React.MouseEvent, index: number) => {
    e.stopPropagation()
    setRemoving(index)
    try {
      await onRemovePhoto(index)
      if (viewingIndex === index) setViewingIndex(null)
    } finally {
      setRemoving(null)
    }
  }

  const triggerFileInput = () => {
    setSizeError("")
    fileInputRef.current?.click()
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-3xl bg-card max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground text-lg font-bold">Detail Foto</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {requirement}{patientName ? ` — ${patientName}` : ""}
            </p>
          </DialogHeader>

          {/* File size error */}
          {sizeError && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5">
              <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm font-medium text-destructive">{sizeError}</p>
            </div>
          )}

          <div className="flex flex-col gap-4">
            {photos.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border/60 bg-muted/10 py-16">
                <ImagePlus className="mb-3 h-12 w-12 text-muted-foreground/40" />
                <p className="text-sm font-medium text-muted-foreground mb-1">Belum ada foto</p>
                <p className="text-xs text-muted-foreground/60 mb-4">Maks. {MAX_FILE_SIZE_MB} MB per foto</p>
                <Button onClick={triggerFileInput} disabled={uploading} className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold">
                  <ImagePlus className="mr-2 h-4 w-4" />
                  {uploading ? "Mengunggah..." : "Tambah Foto"}
                </Button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {photos.map((photo, index) => (
                    <div
                      key={photo.id}
                      className="group relative aspect-square cursor-pointer overflow-hidden rounded-xl border border-border/50 bg-muted/10 shadow-sm"
                      onClick={() => setViewingIndex(index)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setViewingIndex(index) }}
                    >
                      <img src={photo.url} alt={`Foto ${index + 1}`} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                      <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/10 transition-colors" />
                      <button
                        onClick={(e) => handleRemove(e, index)}
                        disabled={removing === index}
                        className="absolute top-2 right-2 rounded-full bg-foreground/70 p-1.5 text-background opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive disabled:opacity-40"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">Maks. {MAX_FILE_SIZE_MB} MB per foto</p>
                  <Button onClick={triggerFileInput} disabled={uploading} variant="outline" className="border-border text-foreground font-semibold">
                    <ImagePlus className="mr-2 h-4 w-4" />
                    {uploading ? "Mengunggah..." : "Tambah Foto Lainnya"}
                  </Button>
                </div>
              </>
            )}
          </div>

          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
        </DialogContent>
      </Dialog>

      {/* Full-screen viewer */}
      {viewingIndex !== null && photos[viewingIndex] && (
        <Dialog open={true} onOpenChange={() => setViewingIndex(null)}>
          <DialogContent className="sm:max-w-5xl bg-foreground/95 border-none p-2" showCloseButton={false}>
            <DialogTitle className="sr-only">
              Lihat Foto {viewingIndex !== null ? viewingIndex + 1 : ""}
            </DialogTitle>
            <div className="relative flex items-center justify-center min-h-[65vh]">
              <button onClick={() => setViewingIndex(null)} className="absolute top-3 right-3 z-10 rounded-full bg-background/20 p-2.5 text-background hover:bg-background/40 transition-colors">
                <X className="h-5 w-5" />
              </button>
              {photos.length > 1 && (
                <>
                  <button onClick={() => setViewingIndex(viewingIndex === 0 ? photos.length - 1 : viewingIndex - 1)} className="absolute left-3 z-10 rounded-full bg-background/20 p-2.5 text-background hover:bg-background/40 transition-colors">
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button onClick={() => setViewingIndex(viewingIndex === photos.length - 1 ? 0 : viewingIndex + 1)} className="absolute right-3 z-10 rounded-full bg-background/20 p-2.5 text-background hover:bg-background/40 transition-colors">
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              )}
              <img src={photos[viewingIndex].url} alt={`Foto ${viewingIndex + 1}`} className="max-h-[80vh] max-w-full rounded-xl object-contain" />
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-background/25 px-4 py-1.5 text-sm font-semibold text-background">
                {viewingIndex + 1} / {photos.length}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}