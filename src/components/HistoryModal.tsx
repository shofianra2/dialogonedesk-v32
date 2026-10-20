import React from 'react';
import { X, History, Trash2, ArrowUpRight, Clock, FileText, Check } from 'lucide-react';
import { HistoryItem } from '../types';
import { deleteHistoryItem, clearAllHistory } from '../utils/historyStorage';
import { countWords } from '../utils/textUtils';

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  historyList: HistoryItem[];
  onSelectHistory: (item: HistoryItem) => void;
  onRefreshHistory: () => void;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({
  isOpen,
  onClose,
  historyList,
  onSelectHistory,
  onRefreshHistory,
}) => {
  if (!isOpen) return null;

  const [confirmClearAll, setConfirmClearAll] = React.useState(false);

  const handleDeleteOne = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    deleteHistoryItem(id);
    onRefreshHistory();
  };

  const handleClearAll = () => {
    if (!confirmClearAll) {
      setConfirmClearAll(true);
      setTimeout(() => setConfirmClearAll(false), 4000);
      return;
    }
    clearAllHistory();
    setConfirmClearAll(false);
    onRefreshHistory();
  };

  const formatTimestamp = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (_e) {
      return iso;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-[#042453] text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-[#EDBC1B]" />
            <h2 className="text-base font-bold tracking-tight">
              Riwayat Berita Redaksi (Maks 20 Item)
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-300 hover:text-white p-1 rounded-md hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Subheader / Info */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs text-slate-600 shrink-0">
          <span>Tersimpan lokal di browser (0 permintaan AI)</span>
          {historyList.length > 0 && (
            <button
              onClick={handleClearAll}
              className={`font-semibold flex items-center gap-1 transition-colors px-2 py-0.5 rounded ${
                confirmClearAll
                  ? 'bg-rose-600 text-white animate-pulse'
                  : 'text-rose-600 hover:text-rose-700 hover:underline'
              }`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{confirmClearAll ? 'Yakin Hapus Semua? Klik lagi' : 'Hapus Semua'}</span>
            </button>
          )}
        </div>

        {/* List Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-3">
          {historyList.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <FileText className="w-12 h-12 mx-auto stroke-1 mb-2 text-slate-300" />
              <p className="text-sm font-medium">Belum ada riwayat berita yang tersimpan.</p>
              <p className="text-xs text-slate-400 mt-1">
                Setiap berita yang digenerate akan otomatis tersimpan di sini.
              </p>
            </div>
          ) : (
            historyList.map((item) => {
              const wordCount = countWords(
                `${item.result.judul} ${item.result.isi}`
              );

              return (
                <div
                  key={item.id}
                  onClick={() => {
                    onSelectHistory(item);
                    onClose();
                  }}
                  className="group p-4 rounded-lg border border-slate-200 hover:border-[#00ADE6] hover:bg-slate-50/70 transition-all cursor-pointer relative"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 text-[11px] text-slate-500 mb-1">
                        <span className="font-semibold text-[#042453]">
                          {item.result.kategori}
                        </span>
                        <span>·</span>
                        <span className="flex items-center gap-1 font-mono-numbers">
                          <Clock className="w-3 h-3" />
                          {formatTimestamp(item.timestamp)}
                        </span>
                        <span>·</span>
                        <span className="font-mono-numbers font-medium text-slate-700">
                          {wordCount} kata
                        </span>
                      </div>

                      <h3 className="text-sm font-bold text-slate-900 group-hover:text-[#00ADE6] transition-colors line-clamp-2">
                        {item.result.judul}
                      </h3>

                      <p className="text-xs text-slate-500 line-clamp-1 mt-1">
                        {item.result.deskripsi || item.result.isi.slice(0, 120)}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => handleDeleteOne(e, item.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                        title="Hapus riwayat ini"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>

                      <div className="p-1.5 text-[#00ADE6] bg-[#00ADE6]/10 rounded group-hover:bg-[#00ADE6] group-hover:text-white transition-colors">
                        <ArrowUpRight className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-100 border-t border-slate-200 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
