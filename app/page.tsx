"use client"

import { useState, useEffect } from "react"
import { LoginForm } from "@/components/login-form"
import { RegisterForm } from "@/components/register-form"
import { Dashboard } from "@/components/dashboard"
import { supabase } from "@/lib/supabase"

// ─── Session helpers (Supabase app_settings, key = "session:<email>") ─────────

interface SessionData {
  loggedIn: boolean
  date: string
  email: string
  role: "admin" | "user"
  canUploadPhoto: boolean
}

function getTodayString(): string {
  return new Date().toISOString().split("T")[0]
}

async function saveSession(
  email: string,
  role: "admin" | "user",
  canUploadPhoto: boolean
): Promise<void> {
  const payload: SessionData = {
    loggedIn: true,
    date: getTodayString(),
    email,
    role,
    canUploadPhoto,
  }
  await supabase
    .from("app_settings")
    .upsert({ key: `session:${email}`, value: JSON.stringify(payload) })
}

async function getSession(email: string): Promise<SessionData | null> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", `session:${email}`)
    .maybeSingle()
  if (!data?.value) return null
  try {
    return JSON.parse(data.value) as SessionData
  } catch {
    return null
  }
}

async function clearSession(email: string): Promise<void> {
  await supabase
    .from("app_settings")
    .delete()
    .eq("key", `session:${email}`)
}

// sessionStorage hanya menyimpan email (bukan data sensitif) sebagai referensi
// untuk tahu key Supabase mana yang harus di-fetch saat mount.
// sessionStorage otomatis terhapus saat tab/browser ditutup.
const LAST_EMAIL_KEY = "dental_last_email"

function getLastEmail(): string | null {
  if (typeof window === "undefined") return null
  try { return sessionStorage.getItem(LAST_EMAIL_KEY) } catch { return null }
}
function setLastEmail(email: string) {
  try { sessionStorage.setItem(LAST_EMAIL_KEY, email) } catch { /* ignore */ }
}
function removeLastEmail() {
  try { sessionStorage.removeItem(LAST_EMAIL_KEY) } catch { /* ignore */ }
}

// ─── Component ─────────────────────────────────────────────────────────────────

type View = "login" | "register" | "dashboard"

export default function Home() {
  const [view, setView] = useState<View>("login")
  const [mounted, setMounted] = useState(false)
  const [currentUser, setCurrentUser] = useState<{
    email: string
    role: "admin" | "user"
    canUploadPhoto: boolean
  } | null>(null)

  useEffect(() => {
    async function restoreSession() {
      const email = getLastEmail()
      if (!email) { setMounted(true); return }

      const session = await getSession(email)
      if (session?.loggedIn && session.date === getTodayString() && session.email) {
        setCurrentUser({
          email: session.email,
          role: session.role ?? "user",
          canUploadPhoto: session.canUploadPhoto ?? true,
        })
        setView("dashboard")
      } else if (session) {
        await clearSession(email)
        removeLastEmail()
      }
      setMounted(true)
    }
    restoreSession()
  }, [])

  useEffect(() => {
    if (view !== "dashboard" || !currentUser) return
    const interval = setInterval(async () => {
      const session = await getSession(currentUser.email)
      if (session && session.date !== getTodayString()) {
        await clearSession(currentUser.email)
        removeLastEmail()
        setCurrentUser(null)
        setView("login")
      }
    }, 3_600_000)
    return () => clearInterval(interval)
  }, [view, currentUser])

  const handleLogin = async (
    email: string,
    role: "admin" | "user",
    canUploadPhoto: boolean
  ) => {
    await saveSession(email, role, canUploadPhoto)
    setLastEmail(email)
    setCurrentUser({ email, role, canUploadPhoto })
    setView("dashboard")
  }

  const handleLogout = async () => {
    if (currentUser) {
      await clearSession(currentUser.email)
    }
    removeLastEmail()
    setCurrentUser(null)
    setView("login")
  }

  if (!mounted) return null
  if (view === "register") return <RegisterForm onBackToLogin={() => setView("login")} />
  if (view === "login") return <LoginForm onLogin={handleLogin} onGoRegister={() => setView("register")} />
  return (
    <Dashboard
      onLogout={handleLogout}
      currentUser={currentUser ?? { email: "", role: "user", canUploadPhoto: true }}
    />
  )
}