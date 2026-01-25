'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, FileText, QrCode, LogOut, Menu, X, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setSidebarOpen] = useState(true)
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const menuItems = [
    { name: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
    { name: 'Rekap & Laporan', href: '/admin/rekap', icon: FileText },
    { name: 'Kelola Staff', href: '/admin/staff', icon: Users }, // <-- MENU BARU
    { name: 'QR Generator', href: '/admin/qr', icon: QrCode },
  ]

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans text-slate-800">
      
      {/* SIDEBAR */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 text-white transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0 shadow-xl`}>
        <div className="p-6 border-b border-slate-700 flex justify-between items-center">
          <h1 className="text-xl font-bold tracking-wider">SDM <span className="text-blue-400">ADMIN</span></h1>
          <button onClick={() => setSidebarOpen(false)} className="md:hidden text-slate-400"><X size={24}/></button>
        </div>

        <nav className="p-4 space-y-2 mt-4">
          {menuItems.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link key={item.href} href={item.href} className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${isActive ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
                <item.icon size={20} />
                <span className="font-medium">{item.name}</span>
              </Link>
            )
          })}
        </nav>

        <div className="absolute bottom-0 w-full p-4 border-t border-slate-700">
          <button onClick={handleLogout} className="flex items-center gap-3 px-4 py-3 w-full text-red-400 hover:bg-slate-800 rounded-lg transition">
            <LogOut size={20} />
            <span className="font-medium">Keluar</span>
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT WRAPPER */}
      <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
        {/* MOBILE HEADER */}
        <header className="bg-white border-b p-4 md:hidden flex justify-between items-center shadow-sm z-40">
           <span className="font-bold">Admin Panel</span>
           <button onClick={() => setSidebarOpen(true)} className="text-slate-600"><Menu size={24}/></button>
        </header>

        {/* PAGE CONTENT */}
        <main className="flex-1 overflow-auto p-4 md:p-8">
          {children}
        </main>
      </div>
    </div>
  )
}