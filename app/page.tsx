'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    
    if (error) {
      alert("Login Gagal: " + error.message)
    } else {
      // 🛡️ LOGIKA REDIRECT YANG LEBIH KUAT
      // Cek apakah email mengandung kata 'admin'
      if (email.toLowerCase().includes('admin')) {
        console.log("User adalah Admin -> Ke Dashboard")
        router.push('/admin/dashboard')
      } else {
        console.log("User adalah Staff -> Ke Scan")
        router.push('/scan')
      }
    }
    setLoading(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4 font-sans">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-2xl border border-gray-100">
        <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-800">Presensi SDM</h1>
            <p className="text-gray-500 text-sm">Silakan masuk dengan akun Anda</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-gray-600 mb-1">Email Kampus</label>
            <input 
              name="email" id="email" type="email" placeholder="nama@kampus.ac.id" required 
              className="w-full rounded-lg border border-gray-300 p-3 text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none transition"
              value={email} onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-600 mb-1">Password</label>
            <input 
              name="password" id="password" type="password" placeholder="••••••••" required 
              className="w-full rounded-lg border border-gray-300 p-3 text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none transition"
              value={password} onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button 
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 py-3 text-white font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-600/30 disabled:opacity-50"
          >
            {loading ? 'Memproses...' : 'Masuk Sistem'}
          </button>
        </form>
      </div>
    </div>
  )
}