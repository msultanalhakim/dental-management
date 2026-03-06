"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Eye, EyeOff, LockKeyhole, Mail } from "lucide-react"
import { verifyUserLogin } from "@/lib/supabase-queries"

interface LoginFormProps {
  onLogin: (email: string, role: "admin" | "user") => void
  onGoRegister: () => void
}

export function LoginForm({ onLogin, onGoRegister }: LoginFormProps) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const result = await verifyUserLogin(email, password)
      if (result.status === "ok") {
        onLogin(email, result.role)
      } else if (result.status === "pending") {
        setError("Akun Anda masih menunggu persetujuan admin.")
      } else if (result.status === "rejected") {
        setError("Pendaftaran Anda ditolak. Hubungi admin untuk info lebih lanjut.")
      } else {
        setError("Email atau password salah. Silakan coba lagi.")
      }
    } catch {
      setError("Gagal terhubung ke server. Periksa koneksi Anda.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        {/* Logo & branding */}
        <div className="mb-8 flex flex-col items-center">
          <img src="/logo.png" alt="Logo" className="mb-4 h-32 w-32 object-contain" />
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
            Klinik Gigi
          </h1>
          <p className="mt-1 text-sm font-medium text-muted-foreground">
            Sistem Manajemen Pasien
          </p>
        </div>

        {/* Login card */}
        <div className="rounded-2xl border border-border/50 bg-card p-7 shadow-sm">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email" className="text-sm font-semibold text-foreground">
                Email
              </Label>
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
                  autoFocus
                />
              </div>
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password" className="text-sm font-semibold text-foreground">
                Password
              </Label>
              <div className="relative">
                <LockKeyhole className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Masukkan password"
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
                  aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
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
              disabled={loading || !email || !password}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Memproses...
                </span>
              ) : "Masuk"}
            </Button>
          </form>
        </div>

        <p className="mt-5 text-center text-sm text-muted-foreground">
          Belum punya akun?{" "}
          <button
            onClick={onGoRegister}
            className="font-semibold text-primary hover:underline"
          >
            Daftar sekarang
          </button>
        </p>
      </div>
    </div>
  )
}