'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { 
  Users, Plus, Edit, Trash2, Search, X, Save, RefreshCw 
} from 'lucide-react'
import { addStaff, updateStaff, deleteStaff } from '@/app/actions'

type Staff = {
  id: string
  email: string
  name: string
  position: string
  created_at: string
}

export default function StaffManagementPage() {
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  
  // State Modal (Add/Edit)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [formData, setFormData] = useState<Partial<Staff>>({})
  
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null)
  
  const supabase = createClient()
  const router = useRouter()

  // FETCH STAFF
  const fetchStaff = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('staff')
      .select('*')
      .order('name', { ascending: true })
    
    if (data) setStaffList(data)
    setLoading(false)
  }

  useEffect(() => {
    const init = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) router.push('/')
        else fetchStaff()
    }
    init()
  }, [])

  // HANDLERS
  const handleOpenAdd = () => {
    setFormData({ name: '', email: '', position: '' }) // Reset form
    setIsModalOpen(true)
  }

  const handleOpenEdit = (staff: Staff) => {
    setFormData(staff) // Isi form dengan data lama
    setIsModalOpen(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    
    let res
    if (formData.id) {
        // Punya ID = Update
        res = await updateStaff(formData)
    } else {
        // Tidak punya ID = Insert Baru
        res = await addStaff(formData)
    }

    if (res.success) {
        await fetchStaff()
        showToast(res.message, 'success')
        setIsModalOpen(false)
    } else {
        showToast(res.message, 'error')
    }
    setIsSaving(false)
  }

  const handleDelete = async (id: string) => {
    if(!confirm("Yakin hapus staff ini? Data presensi lama tetap ada, tapi dia tidak muncul di daftar aktif.")) return
    
    const res = await deleteStaff(id)
    if (res.success) {
        setStaffList(staffList.filter(s => s.id !== id))
        showToast('Staff dihapus.', 'success')
    } else {
        showToast(res.message, 'error')
    }
  }

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  // Filter Search
  const filteredStaff = staffList.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    s.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.position && s.position.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-6 py-4 rounded-xl shadow-xl bg-white border-l-8 ${toast.type==='success'?'border-green-500':'border-red-500'}`}>
            {toast.message}
        </div>
      )}

      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-slate-100 gap-4">
        <div>
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><Users className="text-blue-600"/> Kelola Staff</h2>
            <p className="text-slate-500 text-sm">Daftar karyawan yang aktif & terdaftar di sistem.</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
            <div className="relative w-full md:w-64">
                <Search className="absolute left-3 top-3 text-slate-400" size={18}/>
                <input 
                    type="text" placeholder="Cari nama / email..." 
                    className="w-full pl-10 pr-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                />
            </div>
            <button onClick={handleOpenAdd} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg flex items-center gap-2 font-bold shadow-lg shadow-blue-600/20 whitespace-nowrap">
                <Plus size={20}/> <span className="hidden sm:inline">Tambah Staff</span>
            </button>
        </div>
      </div>

      {/* LIST STAFF */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? <p className="text-slate-500 text-center col-span-3 py-10">Memuat data...</p> : 
         filteredStaff.length === 0 ? <p className="text-slate-500 text-center col-span-3 py-10">Tidak ada data staff.</p> :
         filteredStaff.map((staff) => (
            <div key={staff.id} className="bg-white p-5 rounded-xl border border-slate-100 hover:shadow-md transition group relative overflow-hidden">
                <div className="absolute top-0 right-0 p-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90">
                    <button onClick={() => handleOpenEdit(staff)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-full"><Edit size={18}/></button>
                    <button onClick={() => handleDelete(staff.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-full"><Trash2 size={18}/></button>
                </div>
                
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-md">
                        {staff.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-800 text-lg leading-tight">{staff.name}</h3>
                        <p className="text-blue-600 text-sm font-medium">{staff.position || 'Staff'}</p>
                        <p className="text-slate-400 text-xs mt-1">{staff.email}</p>
                    </div>
                </div>
            </div>
         ))
        }
      </div>

      {/* MODAL FORM */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
                <div className="px-6 py-4 border-b flex justify-between items-center bg-slate-50">
                    <h3 className="font-bold text-lg text-slate-800">{formData.id ? 'Edit Data Staff' : 'Tambah Staff Baru'}</h3>
                    <button onClick={() => setIsModalOpen(false)}><X className="text-slate-400 hover:text-red-500"/></button>
                </div>
                
                <form onSubmit={handleSave} className="p-6 space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nama Lengkap</label>
                        <input required className="w-full border p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" 
                            placeholder="Contoh: Budi Santoso"
                            value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Email (Untuk Login)</label>
                        <input required type="email" className="w-full border p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" 
                            placeholder="nama@kampus.ac.id"
                            value={formData.email || ''} onChange={e => setFormData({...formData, email: e.target.value})}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Jabatan / Posisi</label>
                        <input required className="w-full border p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" 
                            placeholder="Contoh: Staff Admin"
                            value={formData.position || ''} onChange={e => setFormData({...formData, position: e.target.value})}
                        />
                    </div>

                    <div className="pt-4 flex gap-3">
                        <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-3 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg font-bold">Batal</button>
                        <button type="submit" disabled={isSaving} className="flex-1 py-3 bg-blue-600 text-white hover:bg-blue-700 rounded-lg font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20">
                            {isSaving ? <RefreshCw className="animate-spin" size={20}/> : <Save size={20}/>} Simpan
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}
    </div>
  )
}