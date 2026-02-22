"use client"

import { useState, useEffect } from "react"
import { LoginForm } from "@/components/login-form"
import { Dashboard } from "@/components/dashboard"

const SESSION_KEY = "dental_clinic_session"

function getTodayString(): string {
  return new Date().toISOString().split("T")[0]
}

function getStoredSession(): { loggedIn: boolean; date: string } | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function saveSession() {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ loggedIn: true, date: getTodayString() }))
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY)
}

export default function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const session = getStoredSession()
    if (session?.loggedIn && session.date === getTodayString()) {
      setIsLoggedIn(true)
    } else if (session?.loggedIn) {
      clearSession() // expired — different day
    }
    setMounted(true)
  }, [])

  // Hourly check for day rollover (less overhead, still reliable for morning use)
  useEffect(() => {
    if (!isLoggedIn) return
    const interval = setInterval(() => {
      const session = getStoredSession()
      if (session && session.date !== getTodayString()) {
        clearSession()
        setIsLoggedIn(false)
      }
    }, 3_600_000) // every 1 hour
    return () => clearInterval(interval)
  }, [isLoggedIn])

  const handleLogin = () => { saveSession(); setIsLoggedIn(true) }
  const handleLogout = () => { clearSession(); setIsLoggedIn(false) }

  if (!mounted) return null
  if (!isLoggedIn) return <LoginForm onLogin={handleLogin} />
  return <Dashboard onLogout={handleLogout} />
}