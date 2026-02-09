'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { 
  Calendar, Trash2, Save, Plus, AlertCircle, CalendarDays, CheckCircle 
} from 'lucide-react'

type Holiday = {
  id: string
  date: string
  description: string
}

export default function KelolaLiburPage() {
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [loading, setLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  
  // STATE INPUT MASSAL
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [description, setDescription] = useState('')
  const [previewDates, setPreviewDates] = useState<string[]>([])

  const supabase = createClient()

  useEffect(() => {
    fetchHolidays()
  }, [])

  // Efek untuk preview berapa hari yang dipilih
  useEffect(() => {
    if (startDate && endDate) {
        const list = getDatesInRange(startDate, endDate)
        setPreviewDates(list)
    } else if (startDate) {
        setPreviewDates([startDate])
    } else {
        setPreviewDates([])
    }
  }, [startDate, endDate])

  const fetchHolidays = async () => {
    setLoading(true)
    const { data } = await supabase.from('holidays').select('*').order('date', { ascending: true })
    if (data) setHolidays(data)
    setLoading(false)
  }

  // Helper: Generate Tanggal dari Range
  const getDatesInRange = (start: string, end: string) => {
    const date = new Date(start)
    const stop = new Date(end)
    const list = []
    while (date <= stop) {
        list.push(new Date(date).toISOString().split('T')[0])
        date.setDate(date.getDate() + 1)
    }
    return list
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!startDate || !description) return
    setIsSaving(true)

    // 1. Tentukan Range (Jika EndDate kosong, anggap 1 hari saja)
    const finalEndDate = endDate || startDate
    const datesToInsert = getDatesInRange(startDate, finalEndDate)

    // 2. Siapkan Payload
    const payload = datesToInsert.map(date => ({
        date: date,
        description: description
    }))

    // 3. Simpan ke Supabase (Upsert: Jika tanggal sudah ada, update keterangannya)
    const { error } = await supabase.from('holidays').upsert(payload, { onConflict: 'date' })

    if (!error) {
        alert(`Berhasil menambahkan ${datesToInsert.length} hari libur!`)
        setStartDate('')
        setEndDate('')
        setDescription('')
        fetchHolidays()
    } else {
        alert("Gagal menyimpan: " + error.message)
    }
    setIsSaving(false)
  }

  const handleDelete = async (id: string) => {
    if(!confirm("Hapus hari libur ini?")) return
    const { error } = await supabase.from('holidays').delete().eq('id', id)
    if (!error) fetchHolidays()
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-6 rounded-xl shadow-sm border border-slate-100">
        <div>
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <CalendarDays className="text-red-500" /> Kelola Hari Libur
            </h2>
            <p className="text-slate-500 text-sm">Atur Tanggal Merah & Cuti Bersama agar staff tidak dianggap Alpha.</p>
        </div>
        <div className="bg-red-50 text-red-600 px-4 py-2 rounded-lg text-xs font-bold border border-red-100 flex items-center gap-2">
            <AlertCircle size={16}/> Total Libur Terdaftar: {holidays.length} Hari
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* FORM INPUT MASSAL */}
        <div className="md:col-span-1">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 sticky top-6">
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Plus size={20}/> Tambah Libur</h3>
                
                <form onSubmit={handleSave} className="space-y-4">
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase">Dari Tanggal (Mulai)</label>
                        <input type="date" required className="w-full p-2 border rounded mt-1 bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500" 
                            value={startDate} onChange={e => setStartDate(e.target.value)} />
                    </div>

                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase">Sampai Tanggal</label>
                        <input type="date" className="w-full p-2 border rounded mt-1 bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500" 
                            value={endDate} onChange={e => setEndDate(e.target.value)} />
                        <p className="text-[10px] text-slate-400 mt-1">*Kosongkan jika hanya 1 hari libur.</p>
                    </div>

                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase">Keterangan Libur</label>
                        <input type="text" required placeholder="Contoh: Cuti Bersama Lebaran" className="w-full p-2 border rounded mt-1 outline-none focus:ring-2 focus:ring-blue-500" 
                            value={description} onChange={e => setDescription(e.target.value)} />
                    </div>

                    {/* Preview Info */}
                    {previewDates.length > 0 && (
                        <div className="bg-blue-50 p-3 rounded text-xs text-blue-700 border border-blue-200">
                            Akan menambahkan <strong>{previewDates.length} hari</strong> libur:<br/>
                            {new Date(startDate).toLocaleDateString('id-ID')} s/d {endDate ? new Date(endDate).toLocaleDateString('id-ID') : new Date(startDate).toLocaleDateString('id-ID')}
                        </div>
                    )}

                    <button disabled={isSaving} className="w-full py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition flex justify-center gap-2">
                        {isSaving ? 'Menyimpan...' : <><Save size={18}/> Simpan Semua</>}
                    </button>
                </form>
            </div>
        </div>

        {/* TABEL LIST LIBUR */}
        <div className="md:col-span-2">
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 font-bold text-slate-700">
                    Daftar Tanggal Merah
                </div>
                <div className="max-h-[600px] overflow-y-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-500 sticky top-0">
                            <tr>
                                <th className="px-6 py-3">Tanggal</th>
                                <th className="px-6 py-3">Keterangan</th>
                                <th className="px-6 py-3 text-right">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? <tr><td colSpan={3} className="p-6 text-center text-slate-400">Loading...</td></tr> :
                             holidays.length === 0 ? <tr><td colSpan={3} className="p-6 text-center text-slate-400">Belum ada hari libur.</td></tr> :
                             holidays.map((h) => (
                                <tr key={h.id} className="hover:bg-slate-50">
                                    <td className="px-6 py-3 font-mono text-red-600 font-bold">
                                        {new Date(h.date).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}
                                    </td>
                                    <td className="px-6 py-3 font-medium text-slate-700">{h.description}</td>
                                    <td className="px-6 py-3 text-right">
                                        <button onClick={() => handleDelete(h.id)} className="text-red-400 hover:text-red-600 p-2 rounded hover:bg-red-50 transition">
                                            <Trash2 size={18}/>
                                        </button>
                                    </td>
                                </tr>
                             ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

      </div>
    </div>
  )
}