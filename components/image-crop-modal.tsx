"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ZoomIn, ZoomOut, RotateCcw, Check, X } from "lucide-react"

interface ImageCropModalProps {
  open: boolean
  onClose: () => void
  imageSrc: string           // base64 atau object URL dari file yang dipilih
  onCropDone: (croppedBlob: Blob) => void
}

const MIN_ZOOM = 1
const MAX_ZOOM = 4
const OUTPUT_SIZE = 400     // output canvas px (1:1)

export function ImageCropModal({ open, onClose, imageSrc, onCropDone }: ImageCropModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const imgRef = useRef<HTMLImageElement | null>(null)
  const [imgLoaded, setImgLoaded] = useState(false)

  // Viewport state
  const [zoom, setZoom] = useState(1)
  // offset = posisi top-left gambar di dalam canvas (pixel canvas)
  const [offset, setOffset] = useState({ x: 0, y: 0 })

  // Drag state
  const dragging = useRef(false)
  const lastPos = useRef({ x: 0, y: 0 })

  // Canvas size (square, fills container)
  const [canvasSize, setCanvasSize] = useState(360)

  // ── Load image ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open || !imageSrc) return
    setImgLoaded(false)
    setZoom(1)

    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      setImgLoaded(true)
    }
    img.src = imageSrc
  }, [open, imageSrc])

  // ── Measure container ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    const measure = () => {
      if (containerRef.current) {
        const w = containerRef.current.clientWidth
        setCanvasSize(Math.min(w, 480))
      }
    }
    measure()
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [open])

  // ── Center image when loaded or zoom changes ──────────────────────────────
  const centerImage = useCallback(() => {
    const img = imgRef.current
    if (!img || canvasSize === 0) return
    const scale = zoom * Math.max(canvasSize / img.naturalWidth, canvasSize / img.naturalHeight)
    const w = img.naturalWidth * scale
    const h = img.naturalHeight * scale
    setOffset({ x: (canvasSize - w) / 2, y: (canvasSize - h) / 2 })
  }, [zoom, canvasSize])

  useEffect(() => {
    if (imgLoaded) centerImage()
  }, [imgLoaded, canvasSize, centerImage])

  // ── Clamp offset so image always covers canvas fully ──────────────────────
  const clampOffset = useCallback((ox: number, oy: number) => {
    const img = imgRef.current
    if (!img || canvasSize === 0) return { x: ox, y: oy }
    const scale = zoom * Math.max(canvasSize / img.naturalWidth, canvasSize / img.naturalHeight)
    const w = img.naturalWidth * scale
    const h = img.naturalHeight * scale
    return {
      x: Math.min(0, Math.max(canvasSize - w, ox)),
      y: Math.min(0, Math.max(canvasSize - h, oy)),
    }
  }, [zoom, canvasSize])

  // ── Draw ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img || !imgLoaded) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    canvas.width = canvasSize
    canvas.height = canvasSize

    // Background
    ctx.fillStyle = "#1a1a1a"
    ctx.fillRect(0, 0, canvasSize, canvasSize)

    // Draw image
    const scale = zoom * Math.max(canvasSize / img.naturalWidth, canvasSize / img.naturalHeight)
    const w = img.naturalWidth * scale
    const h = img.naturalHeight * scale
    ctx.drawImage(img, offset.x, offset.y, w, h)

    // Crop overlay: dark vignette outside the circle/square crop area
    // Circular clip mask
    const cx = canvasSize / 2
    const cy = canvasSize / 2
    const r = canvasSize / 2 - 4

    ctx.save()
    // Draw dark overlay over entire canvas
    ctx.fillStyle = "rgba(0,0,0,0.52)"
    ctx.fillRect(0, 0, canvasSize, canvasSize)
    // Cut out the circle (composite)
    ctx.globalCompositeOperation = "destination-out"
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    // Draw the image again inside the circle (on top)
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.clip()
    ctx.drawImage(img, offset.x, offset.y, w, h)
    ctx.restore()

    // Circle border
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.strokeStyle = "rgba(255,255,255,0.7)"
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.restore()

    // Grid lines inside circle (rule of thirds)
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.clip()
    ctx.strokeStyle = "rgba(255,255,255,0.12)"
    ctx.lineWidth = 1
    for (let i = 1; i < 3; i++) {
      const x = cx - r + (r * 2 / 3) * i
      const y = cy - r + (r * 2 / 3) * i
      ctx.beginPath(); ctx.moveTo(x, cy - r); ctx.lineTo(x, cy + r); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(cx - r, y); ctx.lineTo(cx + r, y); ctx.stroke()
    }
    ctx.restore()

  }, [imgLoaded, zoom, offset, canvasSize])

  // ── Pointer drag ──────────────────────────────────────────────────────────
  const getPos = (e: React.PointerEvent | PointerEvent) => ({
    x: e.clientX,
    y: e.clientY,
  })

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = true
    lastPos.current = getPos(e)
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return
    const pos = getPos(e)
    const dx = pos.x - lastPos.current.x
    const dy = pos.y - lastPos.current.y
    lastPos.current = pos
    setOffset((prev) => clampOffset(prev.x + dx, prev.y + dy))
  }

  const onPointerUp = () => { dragging.current = false }

  // ── Pinch-zoom (touch) ────────────────────────────────────────────────────
  const lastDist = useRef<number | null>(null)
  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length !== 2) return
    const dx = e.touches[0].clientX - e.touches[1].clientX
    const dy = e.touches[0].clientY - e.touches[1].clientY
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (lastDist.current !== null) {
      const delta = dist - lastDist.current
      setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z + delta * 0.01)))
    }
    lastDist.current = dist
  }
  const onTouchEnd = () => { lastDist.current = null }

  // ── Wheel zoom ────────────────────────────────────────────────────────────
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z - e.deltaY * 0.001)))
  }

  // ── Crop & export ─────────────────────────────────────────────────────────
  const handleCrop = () => {
    const img = imgRef.current
    if (!img || canvasSize === 0) return

    const out = document.createElement("canvas")
    out.width = OUTPUT_SIZE
    out.height = OUTPUT_SIZE
    const ctx = out.getContext("2d")
    if (!ctx) return

    // What portion of the canvas is the visible crop circle
    // crop circle: center = canvasSize/2, radius = canvasSize/2 - 4
    const r = canvasSize / 2 - 4
    const cropX = canvasSize / 2 - r
    const cropY = canvasSize / 2 - r
    const cropW = r * 2
    const cropH = r * 2

    // Scale back to image space
    const scale = zoom * Math.max(canvasSize / img.naturalWidth, canvasSize / img.naturalHeight)
    const imgX = (cropX - offset.x) / scale
    const imgY = (cropY - offset.y) / scale
    const imgW = cropW / scale
    const imgH = cropH / scale

    // Draw circular clip on output
    ctx.beginPath()
    ctx.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, 0, Math.PI * 2)
    ctx.clip()

    ctx.drawImage(img, imgX, imgY, imgW, imgH, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE)

    out.toBlob((blob) => {
      if (blob) onCropDone(blob)
    }, "image/png", 0.95)
  }

  const handleZoom = (dir: 1 | -1) => {
    setZoom((z) => {
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z + dir * 0.25))
      return next
    })
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md bg-card p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="text-foreground font-extrabold text-base flex items-center gap-2">
            Sesuaikan Foto Profil
          </DialogTitle>
          <p className="text-xs text-muted-foreground font-medium">
            Drag untuk memindahkan · Scroll / pinch untuk zoom
          </p>
        </DialogHeader>

        {/* Canvas area */}
        <div
          ref={containerRef}
          className="px-5 select-none"
        >
          <div
            className="relative rounded-2xl overflow-hidden cursor-grab active:cursor-grabbing bg-[#1a1a1a] mx-auto"
            style={{ width: canvasSize, height: canvasSize }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onWheel={onWheel}
          >
            <canvas
              ref={canvasRef}
              width={canvasSize}
              height={canvasSize}
              className="block w-full h-full"
              style={{ touchAction: "none" }}
            />
            {!imgLoaded && (
              <div className="absolute inset-0 flex items-center justify-center">
                <svg className="h-6 w-6 animate-spin text-white/50" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
              </div>
            )}
          </div>
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-3 px-5 pt-3 pb-1">
          <button
            onClick={() => handleZoom(-1)}
            disabled={zoom <= MIN_ZOOM}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-30"
          >
            <ZoomOut className="h-4 w-4" />
          </button>

          {/* Zoom slider */}
          <div className="flex-1 relative h-2 rounded-full bg-muted/60 cursor-pointer"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              const pct = (e.clientX - rect.left) / rect.width
              setZoom(MIN_ZOOM + pct * (MAX_ZOOM - MIN_ZOOM))
            }}
          >
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-primary transition-all"
              style={{ width: `${((zoom - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM)) * 100}%` }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 h-4 w-4 rounded-full bg-primary border-2 border-background shadow-md transition-all"
              style={{ left: `calc(${((zoom - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM)) * 100}% - 8px)` }}
            />
          </div>

          <button
            onClick={() => handleZoom(1)}
            disabled={zoom >= MAX_ZOOM}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-30"
          >
            <ZoomIn className="h-4 w-4" />
          </button>

          <button
            onClick={() => { setZoom(1); centerImage() }}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            title="Reset"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>

        <DialogFooter className="px-5 pb-5 pt-3 gap-2">
          <Button variant="outline" onClick={onClose} className="gap-1.5 border-border font-bold">
            <X className="h-4 w-4" /> Batal
          </Button>
          <Button
            onClick={handleCrop}
            disabled={!imgLoaded}
            className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 font-bold"
          >
            <Check className="h-4 w-4" /> Gunakan Foto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}