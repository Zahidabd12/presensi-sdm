'use client'

import { useEffect, useState, useRef } from 'react'
import { handleAttendance } from '@/app/actions'
import { getDistance } from 'geolib'
import { 
  LogOut, Camera, XCircle, CheckCircle, RefreshCw, 
  AlertTriangle, Calendar, Repeat, MapPin, 
  ArrowRightCircle, ArrowLeftCircle, ShieldCheck, Moon 
} from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { Html5Qrcode } from 'html5-qrcode'

const OFFICE_LOC = { 
  latitude: -7.310985585337482, 
  longitude: 112.72895791145474
} 
const MAX_RADIUS = 500
const SECRET_TOKEN = "ABSENSI-SDM-TOKEN-RAHASIA-2026" 
const WORK_END_HOUR = 15 // Jam 15:00 adalah batas pulang normal

export default function ScanPage() {
  const [step, setStep] = useState<'GPS' | 'READY' | 'WEEKEND_CHECK' | 'EARLY_LEAVE_CHECK' | 'SCANNING' | 'RESULT'>('GPS')
  const [status, setStatus] = useState('Mendeteksi lokasi...')
  const [debugMsg, setDebugMsg] = useState('')
  const [isSuccess, setIsSuccess] = useState(false)
  
  // State Alasan
  const [weekendReason, setWeekendReason] = useState('Lembur Project')
  const [earlyLeaveReason, setEarlyLeaveReason] = useState('')

  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment")
  const [time, setTime] = useState(new Date())
  const [todayRecord, setTodayRecord] = useState<{ check_in: string | null, check_out: string | null } | null>(null)

  const router = useRouter()
  const supabase = createClient()
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null)

  // --- JAM REALTIME ---
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // --- CLEANUP ---
  useEffect(() => {
    return () => {
        if (html5QrCodeRef.current?.isScanning) {
            html5QrCodeRef.current.stop().catch(console.error)
            html5QrCodeRef.current.clear()
        }
    }
  }, [])

  // --- INIT DATA ---
  useEffect(() => {
    const init = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (user?.email?.toLowerCase().includes('admin')) {
            router.replace('/admin/dashboard')
            return
        }

        if (user) {
            const d = new Date()
            const localDate = new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().split('T')[0]
            
            const { data } = await supabase
                .from('attendance')
                .select('check_in, check_out')
                .eq('user_email', user.email)
                .eq('date', localDate)
                .single()
            
            if (data) setTodayRecord(data)
        }

        // Cek Browser & GPS (Sama seperti sebelumnya)
        if (!navigator.geolocation) { setDebugMsg('Browser tidak support GPS.'); return }
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const userLoc = { latitude: pos.coords.latitude, longitude: pos.coords.longitude }
                const distance = getDistance(userLoc, OFFICE_LOC)
                
                if (distance > MAX_RADIUS) {
                    setDebugMsg(`❌ Kejauhan! Jarak: ${distance}m`)
                } else {
                    setStep('READY')
                    setStatus('Lokasi Aman. Siap Scan.')
                }
            },
            (err) => setDebugMsg(`❌ Gagal GPS: ${err.message}`),
            { enableHighAccuracy: true }
        )
    }
    init()
  }, [])

  const handleStartButton = () => {
    // 1. Cek Hari Libur (Sabtu/Minggu)
    const day = new Date().getDay()
    if (day === 0 || day === 6) {
        setStep('WEEKEND_CHECK') 
        return
    } 
    
    // 2. Normal Start
    startCamera(facingMode)
  }

  const startCamera = async (mode: "environment" | "user") => {
    setDebugMsg('')
    setStep('SCANNING')

    if (html5QrCodeRef.current) {
        try { if (html5QrCodeRef.current.isScanning) await html5QrCodeRef.current.stop(); html5QrCodeRef.current.clear() } catch (e) {}
    }
    await new Promise(r => setTimeout(r, 300))

    try {
      const html5QrCode = new Html5Qrcode("reader")
      html5QrCodeRef.current = html5QrCode
      const config = { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 }
      await html5QrCode.start({ facingMode: mode }, config, onScanSuccess, () => {})
    } catch (err: any) {
      setStep('READY')
      let errorText = "Gagal akses kamera."
      if (JSON.stringify(err).includes("NotReadableError")) errorText = "Kamera sibuk. Restart browser."
      setDebugMsg(`❌ ${errorText}`)
    }
  }

  const switchCamera = async () => {
     setStep('READY') 
     if (html5QrCodeRef.current) { try { if (html5QrCodeRef.current.isScanning) await html5QrCodeRef.current.stop() } catch(e) {} }
     const newMode = facingMode === "environment" ? "user" : "environment"
     setFacingMode(newMode)
     setTimeout(() => startCamera(newMode), 500)
  }

  const onScanSuccess = async (decodedText: string) => {
      if (html5QrCodeRef.current) { try { await html5QrCodeRef.current.stop(); html5QrCodeRef.current.clear() } catch (e) {} }
      
      if (decodedText !== SECRET_TOKEN) {
         setStep('RESULT')
         setDebugMsg('❌ QR Code Salah!')
         setIsSuccess(false)
         return
      }

      // --- LOGIC BARU: CEK PULANG CEPAT ---
      // Jika user SUDAH Check In, dan BELUM Check Out (artinya mau pulang)
      if (todayRecord?.check_in && !todayRecord?.check_out) {
          const currentHour = new Date().getHours()
          
          // Jika Jam sekarang < 15:00
          if (currentHour < WORK_END_HOUR) {
              setStep('EARLY_LEAVE_CHECK') // Buka Modal Alasan
              return
          }
      }

      // Jika normal, langsung proses
      setStep('RESULT')
      processAttendance()
  }

  const processAttendance = async (reason?: string) => {
    setStatus('Mengirim data...')
    
    // Kirim alasan (weekendReason ATAU earlyLeaveReason)
    const noteToSend = step === 'WEEKEND_CHECK' ? weekendReason : (reason || undefined)

    const result = await handleAttendance(noteToSend)
    setStatus(result.message)
    setIsSuccess(result.success)
  }

  const formatTimeInfo = (isoString: string | null | undefined) => {
      if (!isoString) return '--:--'
      return new Date(isoString).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
  }

  const dateString = time.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const timeString = time.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  // Cek apakah sudah selesai hari ini (Masuk & Pulang sudah terisi)
  const isDoneToday = todayRecord?.check_in && todayRecord?.check_out

  return (
    <div className="flex min-h-screen flex-col bg-slate-900 text-white font-sans overflow-hidden">
      
      {/* HEADER */}
      <header className="bg-slate-800/80 backdrop-blur-md border-b border-slate-700 p-4 flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-sm">SDM</div>
            <span className="font-bold text-sm tracking-wide">PRESENSI</span>
        </div>
        <button onClick={async () => { await supabase.auth.signOut(); router.push('/') }} className="text-xs font-bold text-red-400 bg-red-400/10 px-3 py-1.5 rounded-full hover:bg-red-400/20 transition flex items-center gap-1">
          <LogOut size={14} /> Keluar
        </button>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-4 w-full max-w-md mx-auto space-y-6">

        {/* JAM DIGITAL */}
        <div className="w-full text-center space-y-1 pt-4">
            <div className="text-blue-400 text-sm font-medium uppercase tracking-widest flex items-center justify-center gap-2">
                <Calendar size={14}/> {dateString}
            </div>
            <div className="text-6xl font-mono font-bold text-white tracking-tighter drop-shadow-lg">
                {timeString}
            </div>
        </div>

        {/* WIDGET STATUS */}
        <div className="grid grid-cols-2 gap-3 w-full animate-in slide-in-from-bottom-2">
            <div className={`p-4 rounded-2xl border flex flex-col items-center justify-center relative overflow-hidden ${todayRecord?.check_in ? 'bg-blue-900/20 border-blue-500/50' : 'bg-slate-800/50 border-slate-700'}`}>
                <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase mb-1 z-10"><ArrowRightCircle size={14} className={todayRecord?.check_in ? 'text-blue-400' : 'text-slate-500'}/> Masuk</div>
                <div className={`text-2xl font-mono font-bold z-10 ${todayRecord?.check_in ? 'text-blue-400' : 'text-slate-500'}`}>{formatTimeInfo(todayRecord?.check_in)}</div>
            </div>

            <div className={`p-4 rounded-2xl border flex flex-col items-center justify-center relative overflow-hidden ${todayRecord?.check_out ? 'bg-amber-900/20 border-amber-500/50' : 'bg-slate-800/50 border-slate-700'}`}>
                <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase mb-1 z-10"><ArrowLeftCircle size={14} className={todayRecord?.check_out ? 'text-amber-400' : 'text-slate-500'}/> Pulang</div>
                <div className={`text-2xl font-mono font-bold z-10 ${todayRecord?.check_out ? 'text-amber-400' : 'text-slate-500'}`}>{formatTimeInfo(todayRecord?.check_out)}</div>
            </div>
        </div>

        {debugMsg && (
          <div className="bg-red-500/10 border border-red-500/50 p-4 rounded-xl text-center w-full animate-in fade-in">
            <AlertTriangle size={24} className="mx-auto text-red-400 mb-2" />
            <p className="text-red-200 font-medium text-sm">{debugMsg}</p>
          </div>
        )}

        {/* --- LOGIC TAMPILAN UTAMA --- */}

        {/* 1. JIKA SUDAH SELESAI HARI INI */}
        {isDoneToday ? (
             <div className="w-full bg-gradient-to-br from-green-800/40 to-emerald-900/40 border border-green-500/30 p-8 rounded-3xl text-center animate-in zoom-in duration-500 shadow-2xl">
                <div className="bg-green-500/20 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 ring-4 ring-green-500/10">
                    <ShieldCheck size={48} className="text-green-400"/>
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Tugas Selesai!</h2>
                <p className="text-green-200/80 mb-6 text-sm leading-relaxed">
                    Terima kasih atas kerja kerasmu hari ini.<br/>
                    Status kehadiran sudah tercatat lengkap.
                </p>
                <div className="flex items-center justify-center gap-2 text-emerald-400 bg-emerald-900/30 py-2 px-4 rounded-full text-xs font-bold w-fit mx-auto">
                    <Moon size={12}/> Sampai Jumpa Besok
                </div>
             </div>
        ) : (
             /* 2. JIKA BELUM SELESAI, TAMPILKAN TOMBOL SCAN */
             step === 'READY' && (
                <div className="w-full space-y-4 animate-in slide-in-from-bottom-5">
                    <div className="flex items-center justify-center gap-2 text-slate-400 text-xs bg-slate-800/50 py-1 px-3 rounded-full w-fit mx-auto">
                        <MapPin size={12}/> Lokasi Terjangkau
                    </div>
                    <button onClick={handleStartButton} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-5 rounded-2xl shadow-lg shadow-blue-600/30 flex items-center justify-center gap-3 transition active:scale-95 text-lg group">
                        <div className="bg-white/20 p-2 rounded-full group-hover:scale-110 transition"><Camera size={24} /></div>
                        {todayRecord?.check_in ? 'SCAN PULANG' : 'SCAN MASUK'}
                    </button>
                </div>
             )
        )}

        {/* LOADING GPS */}
        {step === 'GPS' && !debugMsg && (
            <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 w-full text-center space-y-4 animate-pulse">
                <RefreshCw size={32} className="animate-spin text-blue-500 mx-auto" />
                <p className="text-slate-400 text-sm">Mencari lokasi...</p>
            </div>
        )}

        {/* LAYAR SCANNER */}
        <div className={`w-full ${step === 'SCANNING' ? 'block' : 'hidden'} animate-in fade-in`}>
            <div className="relative rounded-3xl overflow-hidden border-4 border-slate-800 shadow-2xl bg-black">
                <div id="reader" className="w-full h-[350px] bg-black object-cover"></div>
                <div className="absolute top-0 left-0 w-full h-full pointer-events-none flex items-center justify-center">
                    <div className="w-64 h-64 border-2 border-blue-500/50 rounded-lg relative">
                        <div className="w-full h-0.5 bg-blue-500 absolute top-1/2 shadow-[0_0_15px_rgba(59,130,246,1)] animate-pulse"></div>
                    </div>
                </div>
                <div className="absolute bottom-4 left-0 w-full flex justify-center items-center gap-4 z-20 px-4">
                    <button onClick={switchCamera} className="bg-white/10 backdrop-blur p-3 rounded-full hover:bg-white/20 border border-white/20 active:scale-95 transition">
                        <Repeat size={20} />
                    </button>
                </div>
            </div>
            <button onClick={() => { if (html5QrCodeRef.current?.isScanning) html5QrCodeRef.current.stop().catch(console.error); setStep('READY') }} className="mt-6 w-full py-3 text-slate-400 bg-slate-800 rounded-xl font-bold hover:bg-slate-700 hover:text-white transition">Batalkan</button>
        </div>

        {/* MODAL: EARLY LEAVE (PULANG CEPAT) */}
        {step === 'EARLY_LEAVE_CHECK' && (
             <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
                <div className="bg-slate-800 border border-slate-600 w-full max-w-sm p-6 rounded-2xl shadow-2xl space-y-4">
                    <div className="flex items-center gap-3 text-amber-400 font-bold text-lg">
                        <AlertTriangle size={24} /> Pulang Awal?
                    </div>
                    <div className="bg-amber-500/10 p-3 rounded-lg text-amber-200/80 text-sm">
                        Sekarang belum jam 15:00. Mohon isi alasan kenapa pulang lebih awal.
                    </div>
                    <textarea 
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:ring-2 focus:ring-amber-500 outline-none h-24"
                        placeholder="Contoh: Izin sakit, jemput anak, urusan keluarga..."
                        value={earlyLeaveReason}
                        onChange={(e) => setEarlyLeaveReason(e.target.value)}
                    />
                    <div className="flex gap-3 pt-2">
                        <button onClick={() => setStep('READY')} className="flex-1 py-3 bg-slate-700 rounded-xl font-bold text-slate-300">Batal</button>
                        <button 
                            disabled={!earlyLeaveReason.trim()}
                            onClick={() => { setStep('RESULT'); processAttendance(earlyLeaveReason) }} 
                            className="flex-1 py-3 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-bold text-white">
                            Konfirmasi
                        </button>
                    </div>
                </div>
             </div>
        )}

        {/* MODAL: WEEKEND CHECK (Sama seperti sebelumnya) */}
        {step === 'WEEKEND_CHECK' && (
             <div className="w-full bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-xl animate-in zoom-in">
                <div className="flex items-center gap-2 text-amber-400 font-bold mb-4 text-lg border-b border-slate-700 pb-4"><Calendar size={24}/> Presensi Hari Libur</div>
                <div className="space-y-3 mb-6">
                    {['Lembur Project', 'Event Kampus', 'Ganti Jam', 'Lainnya'].map((reason) => (
                        <label key={reason} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${weekendReason === reason ? 'bg-blue-600/20 border-blue-500 text-white' : 'bg-slate-700/50 border-transparent text-slate-400 hover:bg-slate-700'}`}>
                            <input type="radio" name="reason" value={reason} checked={weekendReason === reason} onChange={(e) => setWeekendReason(e.target.value)} className="w-4 h-4 accent-blue-500"/>{reason}
                        </label>
                    ))}
                </div>
                <div className="flex gap-3">
                    <button onClick={() => setStep('READY')} className="flex-1 bg-slate-700 py-3 rounded-xl font-bold text-slate-300">Batal</button>
                    <button onClick={() => startCamera(facingMode)} className="flex-1 bg-blue-600 py-3 rounded-xl font-bold text-white hover:bg-blue-500">Lanjut</button>
                </div>
             </div>
        )}

        {/* HASIL (RESULT) */}
        {step === 'RESULT' && (
             <div className={`w-full p-8 rounded-3xl text-center border shadow-2xl animate-in zoom-in ${isSuccess ? 'bg-green-500/10 border-green-500/50' : 'bg-red-500/10 border-red-500/50'}`}>
                <div className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 ${isSuccess ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                    {isSuccess ? <CheckCircle size={48} /> : <XCircle size={48} />}
                </div>
                <h2 className={`text-3xl font-bold mb-2 ${isSuccess ? 'text-green-400' : 'text-red-400'}`}>{isSuccess ? 'Berhasil!' : 'Gagal'}</h2>
                <div className="h-px w-20 bg-white/10 mx-auto my-4"></div>
                <p className="text-slate-200 text-lg leading-relaxed whitespace-pre-line font-medium">{status}</p>
                <button onClick={() => window.location.reload()} className="w-full bg-slate-700 px-6 py-4 rounded-xl font-bold hover:bg-slate-600 transition mt-8 text-white shadow-lg">Tutup</button>
             </div>
        )}

      </main>
      <footer className="p-4 text-center text-xs text-slate-600">&copy; {new Date().getFullYear()} Presensi SDM</footer>
    </div>
  )
}