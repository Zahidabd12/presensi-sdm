'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase' 
import { 
  Calendar, Save, Trash2, 
  AlertCircle, CheckCircle, Info, X, CalendarDays 
} from 'lucide-react'

// Interface Data
type Libur = {
  id: number
  tanggal: string
  keterangan: string
}

export default function AdminLiburPage() {
  const [loading, setLoading] = useState(false)
  const [listLibur, setListLibur] = useState<Libur[]>([])
  
  // State Toast Manual
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null)

  // State Form
  const [form, setForm] = useState({
    dariTanggal: '',
    sampaiTanggal: '',
    keterangan: ''
  })

  const supabase = createClient()

  // 1. Fetch Data saat Load
  useEffect(() => {
    fetchLibur()
  }, [])

  const fetchLibur = async () => {
    const { data, error } = await supabase
      .from('libur_nasional') 
      .select('*')
      .order('tanggal', { ascending: true })
    
    if (data) setListLibur(data)
    if (error) console.error('Error fetch:', error)
  }

  // Helper Toast
  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  // 2. Logic "Pintar" Generator Tanggal
  const getDatesInRange = (startDate: string, endDate: string) => {
    const dates = []
    const current = new Date(startDate)
    const end = new Date(endDate)

    while (current <= end) {
      dates.push(new Date(current).toISOString().split('T')[0])
      current.setDate(current.getDate() + 1)
    }
    return dates
  }

  // 3. Handle Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      let dataToInsert = []

      // LOGIC: Single Day vs Bulk Insert
      if (!form.sampaiTanggal) {
        dataToInsert.push({
          tanggal: form.dariTanggal,
          keterangan: form.keterangan
        })
      } else {
        const dateRange = getDatesInRange(form.dariTanggal, form.sampaiTanggal)
        dataToInsert = dateRange.map(tgl => ({
          tanggal: tgl,
          keterangan: form.keterangan
        }))
      }

      // Eksekusi ke Supabase
      const { error } = await supabase
        .from('libur_nasional')
        .insert(dataToInsert)

      if (error) {
        if (error.code === '23505') throw new Error('Tanggal tersebut sudah ada di database!')
        throw error
      }

      showToast(`Sukses! ${dataToInsert.length} hari libur ditambahkan.`, 'success')
      
      // Reset Form & Refresh Table
      setForm({ dariTanggal: '', sampaiTanggal: '', keterangan: '' })
      fetchLibur()

    } catch (error: any) {
      showToast(error.message || 'Gagal menyimpan data.', 'error')
    } finally {
      setLoading(false)
    }
  }

  // 4. Handle Delete
  const handleDelete = async (id: number) => {
    if (!confirm('Yakin ingin menghapus hari libur ini?')) return

    const { error } = await supabase.from('libur_nasional').delete().eq('id', id)
    if (!error) {
      showToast('Data berhasil dihapus', 'success')
      fetchLibur()
    } else {
      showToast('Gagal menghapus data', 'error')
    }
  }

  // Helper Format Tanggal Indo
  const formatTgl = (tgl: string) => {
    return new Date(tgl).toLocaleDateString('id-ID', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
    })
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-10">
      
      {/* TOAST NOTIFIKASI */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-6 py-4 rounded-xl shadow-xl flex items-center gap-3 animate-in slide-in-from-bottom-5 border-l-8 ${
            toast.type === 'success' 
            ? 'bg-white text-slate-800 border-green-500' 
            : 'bg-white text-slate-800 border-red-500'
        }`}>
            {toast.type === 'success' ? <CheckCircle size={20} className="text-green-500"/> : <AlertCircle size={20} className="text-red-500"/>}
            <span className="font-bold text-sm">{toast.message}</span>
        </div>
      )}

      {/* HEADER PAGE */}
      <div className="flex flex-col md:flex-row justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-100 gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
             <Calendar className="text-blue-600"/> Kelola Hari Libur
          </h2>
          <p className="text-slate-500 text-sm">Input tanggal merah agar karyawan tidak dianggap Alpha.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
        {/* KOLOM KIRI: FORM INPUT */}
        <div className="lg:col-span-1 space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm sticky top-6">
              <h2 className="text-lg font-bold mb-6 flex items-center gap-2 text-slate-700 border-b pb-4">
                <Info size={18} className="text-blue-500"/> Form Input
              </h2>

              <form onSubmit={handleSubmit} className="space-y-5">
                
                {/* Dari Tanggal */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Dari Tanggal</label>
                  <div className="relative">
                    <CalendarDays className="absolute left-3 top-3 text-slate-400" size={18}/>
                    <input
                        type="date"
                        required
                        value={form.dariTanggal}
                        onChange={e => setForm({...form, dariTanggal: e.target.value})}
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-slate-700 font-medium transition"
                    />
                  </div>
                </div>

                {/* Sampai Tanggal */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex justify-between">
                    Sampai Tanggal 
                    <span className="text-[10px] text-slate-400 font-normal lowercase">(opsional / 1 hari saja)</span>
                  </label>
                  <div className="relative">
                    <CalendarDays className="absolute left-3 top-3 text-slate-400" size={18}/>
                    <input
                        type="date"
                        min={form.dariTanggal}
                        value={form.sampaiTanggal}
                        onChange={e => setForm({...form, sampaiTanggal: e.target.value})}
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-slate-700 font-medium transition disabled:opacity-50"
                    />
                  </div>
                  {form.sampaiTanggal && (
                    <p className="text-xs text-blue-600 mt-2 bg-blue-50 p-2 rounded-lg font-medium flex items-center gap-1">
                      <Info size={12}/> Mode Rentang Tanggal Aktif
                    </p>
                  )}
                </div>

                {/* Keterangan */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Keterangan</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Cuti Bersama Idul Fitri"
                    value={form.keterangan}
                    onChange={e => setForm({...form, keterangan: e.target.value})}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-slate-700 font-medium transition"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 transition active:scale-95 mt-4"
                >
                  {loading ? 'Menyimpan...' : (
                    <> <Save size={18} /> Simpan Jadwal </>
                  )}
                </button>
              </form>
            </div>
        </div>

        {/* KOLOM KANAN: LIST DATA */}
        <div className="lg:col-span-2">
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm h-full min-h-[500px] flex flex-col">
              <div className="flex justify-between items-center mb-6 border-b pb-4">
                <h2 className="text-lg font-bold text-slate-700 flex items-center gap-2">
                    <CheckCircle size={18} className="text-emerald-500"/> Daftar Libur
                </h2>
                <span className="text-xs font-bold bg-slate-100 px-3 py-1 rounded-full text-slate-500">
                    Total: {listLibur.length}
                </span>
              </div>
              
              <div className="flex-1 overflow-y-auto max-h-[600px] pr-2 custom-scrollbar">
                {listLibur.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-60 text-slate-400 space-y-3 border-2 border-dashed border-slate-100 rounded-xl bg-slate-50/50">
                    <AlertCircle size={48} className="text-slate-300" />
                    <p className="font-medium">Belum ada jadwal libur.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {listLibur.map((item) => (
                      <div key={item.id} className="group relative bg-white border border-slate-100 rounded-xl p-4 hover:shadow-md hover:border-blue-200 transition-all duration-200 flex flex-col justify-between">
                        
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                                {/* Tanggal Box */}
                                <div className="bg-blue-50 border border-blue-100 p-2 rounded-lg text-center min-w-[50px]">
                                    <span className="block text-lg font-bold text-blue-600 leading-none">
                                    {new Date(item.tanggal).getDate()}
                                    </span>
                                    <span className="block text-[10px] uppercase text-slate-500 font-bold mt-0.5">
                                    {new Date(item.tanggal).toLocaleDateString('id-ID', { month: 'short' })}
                                    </span>
                                </div>
                                
                                {/* Info */}
                                <div>
                                    <h3 className="font-bold text-slate-700 text-sm line-clamp-2">{item.keterangan}</h3>
                                    <p className="text-xs text-slate-400 mt-0.5">{formatTgl(item.tanggal)}</p>
                                </div>
                            </div>
                        </div>

                        {/* Tombol Hapus (Muncul saat hover) */}
                        <button 
                          onClick={() => handleDelete(item.id)}
                          className="absolute top-3 right-3 p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition opacity-0 group-hover:opacity-100"
                          title="Hapus Jadwal"
                        >
                          <Trash2 size={16} />
                        </button>

                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
        </div>

      </div>
    </div>
  )
}