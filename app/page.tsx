"use client"

import { useState, useEffect } from "react"
import { LoginForm } from "@/components/login-form"
import { RegisterForm } from "@/components/register-form"
import { Dashboard } from "@/components/dashboard"

const SESSION_KEY = "dental_clinic_session"

function getTodayString(): string {
  return new Date().toISOString().split("T")[0]
}

export interface SessionData {
  loggedIn: boolean
  date: string
  email: string
  role: "admin" | "user"
}

function getStoredSession(): SessionData | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function saveSession(email: string, role: "admin" | "user") {
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ loggedIn: true, date: getTodayString(), email, role })
  )
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY)
}

type View = "login" | "register" | "dashboard"

export default function Home() {
  const [view, setView] = useState<View>("login")
  const [mounted, setMounted] = useState(false)
  const [currentUser, setCurrentUser] = useState<{ email: string; role: "admin" | "user" } | null>(null)

  useEffect(() => {
    const session = getStoredSession()
    if (session?.loggedIn && session.date === getTodayString()) {
      setCurrentUser({ email: session.email, role: session.role ?? "user" })
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
        setCurrentUser(null)
        setView("login")
      }
    }, 3_600_000)
    return () => clearInterval(interval)
  }, [view])

  const handleLogin = (email: string, role: "admin" | "user") => {
    saveSession(email, role)
    setCurrentUser({ email, role })
    setView("dashboard")
  }

  const handleLogout = () => {
    clearSession()
    setCurrentUser(null)
    setView("login")
  }

  if (!mounted) return null
  if (view === "register") return (
    <RegisterForm onBackToLogin={() => setView("login")} />
  )
  if (view === "login") return (
    <LoginForm onLogin={handleLogin} onGoRegister={() => setView("register")} />
  )
  return <Dashboard onLogout={handleLogout} currentUser={currentUser ?? { email: "", role: "user" }} />
}