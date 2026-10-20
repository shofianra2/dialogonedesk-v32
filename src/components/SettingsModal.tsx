import React, { useState, useEffect } from 'react';
import { X, Key, ExternalLink, CheckCircle2, AlertCircle, Eye, EyeOff, Cpu, Trash2, Save } from 'lucide-react';
import {
  getStoredApiKey,
  setStoredApiKey,
  clearStoredApiKey,
  getStoredModel,
  setStoredModel,
  testConnection,
} from '../utils/geminiApi';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsChanged: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onSettingsChanged,
}) => {
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gemini-3.5-flash-lite');
  const [showKey, setShowKey] = useState(false);
  const [testStatus, setTestStatus] = useState<{
    loading: boolean;
    success?: boolean;
    message?: string;
  }>({ loading: false });
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setApiKey(getStoredApiKey());
      setModel(getStoredModel());
      setTestStatus({ loading: false });
      setSaveFeedback(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    setStoredApiKey(apiKey);
    setStoredModel(model);
    setSaveFeedback('Pengaturan berhasil disimpan di browser!');
    onSettingsChanged();
    setTimeout(() => {
      setSaveFeedback(null);
    }, 2500);
  };

  const handleDelete = () => {
    clearStoredApiKey();
    setApiKey('');
    onSettingsChanged();
    setSaveFeedback('API key telah dihapus dari localStorage.');
    setTimeout(() => {
      setSaveFeedback(null);
    }, 2500);
  };

  const handleTestConnection = async () => {
    if (!apiKey.trim()) {
      setTestStatus({
        loading: false,
        success: false,
        message: 'Masukkan API key terlebih dahulu untuk mengetes koneksi.',
      });
      return;
    }

    setTestStatus({ loading: true, message: 'Mengetes koneksi ke Google Gemini...' });
    const result = await testConnection(apiKey.trim(), model.trim());
    setTestStatus({
      loading: false,
      success: result.success,
      message: result.message,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="bg-[#042453] text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Key className="w-5 h-5 text-[#EDBC1B]" />
            <h2 className="text-base font-bold tracking-tight">
              Pengaturan API & Model Gemini
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-300 hover:text-white p-1 rounded-md hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {saveFeedback && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs font-medium flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{saveFeedback}</span>
            </div>
          )}

          {/* API Key Field */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Google Gemini API Key
              </label>
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[#00ADE6] hover:text-[#042453] font-semibold flex items-center gap-1 hover:underline"
              >
                <span>Dapatkan API key gratis</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full text-sm font-mono px-3 py-2 pr-10 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00ADE6] focus:border-transparent"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                title={showKey ? 'Sembunyikan' : 'Tampilkan'}
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              API key disimpan secara lokal di browser Anda (localStorage) dan tidak pernah dikirim ke server pihak ketiga manapun.
            </p>
          </div>

          {/* Model Name Field */}
          <div>
            <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
              Model Gemini
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="gemini-3.5-flash-lite"
                  className="w-full text-sm font-mono px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00ADE6] focus:border-transparent"
                />
              </div>
            </div>
            {/* Quick model selectors */}
            <div className="mt-2 flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] text-slate-500">Pilihan cepat:</span>
              {[
                'gemini-3.5-flash-lite',
                'gemini-3.1-flash-lite',
                'gemini-3.8-flash',
              ].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setModel(m)}
                  className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
                    model === m
                      ? 'bg-[#00ADE6]/10 text-[#00ADE6] border-[#00ADE6] font-semibold'
                      : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Connection Test Output */}
          {testStatus.message && (
            <div
              className={`p-3 rounded-lg text-xs flex items-start gap-2 border ${
                testStatus.loading
                  ? 'bg-blue-50 text-blue-800 border-blue-200'
                  : testStatus.success
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border-rose-200'
              }`}
            >
              {testStatus.loading ? (
                <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin shrink-0 mt-0.5" />
              ) : testStatus.success ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
              )}
              <div className="flex-1 overflow-hidden">
                <p className="font-medium break-words text-xs leading-relaxed">{testStatus.message}</p>
              </div>
            </div>
          )}

          {/* Action Buttons Row */}
          <div className="pt-2 flex items-center justify-between border-t border-slate-100 gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testStatus.loading || !apiKey.trim()}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                <Cpu className="w-3.5 h-3.5" />
                <span>Tes Koneksi</span>
              </button>

              {apiKey && (
                <button
                  type="button"
                  onClick={handleDelete}
                  className="flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                  title="Hapus API Key dari browser"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Hapus</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#00ADE6] hover:bg-[#00ADE6]/90 rounded-lg shadow-xs transition-colors"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Simpan</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
