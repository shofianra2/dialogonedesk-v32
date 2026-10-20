import React from 'react';
import { Settings, History, RotateCcw, Newspaper, Image as ImageIcon, Share2 } from 'lucide-react';

interface HeaderProps {
  activeTab: 'news' | 'cover' | 'social';
  onSelectTab: (tab: 'news' | 'cover' | 'social') => void;
  onOpenSettings: () => void;
  onOpenHistory: () => void;
  onReset: () => void;
  hasNewsResult: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onSelectTab,
  onOpenSettings,
  onOpenHistory,
  onReset,
  hasNewsResult,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-[#042453] text-white shadow-md border-b border-[#042453]/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Zone 1: Logo & Brand */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="bg-white px-2.5 py-1 rounded-md shadow-xs flex items-center justify-center">
            <img
              src="/LOGO-DIALOGSATU-2025.svg"
              alt="DIALOGSATU.COM"
              className="h-7 w-auto object-contain"
              onError={(e) => {
                // In case SVG is blocked or loading, fallback gracefully
                (e.currentTarget as HTMLElement).style.display = 'none';
              }}
            />
            <span className="font-extrabold text-sm tracking-tight text-[#042453] sr-only">
              DIALOGSATU.COM
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-2">
            <span className="text-sm font-semibold tracking-wide text-white">
              DialogOneDesk
            </span>
            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-[#EDBC1B] text-[#042453]">
              V3.2
            </span>
          </div>
        </div>

        {/* Zone 2: Workflow Steps Navigation */}
        <nav className="flex items-center gap-1 sm:gap-2 overflow-x-auto py-1 scrollbar-none">
          <button
            onClick={() => onSelectTab('news')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'news'
                ? 'bg-[#00ADE6] text-white shadow-xs'
                : 'text-slate-200 hover:text-white hover:bg-white/10'
            }`}
          >
            <Newspaper className="w-4 h-4 shrink-0" />
            <span>1. Berita</span>
          </button>

          <button
            onClick={() => onSelectTab('cover')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'cover'
                ? 'bg-[#00ADE6] text-white shadow-xs'
                : 'text-slate-200 hover:text-white hover:bg-white/10'
            }`}
          >
            <ImageIcon className="w-4 h-4 shrink-0" />
            <span>2. Gambar Cover</span>
            {hasNewsResult && (
              <span className="w-1.5 h-1.5 rounded-full bg-[#EDBC1B]" />
            )}
          </button>

          <button
            onClick={() => onSelectTab('social')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'social'
                ? 'bg-[#00ADE6] text-white shadow-xs'
                : 'text-slate-200 hover:text-white hover:bg-white/10'
            }`}
          >
            <Share2 className="w-4 h-4 shrink-0" />
            <span>3. Konten Medsos</span>
            {hasNewsResult && (
              <span className="w-1.5 h-1.5 rounded-full bg-[#EDBC1B]" />
            )}
          </button>
        </nav>

        {/* Zone 3: Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onOpenHistory}
            title="Buka Riwayat Berita (Tanpa AI)"
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <History className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden md:inline">Riwayat</span>
          </button>

          <button
            onClick={onReset}
            title="Reset naskah saat ini"
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden md:inline">Reset</span>
          </button>

          <button
            onClick={onOpenSettings}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#042453] bg-[#EDBC1B] hover:bg-[#EDBC1B]/90 rounded-lg transition-colors shadow-xs whitespace-nowrap shrink-0"
          >
            <Settings className="w-3.5 h-3.5 shrink-0" />
            <span>Pengaturan</span>
          </button>
        </div>
      </div>
    </header>
  );
};
