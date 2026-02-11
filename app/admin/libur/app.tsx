'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase' 
import { 
  Calendar, Save, Trash2, 
  AlertCircle, CheckCircle, Info, X 
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
  
  // State Toast Manual (Tanpa Install Library)
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
    setTimeout(() => setToast(null), 3000) // Hilang otomatis dalam 3 detik
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
        // Cuma 1 Hari
        dataToInsert.push({
          tanggal: form.dariTanggal,
          keterangan: form.keterangan
        })
      } else {
        // Rentang Tanggal (Looping)
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
    <div className="min-h-screen bg-slate-900 text-white p-6 font-sans relative">
      
      {/* TOAST NOTIFIKASI MANUAL */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-top-5 border-l-8 ${
            toast.type === 'success' 
            ? 'bg-white text-slate-800 border-green-500' 
            : 'bg-white text-slate-800 border-red-500'
        }`}>
            {toast.type === 'success' ? <CheckCircle size={20} className="text-green-500"/> : <AlertCircle size={20} className="text-red-500"/>}
            <span className="font-bold text-sm">{toast.message}</span>
        </div>
      )}

      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* HEADER */}
        <div className="flex items-center gap-3 border-b border-slate-700 pb-4">
          <div className="bg-blue-600/20 p-3 rounded-xl text-blue-400">
            <Calendar size={32} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Kelola Hari Libur</h1>
            <p className="text-slate-400 text-sm">Input tanggal merah agar karyawan tidak dianggap Alpha.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* KOLOM KIRI: FORM INPUT */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 shadow-xl">
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-blue-400">
                <Info size={18}/> Form Input
              </h2>

              <form onSubmit={handleSubmit} className="space-y-4">
                
                {/* Dari Tanggal */}
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Dari Tanggal</label>
                  <input
                    type="date"
                    required
                    value={form.dariTanggal}
                    onChange={e => setForm({...form, dariTanggal: e.target.value})}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:ring-2 focus:ring-blue-500 outline-none transition"
                  />
                </div>

                {/* Sampai Tanggal */}
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1 flex justify-between">
                    Sampai Tanggal 
                    <span className="text-xs text-slate-500 lowercase font-normal">(opsional)</span>
                  </label>
                  <input
                    type="date"
                    min={form.dariTanggal}
                    value={form.sampaiTanggal}
                    onChange={e => setForm({...form, sampaiTanggal: e.target.value})}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:ring-2 focus:ring-blue-500 outline-none transition disabled:opacity-50"
                  />
                  {form.sampaiTanggal && (
                    <p className="text-xs text-blue-400 mt-1 animate-pulse">
                      * Mode Rentang Tanggal Aktif
                    </p>
                  )}
                </div>

                {/* Keterangan */}
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Keterangan</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Cuti Bersama Natal"
                    value={form.keterangan}
                    onChange={e => setForm({...form, keterangan: e.target.value})}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:ring-2 focus:ring-blue-500 outline-none transition"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 transition active:scale-95 mt-4"
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
            <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 shadow-xl h-full flex flex-col">
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-emerald-400">
                <CheckCircle size={18}/> Daftar Libur Terjadwal
              </h2>
              
              <div className="flex-1 overflow-y-auto max-h-[500px] pr-2 custom-scrollbar">
                {listLibur.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-40 text-slate-500 space-y-2 border-2 border-dashed border-slate-700 rounded-xl">
                    <AlertCircle size={32} />
                    <p>Belum ada data libur.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {listLibur.map((item) => (
                      <div key={item.id} className="group flex items-center justify-between p-4 bg-slate-900/50 border border-slate-700 rounded-xl hover:border-blue-500/50 transition">
                        <div className="flex items-center gap-4">
                          <div className="bg-slate-800 p-3 rounded-lg text-center min-w-[60px]">
                            <span className="block text-xl font-bold text-blue-400">
                              {new Date(item.tanggal).getDate()}
                            </span>
                            <span className="block text-[10px] uppercase text-slate-400 font-bold">
                              {new Date(item.tanggal).toLocaleDateString('id-ID', { month: 'short' })}
                            </span>
                          </div>
                          <div>
                            <h3 className="font-bold text-slate-200">{item.keterangan}</h3>
                            <p className="text-xs text-slate-500">{formatTgl(item.tanggal)}</p>
                          </div>
                        </div>
                        
                        <button 
                          onClick={() => handleDelete(item.id)}
                          className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition"
                          title="Hapus"
                        >
                          <Trash2 size={18} />
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
    </div>
  )
}