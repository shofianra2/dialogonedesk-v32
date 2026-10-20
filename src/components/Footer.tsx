import React from 'react';
import { Cpu, Calendar, ShieldCheck } from 'lucide-react';

interface FooterProps {
  sessionCount: number;
  dailyCount: number;
}

export const Footer: React.FC<FooterProps> = ({ sessionCount, dailyCount }) => {
  return (
    <footer className="mt-16 bg-[#042453] text-slate-300 border-t border-[#042453]/80 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Logo & Platform Info */}
          <div className="flex items-center gap-3">
            <div className="bg-white px-2.5 py-1 rounded-md shadow-xs flex items-center justify-center">
              <img
                src="/LOGO-DIALOGSATU-2025.svg"
                alt="DIALOGSATU.COM"
                className="h-6 w-auto object-contain"
                onError={(e) => {
                  (e.currentTarget as HTMLElement).style.display = 'none';
                }}
              />
            </div>
            <div>
              <p className="text-xs font-semibold text-white">
                DialogOneDesk V3.2
              </p>
              <p className="text-[11px] text-slate-400">
                Sistem Redaksi Digital Terintegrasi DIALOGSATU.COM
              </p>
            </div>
          </div>

          {/* AI Request Quota Indicators (Hemat Kuota) */}
          <div className="flex items-center gap-4 text-xs font-mono-numbers">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg">
              <Cpu className="w-3.5 h-3.5 text-[#00ADE6]" />
              <span className="text-slate-300">Permintaan AI sesi ini:</span>
              <strong className="text-white font-bold">{sessionCount}</strong>
            </div>

            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg">
              <Calendar className="w-3.5 h-3.5 text-[#EDBC1B]" />
              <span className="text-slate-300">Permintaan hari ini:</span>
              <strong className="text-[#EDBC1B] font-bold">{dailyCount}</strong>
            </div>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-400 gap-2">
          <p>© {new Date().getFullYear()} DialogOneDesk</p>
          <div className="flex items-center gap-2">
            <span>BERITA</span>
            <span>·</span>
            <span>FAKTA</span>
            <span>·</span>
            <span>PERSPEKTIF</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
