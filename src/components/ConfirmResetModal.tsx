import React from 'react';
import { AlertCircle, RotateCcw, X } from 'lucide-react';

interface ConfirmResetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export const ConfirmResetModal: React.FC<ConfirmResetModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden transform transition-all scale-100">
        {/* Header */}
        <div className="bg-[#042453] text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-[#EDBC1B]" />
            <h3 className="text-base font-bold tracking-tight">
              Mulai berita baru?
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-300 hover:text-white p-1 rounded-md hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <div className="flex items-start gap-3 p-3.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-xs leading-relaxed">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <p>
              Semua naskah, hasil berita, gambar, dan caption akan dikosongkan. API key, model, dan Riwayat tidak dihapus.
            </p>
          </div>
          <p className="text-xs text-slate-500">
            Pastikan Anda telah menyalin atau mendownload hasil kerja Anda jika masih dibutuhkan.
          </p>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors shadow-2xs"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors shadow-2xs"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Ya, Reset</span>
          </button>
        </div>
      </div>
    </div>
  );
};
