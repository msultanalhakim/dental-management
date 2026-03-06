"use client"

import { useState, useEffect } from "react"
import { LoginForm } from "@/components/login-form"
import { RegisterForm } from "@/components/register-form"
import { Dashboard } from "@/components/dashboard"

const SESSION_KEY = "dental_clinic_session"

function getTodayString(): string {
  return new Date().toISOString().split("T")[0]
}

function getStoredSession(): { loggedIn: boolean; date: string; email?: string } | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function saveSession(email: string) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ loggedIn: true, date: getTodayString(), email }))
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY)
}

type View = "login" | "register" | "dashboard"

export default function Home() {
  const [view, setView] = useState<View>("login")
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const session = getStoredSession()
    if (session?.loggedIn && session.date === getTodayString()) {
      setView("dashboard")
    } else if (session?.loggedIn) {
      clearSession()
    }
    setMounted(true)
  }, [])

  useEffect(() => {
    if (view !== "dashboard") return
    const interval = setInterval(() => {
      const session = getStoredSession()
      if (session && session.date !== getTodayString()) {
        clearSession()
        setView("login")
      }
    }, 3_600_000)
    return () => clearInterval(interval)
  }, [view])

  const handleLogin = (email: string) => {
    saveSession(email)
    setView("dashboard")
  }

  const handleLogout = () => {
    clearSession()
    setView("login")
  }

  if (!mounted) return null
  if (view === "register") return (
    <RegisterForm onBackToLogin={() => setView("login")} />
  )
  if (view === "login") return (
    <LoginForm onLogin={handleLogin} onGoRegister={() => setView("register")} />
  )
  return <Dashboard onLogout={handleLogout} />
}