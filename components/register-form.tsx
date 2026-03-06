"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Eye, EyeOff, LockKeyhole, User, Mail, CheckCircle2 } from "lucide-react"
import { registerUser } from "@/lib/supabase-queries"

interface RegisterFormProps {
  onBackToLogin: () => void
}

export function RegisterForm({ onBackToLogin }: RegisterFormProps) {
  const [nama, setNama] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (password.length < 6) {
      setError("Password minimal 6 karakter.")
      return
    }
    if (password !== confirmPassword) {
      setError("Konfirmasi password tidak cocok.")
      return
    }

    setLoading(true)
    try {
      const ok = await registerUser({ nama, email, password })
      if (ok) {
        setSuccess(true)
      } else {
        setError("Email sudah terdaftar atau terjadi kesalahan. Coba lagi.")
      }
    } catch {
      setError("Gagal terhubung ke server. Periksa koneksi Anda.")
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm text-center">
          <div className="mb-8 flex flex-col items-center">
            <img src="/logo.png" alt="Logo" className="mb-4 h-32 w-32 object-contain" />
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground">Klinik Gigi</h1>
            <p className="mt-1 text-sm font-medium text-muted-foreground">Sistem Manajemen Pasien</p>
          </div>

          <div className="rounded-2xl border border-border/50 bg-card p-8 shadow-sm flex flex-col items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-9 w-9 text-green-600" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-foreground">Pendaftaran Berhasil!</h2>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                Akun Anda sedang menunggu persetujuan admin. Anda akan bisa login setelah admin menyetujui pendaftaran Anda.
              </p>
            </div>
            <div className="w-full rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-left">
              <p className="text-xs font-bold text-amber-700">⏳ Status: Menunggu Persetujuan</p>
              <p className="text-xs text-amber-600 mt-0.5">Hubungi admin jika membutuhkan akses segera.</p>
            </div>
            <Button
              onClick={onBackToLogin}
              variant="outline"
              className="w-full font-semibold border-border text-foreground"
            >
              Kembali ke Login
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-sm">
        {/* Logo & branding */}
        <div className="mb-8 flex flex-col items-center">
          <img src="/logo.png" alt="Logo" className="mb-4 h-32 w-32 object-contain" />
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground">Klinik Gigi</h1>
          <p className="mt-1 text-sm font-medium text-muted-foreground">Daftar Akun Baru</p>
        </div>

        {/* Register card */}
        <div className="rounded-2xl border border-border/50 bg-card p-7 shadow-sm">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Nama */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nama" className="text-sm font-semibold text-foreground">Nama Lengkap</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="nama"
                  type="text"
                  placeholder="Nama lengkap Anda"
                  value={nama}
                  onChange={(e) => setNama(e.target.value)}
                  className="bg-background pl-9 h-11"
                  required
                  autoFocus
                />
              </div>
            </div>

            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email" className="text-sm font-semibold text-foreground">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="email"
                  type="email"
                  placeholder="email@contoh.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-background pl-9 h-11"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reg-password" className="text-sm font-semibold text-foreground">Password</Label>
              <div className="relative">
                <LockKeyhole className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="reg-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Minimal 6 karakter"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-background pl-9 pr-10 h-11"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirm-password" className="text-sm font-semibold text-foreground">Konfirmasi Password</Label>
              <div className="relative">
                <LockKeyhole className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="confirm-password"
                  type={showConfirm ? "text" : "password"}
                  placeholder="Ulangi password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="bg-background pl-9 pr-10 h-11"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-sm font-medium text-destructive bg-destructive/10 px-3 py-2.5 rounded-lg">
                {error}
              </p>
            )}

            <Button
              type="submit"
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-11 font-semibold mt-1"
              disabled={loading || !nama || !email || !password || !confirmPassword}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Mendaftar...
                </span>
              ) : "Daftar"}
            </Button>
          </form>
        </div>

        <p className="mt-5 text-center text-sm text-muted-foreground">
          Sudah punya akun?{" "}
          <button
            onClick={onBackToLogin}
            className="font-semibold text-primary hover:underline"
          >
            Masuk di sini
          </button>
        </p>
      </div>
    </div>
  )
}