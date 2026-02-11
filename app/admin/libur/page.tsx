'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase' 
import * as XLSX from 'xlsx' // Import Library Excel
import { 
  Calendar, Save, Trash2, 
  AlertCircle, CheckCircle, Info, X, CalendarDays,
  FileSpreadsheet, UploadCloud, Download
} from 'lucide-react'

// Interface Data
type Libur = {
  id: number
  tanggal: string
  keterangan: string
}

export default function AdminLiburPage() {
  const [loading, setLoading] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [listLibur, setListLibur] = useState<Libur[]>([])
  
  // State Toast Manual
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // State Form Manual
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

  // --- FITUR 1: MANUAL INSERT ---
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

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      let dataToInsert = []

      if (!form.sampaiTanggal) {
        dataToInsert.push({ tanggal: form.dariTanggal, keterangan: form.keterangan })
      } else {
        const dateRange = getDatesInRange(form.dariTanggal, form.sampaiTanggal)
        dataToInsert = dateRange.map(tgl => ({ tanggal: tgl, keterangan: form.keterangan }))
      }

      const { error } = await supabase.from('libur_nasional').insert(dataToInsert)

      if (error) {
        if (error.code === '23505') throw new Error('Salah satu tanggal sudah ada di database!')
        throw error
      }

      showToast(`Sukses! ${dataToInsert.length} jadwal tersimpan.`, 'success')
      setForm({ dariTanggal: '', sampaiTanggal: '', keterangan: '' })
      fetchLibur()

    } catch (error: any) {
      showToast(error.message || 'Gagal menyimpan.', 'error')
    } finally {
      setLoading(false)
    }
  }

  // --- FITUR 2: EXCEL UPLOAD ---
  
  // A. Download Template Kosong
  const handleDownloadTemplate = () => {
    const header = [
        { Tanggal: "2024-12-25", Keterangan: "Hari Natal" },
        { Tanggal: "2024-08-17", Keterangan: "Hari Kemerdekaan" }
    ]
    const ws = XLSX.utils.json_to_sheet(header)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Template")
    XLSX.writeFile(wb, "Template_Libur.xlsx")
  }

  // B. Proses Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    const reader = new FileReader()

    reader.onload = async (evt) => {
        try {
            const bstr = evt.target?.result
            const wb = XLSX.read(bstr, { type: 'binary' })
            const wsname = wb.SheetNames[0]
            const ws = wb.Sheets[wsname]
            const rawData = XLSX.utils.sheet_to_json(ws)

            // Validasi & Format Data
            const dataToInsert: any[] = []
            
            rawData.forEach((row: any) => {
                // Pastikan kolom Tanggal & Keterangan ada
                if (row.Tanggal && row.Keterangan) {
                    // Fix Format Tanggal Excel (kadang jadi angka serial)
                    let formattedDate = row.Tanggal
                    if (typeof row.Tanggal === 'number') {
                         // Convert Serial Excel ke JS Date
                         const dateObj = new Date(Math.round((row.Tanggal - 25569)*86400*1000))
                         formattedDate = dateObj.toISOString().split('T')[0]
                    }
                    
                    dataToInsert.push({
                        tanggal: formattedDate,
                        keterangan: row.Keterangan
                    })
                }
            })

            if (dataToInsert.length === 0) throw new Error("File Excel kosong atau format salah!")

            // Kirim ke Supabase
            const { error } = await supabase.from('libur_nasional').insert(dataToInsert)
            
            if (error) {
                if(error.code === '23505') throw new Error("Beberapa tanggal sudah ada, data duplikat ditolak.")
                throw error
            }

            showToast(`Berhasil import ${dataToInsert.length} jadwal libur!`, 'success')
            fetchLibur()

        } catch (error: any) {
            showToast(error.message || 'Gagal membaca file Excel', 'error')
        } finally {
            setIsUploading(false)
            if (fileInputRef.current) fileInputRef.current.value = '' // Reset input
        }
    }
    reader.readAsBinaryString(file)
  }


  // --- DELETE ---
  const handleDelete = async (id: number) => {
    if (!confirm('Hapus jadwal ini?')) return
    const { error } = await supabase.from('libur_nasional').delete().eq('id', id)
    if (!error) {
      showToast('Data dihapus', 'success')
      fetchLibur()
    }
  }

  const formatTgl = (tgl: string) => {
    return new Date(tgl).toLocaleDateString('id-ID', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
    })
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-10">
      
      {/* TOAST */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-6 py-4 rounded-xl shadow-xl flex items-center gap-3 animate-in slide-in-from-bottom-5 border-l-8 ${
            toast.type === 'success' ? 'bg-white text-slate-800 border-green-500' : 'bg-white text-slate-800 border-red-500'
        }`}>
            {toast.type === 'success' ? <CheckCircle size={20} className="text-green-500"/> : <AlertCircle size={20} className="text-red-500"/>}
            <span className="font-bold text-sm">{toast.message}</span>
        </div>
      )}

      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-100 gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
             <Calendar className="text-blue-600"/> Kelola Hari Libur
          </h2>
          <p className="text-slate-500 text-sm">Input tanggal merah agar karyawan tidak dianggap Alpha.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
        {/* KOLOM KIRI: FORM + UPLOAD */}
        <div className="lg:col-span-1 space-y-6">
            
            {/* 1. CARD UPLOAD EXCEL (NEW) */}
            <div className="bg-emerald-50 p-6 rounded-2xl border border-emerald-100 shadow-sm">
                <h2 className="text-sm font-bold mb-4 flex items-center gap-2 text-emerald-800 border-b border-emerald-200 pb-2">
                    <FileSpreadsheet size={18}/> Import Excel
                </h2>
                
                <div className="space-y-3">
                    <button onClick={handleDownloadTemplate} className="w-full py-2 bg-white text-emerald-600 border border-emerald-200 rounded-lg text-xs font-bold hover:bg-emerald-100 flex items-center justify-center gap-2 transition">
                        <Download size={14}/> Download Template
                    </button>
                    
                    <div className="relative group">
                        <input 
                            type="file" 
                            accept=".xlsx, .xls"
                            ref={fileInputRef}
                            onChange={handleFileUpload}
                            disabled={isUploading}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                        />
                        <div className="w-full py-3 bg-emerald-600 text-white rounded-lg font-bold shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 group-hover:bg-emerald-700 transition">
                            {isUploading ? <span className="animate-spin">⏳</span> : <UploadCloud size={16}/>}
                            {isUploading ? 'Sedang Proses...' : 'Upload File Excel'}
                        </div>
                    </div>
                    <p className="text-[10px] text-emerald-700 text-center">
                        Format: .xlsx | Kolom: Tanggal (YYYY-MM-DD), Keterangan
                    </p>
                </div>
            </div>

            {/* 2. CARD MANUAL INPUT */}
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
              <h2 className="text-lg font-bold mb-6 flex items-center gap-2 text-slate-700 border-b pb-4">
                <Info size={18} className="text-blue-500"/> Input Manual
              </h2>

              <form onSubmit={handleManualSubmit} className="space-y-5">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Dari Tanggal</label>
                  <input
                        type="date" required value={form.dariTanggal}
                        onChange={e => setForm({...form, dariTanggal: e.target.value})}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-slate-700 font-medium transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex justify-between">
                    Sampai Tanggal <span className="text-[10px] text-slate-400 font-normal lowercase">(opsional)</span>
                  </label>
                  <input
                        type="date" min={form.dariTanggal} value={form.sampaiTanggal}
                        onChange={e => setForm({...form, sampaiTanggal: e.target.value})}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-slate-700 font-medium transition disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Keterangan</label>
                  <input
                    type="text" required placeholder="Contoh: Cuti Bersama"
                    value={form.keterangan}
                    onChange={e => setForm({...form, keterangan: e.target.value})}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-slate-700 font-medium transition"
                  />
                </div>
                <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 transition active:scale-95 mt-4">
                  {loading ? 'Menyimpan...' : <> <Save size={18} /> Simpan </>}
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
                                <div className="bg-blue-50 border border-blue-100 p-2 rounded-lg text-center min-w-[50px]">
                                    <span className="block text-lg font-bold text-blue-600 leading-none">
                                    {new Date(item.tanggal).getDate()}
                                    </span>
                                    <span className="block text-[10px] uppercase text-slate-500 font-bold mt-0.5">
                                    {new Date(item.tanggal).toLocaleDateString('id-ID', { month: 'short' })}
                                    </span>
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-700 text-sm line-clamp-2">{item.keterangan}</h3>
                                    <p className="text-xs text-slate-400 mt-0.5">{formatTgl(item.tanggal)}</p>
                                </div>
                            </div>
                        </div>
                        <button onClick={() => handleDelete(item.id)} className="absolute top-3 right-3 p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition opacity-0 group-hover:opacity-100" title="Hapus Jadwal">
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