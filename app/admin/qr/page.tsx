'use client';
import { useEffect, useState } from 'react';
import QRCode from 'react-qr-code';

export default function QRGeneratorPage() {
  // KODE RAHASIA (Token yang harus di-scan staff)
  // Ganti ini sesuka hati, asal sama dengan logic di halaman Scan nanti
  const QR_TOKEN = "ABSENSI-SDM-TOKEN-RAHASIA-2026"; 

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white p-8 text-center print:p-0">
      <div className="border-4 border-black p-8 rounded-xl print:border-0 max-w-sm w-full">
        <h1 className="mb-2 text-2xl font-bold uppercase tracking-widest text-black">
          SCAN UNTUK PRESENSI
        </h1>
        <p className="mb-6 text-sm text-gray-500 font-mono">SDM ATTENDANCE SYSTEM</p>

        <div className="bg-white p-2 flex justify-center border-2 border-dashed border-gray-300 rounded-lg">
            <QRCode 
                value={QR_TOKEN} 
                size={256} 
                style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                viewBox={`0 0 256 256`}
            />
        </div>

        <p className="mt-6 text-xs text-gray-400">
          Arahkan kamera aplikasi ke QR Code ini.
        </p>
      </div>

      <button 
        onClick={() => window.print()}
        className="mt-10 rounded bg-black px-6 py-3 text-white hover:bg-gray-800 print:hidden font-bold"
      >
        🖨️ Cetak QR Code
      </button>

      <style jsx global>{`
        @media print {
          body * { visibility: hidden; }
          #qr-area, #qr-area * { visibility: visible; }
        }
      `}</style>
    </div>
  );
}