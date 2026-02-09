'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Users, Clock, CalendarCheck, CalendarDays, AlertCircle } from 'lucide-react'

export default function DashboardPage() {
  const [todayData, setTodayData] = useState<any[]>([])
  const [upcomingHoliday, setUpcomingHoliday] = useState<any>(null) // State untuk Libur
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
      // 1. Fetch Absensi Hari Ini
      const { data: attendance } = await supabase
        .from('attendance')
        .select('*')
        .eq('date', today)
        .order('check_in', { ascending: false })
      
      if (attendance) setTodayData(attendance)

      // 2. Fetch Hari Libur Berikutnya (Cuma ambil 1 yang terdekat setelah hari ini)
      const { data: holiday } = await supabase
        .from('libur_nasional')
        .select('*')
        .gte('tanggal', today) // Ambil yang tanggalnya >= hari ini
        .order('tanggal', { ascending: true })
        .limit(1) // Cuma butuh 1
        .single()
      
      if (holiday) setUpcomingHoliday(holiday)

      setLoading(false)
    }
    fetchData()
  }, [today])

  // Helper Format Tanggal Indonesia
  const formatTglIndo = (tgl: string) => {
    return new Date(tgl).toLocaleDateString('id-ID', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    })
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="mb-6 flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Dashboard</h2>
          <p className="text-slate-500">Ringkasan aktivitas hari ini ({new Date().toLocaleDateString('id-ID', { dateStyle: 'full' })}).</p>
        </div>
      </div>

      {/* STATS CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4"> {/* Ubah jadi 4 kolom */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-center gap-4">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-lg"><Users size={24}/></div>
            <div><p className="text-xs font-bold text-slate-400 uppercase">Hadir</p><h3 className="text-2xl font-bold text-slate-700">{todayData.length}</h3></div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-center gap-4">
            <div className="p-3 bg-green-50 text-green-600 rounded-lg"><Clock size={24}/></div>
            <div><p className="text-xs font-bold text-slate-400 uppercase">Tepat Waktu</p><h3 className="text-2xl font-bold text-slate-700">{todayData.length}</h3></div> 
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-center gap-4">
            <div className="p-3 bg-purple-50 text-purple-600 rounded-lg"><CalendarCheck size={24}/></div>
            <div><p className="text-xs font-bold text-slate-400 uppercase">Lengkap (Out)</p><h3 className="text-2xl font-bold text-slate-700">{todayData.filter(x => x.check_out).length}</h3></div>
        </div>

        {/* CARD INFO LIBUR (BARU) */}
        <div className={`p-6 rounded-xl shadow-sm border flex flex-col justify-center relative overflow-hidden
          ${upcomingHoliday 
            ? 'bg-amber-50 border-amber-100' 
            : 'bg-white border-slate-100'
          }`}>
            {upcomingHoliday ? (
              <>
                <div className="flex items-center gap-2 text-amber-600 mb-1">
                  <CalendarDays size={18} />
                  <span className="text-xs font-bold uppercase tracking-wider">Libur Berikutnya</span>
                </div>
                <h4 className="text-sm font-bold text-slate-700 line-clamp-1" title={upcomingHoliday.keterangan}>
                  {upcomingHoliday.keterangan}
                </h4>
                <p className="text-xs text-slate-500 mt-1">
                  {formatTglIndo(upcomingHoliday.tanggal)}
                </p>
                {/* Visual Hiasan */}
                <div className="absolute -right-2 -bottom-4 opacity-10 text-amber-600">
                  <CalendarDays size={64} />
                </div>
              </>
            ) : (
              <div className="flex items-center gap-3 text-slate-400">
                <div className="p-2 bg-slate-100 rounded-lg"><CalendarDays size={20}/></div>
                <span className="text-xs font-medium">Tidak ada jadwal libur dekat.</span>
              </div>
            )}
        </div>
      </div>

      {/* SIMPLE TABLE */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
        <h3 className="font-bold text-lg mb-4 text-slate-700 flex items-center gap-2">
           <div className="w-2 h-6 bg-blue-600 rounded-full"></div>
           Realtime Attendance
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 uppercase text-xs border-b border-slate-100">
              <tr>
                <th className="px-4 py-3 font-semibold">Nama Karyawan</th>
                <th className="px-4 py-3 font-semibold text-center">Masuk</th>
                <th className="px-4 py-3 font-semibold text-center">Pulang</th>
                <th className="px-4 py-3 font-semibold text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                 <tr><td colSpan={4} className="p-8 text-center text-slate-400 animate-pulse">Memuat data presensi...</td></tr> 
              ) : todayData.length === 0 ? (
                 <tr>
                   <td colSpan={4} className="p-8 text-center">
                     <div className="flex flex-col items-center justify-center text-slate-400 gap-2">
                       <AlertCircle size={32} strokeWidth={1.5} />
                       <p>Belum ada yang absen hari ini.</p>
                     </div>
                   </td>
                 </tr>
              ) : (
               todayData.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/50 transition">
                  <td className="px-4 py-3 font-medium text-slate-700">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">
                        {(row.user_name || row.user_email || 'U').substring(0,2).toUpperCase()}
                      </div>
                      <div className="flex flex-col">
                        <span>{row.user_name || row.user_email}</span>
                        <span className="text-[10px] text-slate-400 font-normal">ID: {row.id}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="bg-green-50 text-green-700 px-2 py-1 rounded text-xs font-mono font-medium">
                      {new Date(row.check_in).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'})}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {row.check_out ? (
                      <span className="bg-amber-50 text-amber-700 px-2 py-1 rounded text-xs font-mono font-medium">
                        {new Date(row.check_out).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'})}
                      </span>
                    ) : (
                      <span className="text-slate-300 font-mono">--:--</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {row.check_out ? (
                      <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border border-green-200">
                        Selesai
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-600 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border border-blue-100 animate-pulse">
                        <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span> Kerja
                      </span>
                    )}
                  </td>
                </tr>
              )))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}