'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Users, Clock, CalendarCheck } from 'lucide-react'

export default function DashboardPage() {
  const [todayData, setTodayData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  // --- FIX TANGGAL (WIB) ---
  const today = (() => {
    const d = new Date()
    const local = new Date(d.getTime() - (d.getTimezoneOffset() * 60000))
    return local.toISOString().split('T')[0]
  })()
  // -------------------------

  useEffect(() => {
    const fetchData = async () => {
      const { data } = await supabase.from('attendance').select('*').eq('date', today).order('check_in', { ascending: false })
      if (data) setTodayData(data)
      setLoading(false)
    }
    fetchData()
  }, [today])

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-800">Dashboard</h2>
        <p className="text-slate-500">Ringkasan aktivitas hari ini ({new Date().toLocaleDateString('id-ID', { dateStyle: 'full' })}).</p>
      </div>

      {/* STATS CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-center gap-4">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-lg"><Users size={24}/></div>
            <div><p className="text-sm text-slate-500">Total Hadir</p><h3 className="text-2xl font-bold">{todayData.length}</h3></div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-center gap-4">
            <div className="p-3 bg-green-50 text-green-600 rounded-lg"><Clock size={24}/></div>
            <div><p className="text-sm text-slate-500">Datang Tepat Waktu</p><h3 className="text-2xl font-bold">{todayData.length}</h3></div> 
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-center gap-4">
            <div className="p-3 bg-purple-50 text-purple-600 rounded-lg"><CalendarCheck size={24}/></div>
            <div><p className="text-sm text-slate-500">Lengkap (In/Out)</p><h3 className="text-2xl font-bold">{todayData.filter(x => x.check_out).length}</h3></div>
        </div>
      </div>

      {/* SIMPLE TABLE */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
        <h3 className="font-bold text-lg mb-4">Realtime Attendance</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 uppercase text-xs">
              <tr>
                <th className="px-4 py-3">Nama</th>
                <th className="px-4 py-3">Masuk</th>
                <th className="px-4 py-3">Pulang</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <tr><td colSpan={4} className="p-4 text-center">Loading...</td></tr> : 
               todayData.length === 0 ? <tr><td colSpan={4} className="p-4 text-center text-slate-400">Belum ada yang absen hari ini.</td></tr> :
               todayData.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 font-medium">{row.user_name || row.user_email}</td>
                  <td className="px-4 py-3 text-green-600">{new Date(row.check_in).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'})}</td>
                  <td className="px-4 py-3 text-red-600">{row.check_out ? new Date(row.check_out).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'}) : '-'}</td>
                  <td className="px-4 py-3">{row.check_out ? <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full text-xs font-bold">Selesai</span> : <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-full text-xs font-bold animate-pulse">Kerja</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}