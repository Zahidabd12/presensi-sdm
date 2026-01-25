'use client'

import { useEffect, useState, useRef } from 'react'
import { handleAttendance } from '@/app/actions'
import { getDistance } from 'geolib'
import { LogOut, Camera, XCircle, CheckCircle, RefreshCw, AlertTriangle, Calendar } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { Html5Qrcode } from 'html5-qrcode'

const OFFICE_LOC = { 
  latitude: -7.310985585337482, 
  longitude: 112.72895791145474
} 
const MAX_RADIUS = 5000 
const SECRET_TOKEN = "ABSENSI-SDM-TOKEN-RAHASIA-2026" 

export default function ScanPage() {
  const [step, setStep] = useState<'GPS' | 'READY' | 'WEEKEND_CHECK' | 'SCANNING' | 'RESULT'>('GPS')
  const [status, setStatus] = useState('Mendeteksi lokasi...')
  const [debugMsg, setDebugMsg] = useState('')
  const [isSuccess, setIsSuccess] = useState(false)
  const [weekendReason, setWeekendReason] = useState('Lembur Project') // Default alasan
  
  const router = useRouter()
  const supabase = createClient()
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null)

  useEffect(() => {
    const init = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (user?.email?.toLowerCase().includes('admin')) {
            router.replace('/admin/dashboard')
            return
        }
        if (!navigator.geolocation) {
            setDebugMsg('Browser tidak support GPS.')
            return
        }
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

  // LOGIC MULAI KAMERA
  const handleStartButton = () => {
    // Cek apakah hari ini Weekend?
    const day = new Date().getDay()
    // 0 = Minggu, 6 = Sabtu
    if (day === 0 || day === 6) {
        setStep('WEEKEND_CHECK') // Tanya alasan dulu
    } else {
        startCamera() // Hari biasa langsung gas
    }
  }

  const startCamera = async () => {
    setDebugMsg('')
    setStep('SCANNING')

    try {
      await navigator.mediaDevices.getUserMedia({ video: true })
      const html5QrCode = new Html5Qrcode("reader")
      html5QrCodeRef.current = html5QrCode

      await html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText) => {
          await html5QrCode.stop()
          html5QrCode.clear()
          setStep('RESULT')
          
          if (decodedText === SECRET_TOKEN) {
             processAttendance()
          } else {
             setDebugMsg('❌ QR Code Salah!')
             setIsSuccess(false)
          }
        },
        () => {}
      )
    } catch (err: any) {
      setStep('READY')
      setDebugMsg("❌ Gagal buka kamera: " + err.message)
    }
  }

  const stopCamera = async () => {
    if (html5QrCodeRef.current) {
        try { await html5QrCodeRef.current.stop(); html5QrCodeRef.current.clear(); } catch (e) {}
        setStep('READY')
    }
  }

  const processAttendance = async () => {
    setStatus('Mengirim data...')
    // Kirim alasan weekend (jika ada) ke server
    const result = await handleAttendance(step === 'WEEKEND_CHECK' ? weekendReason : undefined)
    setStatus(result.message)
    setIsSuccess(result.success)
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-gray-900 text-white p-4 font-sans">
      <div className="w-full max-w-md flex justify-between items-center py-4 border-b border-gray-700 mb-6">
        <h1 className="font-bold text-lg">Scanner SDM</h1>
        <button onClick={async () => { await supabase.auth.signOut(); router.push('/') }} className="text-sm text-red-400 flex gap-1 items-center hover:text-red-300">
          <LogOut size={16} /> Keluar
        </button>
      </div>

      <div className="w-full max-w-md flex flex-col items-center">
        {debugMsg && (
          <div className="bg-red-900/50 border border-red-500 p-4 rounded-xl text-center mb-6 w-full animate-in fade-in">
            <AlertTriangle size={24} className="mx-auto text-red-400 mb-2" />
            <p className="text-red-200 font-medium text-sm">{debugMsg}</p>
          </div>
        )}

        {step === 'GPS' && !debugMsg && (
            <div className="text-center py-10">
                <RefreshCw size={48} className="animate-spin text-blue-400 mx-auto mb-4" />
                <p className="text-gray-300">Mencari lokasi...</p>
            </div>
        )}

        {step === 'READY' && (
             <div className="text-center w-full py-6">
                <div className="bg-blue-600/20 p-6 rounded-full w-24 h-24 flex items-center justify-center mx-auto mb-6">
                    <Camera size={40} className="text-blue-400" />
                </div>
                <h2 className="text-xl font-bold mb-2">Siap Scan</h2>
                <p className="text-gray-400 mb-8 text-sm px-4">Pastikan Anda berada di area kantor.</p>
                <button onClick={handleStartButton} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-3 shadow-lg shadow-blue-600/30 transition transform active:scale-95">
                    <Camera size={24} /> BUKA KAMERA
                </button>
             </div>
        )}

        {/* PERTANYAAN WEEKEND */}
        {step === 'WEEKEND_CHECK' && (
             <div className="w-full bg-gray-800 p-6 rounded-xl border border-gray-700 animate-in zoom-in">
                <div className="flex items-center gap-2 text-amber-400 font-bold mb-4 text-lg">
                    <Calendar size={24}/> Hari Libur Terdeteksi
                </div>
                <p className="text-gray-300 text-sm mb-4">Hari ini adalah hari libur (Sabtu/Minggu). Mohon isi alasan kehadiran Anda:</p>
                
                <select 
                    className="w-full p-3 rounded-lg bg-gray-700 border border-gray-600 text-white mb-6 outline-none focus:ring-2 focus:ring-amber-500"
                    value={weekendReason}
                    onChange={(e) => setWeekendReason(e.target.value)}
                >
                    <option value="Lembur Project">🔥 Lembur Project</option>
                    <option value="Event Kampus">🎓 Event Kampus</option>
                    <option value="Ganti Jam">🔄 Ganti Jam (Hutang)</option>
                    <option value="Lainnya">📝 Lainnya</option>
                </select>

                <div className="flex gap-3">
                    <button onClick={() => setStep('READY')} className="flex-1 bg-gray-700 py-3 rounded-lg font-bold">Batal</button>
                    <button onClick={startCamera} className="flex-1 bg-amber-600 hover:bg-amber-700 py-3 rounded-lg font-bold text-white">Lanjut Scan</button>
                </div>
             </div>
        )}

        <div className={`w-full ${step === 'SCANNING' ? 'block' : 'hidden'}`}>
            <div className="bg-black rounded-2xl overflow-hidden shadow-2xl border border-gray-700 relative">
                <div id="reader" className="w-full h-[300px] bg-black"></div>
                <div className="absolute top-1/2 left-4 right-4 h-0.5 bg-red-500/50 shadow-[0_0_10px_rgba(239,68,68,0.8)] z-10"></div>
            </div>
            <button onClick={stopCamera} className="mt-6 text-gray-400 underline text-sm block mx-auto hover:text-white">Batal</button>
        </div>

        {step === 'RESULT' && (
             <div className={`border p-8 rounded-2xl text-center w-full animate-in zoom-in ${isSuccess ? 'bg-green-500/10 border-green-500' : 'bg-red-500/10 border-red-500'}`}>
                {isSuccess ? <CheckCircle size={64} className="mx-auto text-green-500 mb-4"/> : <XCircle size={64} className="mx-auto text-red-500 mb-4"/>}
                <h2 className={`text-2xl font-bold mb-4 ${isSuccess ? 'text-green-400' : 'text-red-400'}`}>
                    {isSuccess ? 'Berhasil!' : 'Gagal'}
                </h2>
                <p className="text-gray-200 mb-8 text-base leading-relaxed whitespace-pre-line border-t border-white/10 pt-4">
                    {status}
                </p>
                <button onClick={() => window.location.reload()} className="w-full bg-gray-700 px-6 py-3 rounded-lg font-bold hover:bg-gray-600 transition">
                  Tutup
                </button>
             </div>
        )}
      </div>
    </div>
  )
}