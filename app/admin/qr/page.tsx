'use client'
import { useState, useRef } from 'react'
import QRCode from 'react-qr-code'
import { Printer, Download, Copy, RefreshCw, Check, QrCode } from 'lucide-react'

// Token ini HARUS SAMA PERSIS dengan yang ada di app/scan/page.tsx
const DEFAULT_TOKEN = "ABSENSI-SDM-TOKEN-RAHASIA-2026"

export default function QrGeneratorPage() {
  const [qrValue, setQrValue] = useState(DEFAULT_TOKEN)
  const [copied, setCopied] = useState(false)
  
  // Fungsi Download QR sebagai Gambar PNG
  const downloadQR = () => {
    const svg = document.getElementById("qr-code-svg")
    if (!svg) return

    const svgData = new XMLSerializer().serializeToString(svg)
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")
    const img = new Image()
    
    img.onload = () => {
      canvas.width = img.width
      canvas.height = img.height
      ctx?.drawImage(img, 0, 0)
      const pngFile = canvas.toDataURL("image/png")
      
      const downloadLink = document.createElement("a")
      downloadLink.download = "QR-Presensi-SDM.png"
      downloadLink.href = pngFile
      downloadLink.click()
    }
    
    img.src = "data:image/svg+xml;base64," + btoa(svgData)
  }

  // Fungsi Copy Text
  const handleCopy = () => {
    navigator.clipboard.writeText(qrValue)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Fungsi Cetak (Hanya area QR yang dicetak)
  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      
      {/* JUDUL PAGE (Akan hilang saat diprint) */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4 no-print">
        <div>
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <QrCode className="text-blue-600"/> QR Code Generator
            </h2>
            <p className="text-slate-500 text-sm">Cetak QR Code ini dan tempel di area kantor untuk absensi.</p>
        </div>
        <button onClick={() => setQrValue(DEFAULT_TOKEN)} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
            <RefreshCw size={14}/> Reset ke Default
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* PANEL KONTROL (Kiri - Hilang saat diprint) */}
        <div className="md:col-span-1 space-y-4 no-print">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Isi QR Code (Token)</label>
                <div className="flex gap-2 mb-2">
                    <input 
                        type="text" 
                        value={qrValue} 
                        onChange={(e) => setQrValue(e.target.value)} 
                        className="w-full border p-2 rounded text-sm font-mono bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                </div>
                <p className="text-xs text-amber-600 mb-4 bg-amber-50 p-2 rounded border border-amber-200">
                    ⚠️ Pastikan teks ini sama persis dengan <strong>SECRET_TOKEN</strong> di file Scanner HP. Jangan ubah jika ragu.
                </p>

                <div className="space-y-2">
                    <button onClick={handlePrint} className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 transition">
                        <Printer size={20}/> Cetak QR
                    </button>
                    <button onClick={downloadQR} className="w-full py-3 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg font-bold flex items-center justify-center gap-2 transition">
                        <Download size={20}/> Download PNG
                    </button>
                </div>
            </div>
        </div>

        {/* AREA PREVIEW QR (Kanan - Ini yang akan dicetak) */}
        <div className="md:col-span-2">
            <div id="printable-area" className="bg-white p-10 rounded-xl shadow-sm border border-slate-100 flex flex-col items-center justify-center min-h-[500px] text-center">
                
                {/* HEADER KERTAS */}
                <div className="mb-8">
                    <h1 className="text-4xl font-extrabold text-slate-900 mb-2">SCAN ABSENSI</h1>
                    <p className="text-slate-500 text-lg">Silakan scan QR Code di bawah ini untuk Check-In / Check-Out</p>
                </div>

                {/* QR CODE */}
                <div className="p-4 bg-white border-4 border-slate-900 rounded-xl mb-6">
                    <QRCode 
                        id="qr-code-svg"
                        value={qrValue} 
                        size={300} // Ukuran besar agar jelas saat diprint
                        level="H"  // High Error Correction
                    />
                </div>

                {/* FOOTER KERTAS */}
                <div className="mt-4 text-slate-400 text-sm font-mono">
                    <p>Sistem Presensi SDM Digital</p>
                    <p>{new Date().getFullYear()}</p>
                </div>

            </div>
        </div>

      </div>

      {/* CSS KHUSUS PRINT (Agar Sidebar Hilang & QR Jadi Tengah) */}
      <style jsx global>{`
        @media print {
            /* Sembunyikan semua elemen website */
            body * {
                visibility: hidden;
            }
            
            /* Sembunyikan tombol/navbar/sidebar yang punya class no-print */
            .no-print, nav, aside {
                display: none !important;
            }

            /* Hanya tampilkan area #printable-area */
            #printable-area, #printable-area * {
                visibility: visible;
            }

            /* Atur posisi agar pas di tengah kertas A4 */
            #printable-area {
                position: fixed;
                left: 0;
                top: 0;
                width: 100%;
                height: 100vh;
                margin: 0;
                padding: 0;
                border: none;
                display: flex;
                align-items: center;
                justify-content: center;
                background: white;
                z-index: 9999;
            }
        }
      `}</style>
    </div>
  )
}