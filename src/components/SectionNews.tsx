import React, { useState, useEffect, useMemo } from 'react';
import {
  Sparkles,
  Copy,
  Check,
  Plus,
  Trash2,
  AlertTriangle,
  FileCheck,
  Share2,
  ExternalLink,
  ChevronRight,
  Maximize2,
  Scissors,
  Wand2,
} from 'lucide-react';
import {
  NewsResult,
  BacaJugaSlot,
  CategoryType,
  CATEGORIES,
  HistoryItem,
} from '../types';
import {
  countWords,
  countCharacters,
  formatNewsBody,
  cleanDescription,
  applyAhadRule,
} from '../utils/textUtils';
import {
  generateNews,
  getStoredApiKey,
  getStoredModel,
} from '../utils/geminiApi';
import { saveHistoryItem } from '../utils/historyStorage';

interface SectionNewsProps {
  rawText: string;
  setRawText: (val: string) => void;
  newsResult: NewsResult | null;
  setNewsResult: (val: NewsResult | null) => void;
  bacaJugaSlots: BacaJugaSlot[];
  setBacaJugaSlots: React.Dispatch<React.SetStateAction<BacaJugaSlot[]>>;
  includeBacaJugaInCopy: boolean;
  setIncludeBacaJugaInCopy: (val: boolean) => void;
  onOpenSettings: () => void;
  onNavigateToCover: () => void;
  onNavigateToSocial: () => void;
  cooldownRemaining: number;
  triggerCooldown: () => void;
  onHistoryUpdated: () => void;
}

export const SectionNews: React.FC<SectionNewsProps> = ({
  rawText,
  setRawText,
  newsResult,
  setNewsResult,
  bacaJugaSlots,
  setBacaJugaSlots,
  includeBacaJugaInCopy,
  setIncludeBacaJugaInCopy,
  onOpenSettings,
  onNavigateToCover,
  onNavigateToSocial,
  cooldownRemaining,
  triggerCooldown,
  onHistoryUpdated,
}) => {
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const apiKey = getStoredApiKey();
  const rawWordCount = countWords(rawText);
  const rawCharCount = countCharacters(rawText);

  // Compute total word count for judul + formatted body
  const { paragraphs, fullFormattedText } = useMemo(() => {
    if (!newsResult?.isi) return { paragraphs: [], fullFormattedText: '' };
    return formatNewsBody(newsResult.isi);
  }, [newsResult?.isi]);

  const totalWords = useMemo(() => {
    if (!newsResult) return 0;
    return countWords(`${newsResult.judul} ${fullFormattedText}`);
  }, [newsResult?.judul, fullFormattedText]);

  const isWordCountValid = totalWords >= 340 && totalWords <= 455;
  const isSourceTooShort = rawWordCount > 0 && rawWordCount < 120;

  // Initialize Baca Juga slots after every 3 paragraphs whenever newsResult changes
  const initializeBacaJugaSlots = (numParagraphs: number) => {
    const slots: BacaJugaSlot[] = [];
    // Slot after paragraph 3, 6, 9... except if it is the very last paragraph
    for (let p = 3; p < numParagraphs; p += 3) {
      slots.push({
        id: `slot-${p}-${Date.now()}`,
        afterParagraphIndex: p,
        title: '',
        url: '',
      });
    }
    setBacaJugaSlots(slots);
  };

  const handleCopy = (text: string, key: string, isHtml = false, htmlContent?: string) => {
    if (isHtml && htmlContent && navigator.clipboard && window.ClipboardItem) {
      const blobHtml = new Blob([htmlContent], { type: 'text/html' });
      const blobText = new Blob([text], { type: 'text/plain' });
      const item = new ClipboardItem({
        'text/html': blobHtml,
        'text/plain': blobText,
      });
      navigator.clipboard.write([item]).then(() => {
        setCopiedKey(key);
        setTimeout(() => setCopiedKey(null), 2000);
      });
      return;
    }

    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    });
  };

  // Perform Generation
  const executeGenerate = async (wordAdjustment?: 'longer' | 'shorter') => {
    if (!apiKey) {
      onOpenSettings();
      return;
    }
    if (!rawText.trim()) {
      setErrorMessage('Masukkan naskah mentah berita terlebih dahulu.');
      return;
    }
    if (cooldownRemaining > 0) return;

    setLoading(true);
    setErrorMessage(null);
    setLoadingStep('Mengirim naskah ke Google Gemini...');
    triggerCooldown();

    try {
      const model = getStoredModel();
      let result = await generateNews(rawText, apiKey, model, wordAdjustment);

      // Check word count
      const testFormat = formatNewsBody(result.isi);
      let calculatedWords = countWords(`${result.judul} ${testFormat.fullFormattedText}`);

      // Auto-retry rule: Maximum 1 time ONLY if under 300 or over 500 words
      if (!wordAdjustment && (calculatedWords < 300 || calculatedWords > 500)) {
        setLoadingStep(
          calculatedWords < 300
            ? 'Jumlah kata di bawah 300 kata, melakukan penyesuaian panjang otomatis (1x)...'
            : 'Jumlah kata melebihi 500 kata, melakukan pemadatan panjang otomatis (1x)...'
        );
        try {
          const adjusted = await generateNews(
            rawText,
            apiKey,
            model,
            calculatedWords < 300 ? 'longer' : 'shorter'
          );
          result = adjusted;
        } catch (_retryErr) {
          // If auto retry fails, proceed with initial result
        }
      }

      setNewsResult(result);
      const finalFormat = formatNewsBody(result.isi);
      initializeBacaJugaSlots(finalFormat.paragraphs.length);

      // Save to localStorage history
      const historyItem: HistoryItem = {
        id: `news-${Date.now()}`,
        timestamp: new Date().toISOString(),
        rawText,
        result,
        bacaJugaSlots: [],
        includeBacaJugaInCopy: true,
      };
      saveHistoryItem(historyItem);
      onHistoryUpdated();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Terjadi kesalahan saat memproses berita.');
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  // Construct Rich HTML content for copying Isi
  const generateIsiHtml = () => {
    if (!paragraphs.length) return '';
    let html = '';

    paragraphs.forEach((pText, index) => {
      const paragraphNum = index + 1;
      let pStyled = pText;
      if (index === 0) {
        // First paragraph bold prefix
        pStyled = pStyled.replace(
          /^DIALOGSATU\.COM\s*[-–—]\s*/,
          '<strong>DIALOGSATU.COM</strong> - '
        );
      }
      html += `<p>${pStyled}</p>\n`;

      // Check if there is a Baca Juga slot after this paragraph
      if (includeBacaJugaInCopy) {
        const slot = bacaJugaSlots.find(
          (s) => s.afterParagraphIndex === paragraphNum
        );
        if (slot && (slot.title || slot.url)) {
          const link = slot.url.trim()
            ? `<a href="${slot.url.trim()}" target="_blank" rel="noopener noreferrer">${slot.title || slot.url}</a>`
            : slot.title;
          html += `<p><strong>Baca juga: </strong>${link}</p>\n`;
        }
      }
    });

    return html;
  };

  // Construct Plain Text for copying Isi
  const generateIsiPlainText = () => {
    if (!paragraphs.length) return '';
    let lines: string[] = [];

    paragraphs.forEach((pText, index) => {
      const paragraphNum = index + 1;
      lines.push(pText);

      if (includeBacaJugaInCopy) {
        const slot = bacaJugaSlots.find(
          (s) => s.afterParagraphIndex === paragraphNum
        );
        if (slot && (slot.title || slot.url)) {
          const text = slot.url.trim()
            ? `Baca juga: ${slot.title} - ${slot.url.trim()}`
            : `Baca juga: ${slot.title}`;
          lines.push(text);
        }
      }
    });

    return lines.join('\n\n');
  };

  // Construct Full Pack for "Salin Semua"
  const handleCopyAll = () => {
    if (!newsResult) return;
    const pack = `JUDUL:
${newsResult.judul}

KATEGORI:
${newsResult.kategori}

DESKRIPSI:
${newsResult.deskripsi}

TAG:
${newsResult.tag.join(', ')}

ISI BERITA:
${generateIsiPlainText()}`;

    handleCopy(pack, 'all');
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* 1. Input Section: Raw Draft Textarea */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#00ADE6]" />
            <h2 className="text-sm font-bold text-[#042453] uppercase tracking-wider">
              Naskah Berita Mentah / Siaran Pers
            </h2>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500 font-mono-numbers">
            <span>{rawWordCount} kata</span>
            <span>·</span>
            <span>{rawCharCount} karakter</span>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <textarea
            id="raw-news-textarea"
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="Tempelkan draf berita mentah, siaran pers humas, atau rilis acara di sini..."
            rows={9}
            className="w-full text-sm leading-relaxed p-4 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00ADE6] focus:border-transparent resize-y text-slate-800 placeholder-slate-400 font-sans"
          />

          {isSourceTooShort && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
              <span>
                Naskah sumber relatif pendek ({rawWordCount} kata). AI dilarang menambah fakta baru, sehingga hasil mungkin di bawah target panjang.
              </span>
            </div>
          )}

          {errorMessage && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
              <div className="flex-1 overflow-hidden">
                <p className="font-semibold">Perhatian Redaksi</p>
                <p className="mt-1 break-words font-mono text-[11px] leading-relaxed bg-white/60 p-2 rounded border border-rose-200">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* Action Row */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
            <div>
              {!apiKey ? (
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="text-xs text-rose-600 font-semibold hover:underline flex items-center gap-1.5"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Isi API key Gemini (gratis) di Pengaturan</span>
                </button>
              ) : (
                <span className="text-xs text-slate-500">
                  Model: <strong className="text-slate-700 font-mono">{getStoredModel()}</strong> (1 permintaan)
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              {rawText && (
                <button
                  type="button"
                  onClick={() => setRawText('')}
                  disabled={loading}
                  className="px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Kosongkan
                </button>
              )}

              <button
                type="button"
                onClick={() => executeGenerate()}
                disabled={loading || !rawText.trim() || !apiKey || cooldownRemaining > 0}
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-bold text-white rounded-lg shadow-sm transition-all ${
                  loading || !rawText.trim() || !apiKey || cooldownRemaining > 0
                    ? 'bg-slate-400 cursor-not-allowed opacity-70'
                    : 'bg-[#00ADE6] hover:bg-[#00ADE6]/90 active:scale-[0.99]'
                }`}
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>{loadingStep || 'Sedang Memproses...'}</span>
                  </>
                ) : cooldownRemaining > 0 ? (
                  <>
                    <span>Tunggu ({cooldownRemaining}s)</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-[#EDBC1B]" />
                    <span>Generate Berita</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Output Section: Hasil Parafrase Redaksi */}
      {newsResult && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* Word Count Indicator Banner */}
          <div
            className={`p-4 rounded-xl border flex flex-col sm:flex-row items-center justify-between gap-3 ${
              isWordCountValid
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div
                className={`p-1.5 rounded-full ${
                  isWordCountValid ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                }`}
              >
                <FileCheck className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide">
                  Standar Redaksi DIALOGSATU.COM
                </p>
                <p className="text-sm font-semibold font-mono-numbers mt-0.5">
                  Total kata (judul + isi):{' '}
                  <span className="font-extrabold text-base">{totalWords}</span> / 340-455
                  {isWordCountValid ? (
                    <span className="ml-2 text-xs font-bold text-emerald-700">✓ Sesuai target</span>
                  ) : totalWords < 340 ? (
                    <span className="ml-2 text-xs font-bold text-rose-700">✕ Kurang dari target</span>
                  ) : (
                    <span className="ml-2 text-xs font-bold text-rose-700">✕ Melebihi target</span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!isWordCountValid && (
                <button
                  type="button"
                  onClick={() =>
                    executeGenerate(totalWords < 340 ? 'longer' : 'shorter')
                  }
                  disabled={loading || cooldownRemaining > 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-white text-rose-700 border border-rose-300 rounded-lg shadow-2xs hover:bg-rose-50 disabled:opacity-50"
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  <span>Perbaiki Panjang (1 permintaan)</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleCopyAll}
                className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold bg-[#042453] text-white rounded-lg shadow-2xs hover:bg-[#042453]/90 transition-colors"
              >
                {copiedKey === 'all' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>Salin Semua</span>
              </button>
            </div>
          </div>

          {/* Card: Judul Berita */}
          <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <span>Judul Berita</span>
                <span className="text-[11px] font-normal text-slate-500 font-mono-numbers">
                  ({countWords(newsResult.judul)} kata)
                </span>
              </label>
              <button
                type="button"
                onClick={() => handleCopy(newsResult.judul, 'judul')}
                className="flex items-center gap-1 text-xs text-[#00ADE6] hover:text-[#042453] font-semibold"
              >
                {copiedKey === 'judul' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>Salin Judul</span>
              </button>
            </div>
            <textarea
              value={newsResult.judul}
              onChange={(e) =>
                setNewsResult({
                  ...newsResult,
                  judul: applyAhadRule(e.target.value),
                })
              }
              rows={2}
              className="w-full text-base font-bold text-[#042453] p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00ADE6] leading-snug"
            />
          </div>

          {/* Card: Kategori, Deskripsi & Tag */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Kategori */}
            <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 space-y-2">
              <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                Kategori
              </label>
              <select
                value={newsResult.kategori}
                onChange={(e) =>
                  setNewsResult({
                    ...newsResult,
                    kategori: e.target.value as CategoryType,
                  })
                }
                className="w-full text-sm font-semibold text-slate-800 p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00ADE6]"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {/* Deskripsi (Meta SEO max 140) */}
            <div className="md:col-span-2 bg-white rounded-xl shadow-xs border border-slate-200 p-5 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <span>Deskripsi Ringkas (Maks 140 Karakter)</span>
                  <span
                    className={`text-[11px] font-mono-numbers font-semibold ${
                      newsResult.deskripsi.length > 140
                        ? 'text-rose-600'
                        : 'text-slate-500'
                    }`}
                  >
                    {newsResult.deskripsi.length}/140
                  </span>
                </label>
                <div className="flex items-center gap-2">
                  {newsResult.deskripsi.length > 140 && (
                    <button
                      type="button"
                      onClick={() =>
                        setNewsResult({
                          ...newsResult,
                          deskripsi: cleanDescription(newsResult.deskripsi, 140),
                        })
                      }
                      className="text-xs text-amber-700 hover:text-amber-800 font-medium flex items-center gap-1"
                    >
                      <Scissors className="w-3 h-3" />
                      <span>Pangkas Rapi</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleCopy(newsResult.deskripsi, 'deskripsi')}
                    className="flex items-center gap-1 text-xs text-[#00ADE6] hover:text-[#042453] font-semibold"
                  >
                    {copiedKey === 'deskripsi' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>Salin</span>
                  </button>
                </div>
              </div>
              <textarea
                value={newsResult.deskripsi}
                onChange={(e) =>
                  setNewsResult({
                    ...newsResult,
                    deskripsi: e.target.value,
                  })
                }
                rows={2}
                className="w-full text-xs text-slate-700 p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00ADE6]"
              />
            </div>
          </div>

          {/* Card: Tag Berita (Tepat 4) */}
          <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Tag Berita (Tepat 4 Tag)
              </label>
              <button
                type="button"
                onClick={() => handleCopy(newsResult.tag.join(', '), 'tag')}
                className="flex items-center gap-1 text-xs text-[#00ADE6] hover:text-[#042453] font-semibold"
              >
                {copiedKey === 'tag' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>Salin Semua Tag</span>
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {newsResult.tag.map((tagText, idx) => (
                <div key={idx} className="relative">
                  <input
                    type="text"
                    value={tagText}
                    onChange={(e) => {
                      const updated = [...newsResult.tag];
                      updated[idx] = applyAhadRule(e.target.value);
                      setNewsResult({ ...newsResult, tag: updated });
                    }}
                    placeholder={`Tag ${idx + 1}`}
                    className="w-full text-xs font-medium text-slate-800 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00ADE6]"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Card: Isi Berita Redaksi (2 Kalimat per Paragraf + Baca Juga) */}
          <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
            {/* Header Toolbar */}
            <div className="p-4 sm:px-6 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#00ADE6]" />
                <h3 className="text-xs font-bold text-[#042453] uppercase tracking-wider">
                  Isi Berita ({paragraphs.length} Paragraf · {countWords(fullFormattedText)} kata)
                </h3>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    const newSlot: BacaJugaSlot = {
                      id: `slot-manual-${Date.now()}`,
                      afterParagraphIndex: Math.max(1, paragraphs.length - 1),
                      title: '',
                      url: '',
                    };
                    setBacaJugaSlots([...bacaJugaSlots, newSlot]);
                  }}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-[#042453] bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-md transition-colors"
                >
                  <Plus className="w-3 h-3 text-[#042453]" />
                  <span>Tambah Slot Baca Juga</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handleCopy(
                      generateIsiPlainText(),
                      'isi-plain',
                      false
                    )
                  }
                  className="flex items-center gap-1 px-3 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors"
                >
                  {copiedKey === 'isi-plain' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>Salin Teks Polos</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handleCopy(
                      generateIsiPlainText(),
                      'isi-html',
                      true,
                      generateIsiHtml()
                    )
                  }
                  className="flex items-center gap-1.5 px-3 py-1 text-xs font-bold text-white bg-[#00ADE6] rounded-md hover:bg-[#00ADE6]/90 transition-colors shadow-2xs"
                >
                  {copiedKey === 'isi-html' ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>Salin (HTML)</span>
                </button>
              </div>
            </div>

            {/* Toggle bar for Baca juga */}
            <div className="px-6 py-2 bg-slate-100/70 border-b border-slate-200 flex items-center justify-between text-xs text-slate-600">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeBacaJugaInCopy}
                  onChange={(e) => setIncludeBacaJugaInCopy(e.target.checked)}
                  className="rounded border-slate-300 text-[#00ADE6] focus:ring-[#00ADE6] w-4 h-4"
                />
                <span className="font-medium text-slate-800">
                  Sertakan baris &quot;Baca juga:&quot; saat disalin
                </span>
              </label>
              <span className="text-[11px] text-slate-500 hidden sm:inline">
                Diawali <strong>DIALOGSATU.COM - </strong> dan 2 kalimat per paragraf
              </span>
            </div>

            {/* Body View & In-Place Editing */}
            <div className="p-6 space-y-4">
              {paragraphs.map((paraText, pIdx) => {
                const paragraphNumber = pIdx + 1;
                const slot = bacaJugaSlots.find(
                  (s) => s.afterParagraphIndex === paragraphNumber
                );

                return (
                  <React.Fragment key={pIdx}>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono-numbers">
                        <span>Paragraf {paragraphNumber}</span>
                        <span>{countWords(paraText)} kata</span>
                      </div>
                      <textarea
                        value={paraText}
                        onChange={(e) => {
                          const updated = [...paragraphs];
                          updated[pIdx] = applyAhadRule(e.target.value);
                          setNewsResult({
                            ...newsResult,
                            isi: updated.join('\n\n'),
                          });
                        }}
                        rows={2}
                        className="w-full text-sm leading-relaxed p-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00ADE6] text-slate-800 font-sans"
                      />
                    </div>

                    {/* Baca juga slot if attached after this paragraph */}
                    {slot && (
                      <div className="p-3.5 bg-[#FFF9E6] border-l-4 border-[#EDBC1B] rounded-r-lg space-y-2 text-xs shadow-2xs">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[#042453]">
                            Baca juga: [isi judul dan link artikel terkait]
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setBacaJugaSlots(
                                bacaJugaSlots.filter((s) => s.id !== slot.id)
                              );
                            }}
                            className="text-rose-600 hover:text-rose-700 flex items-center gap-1 font-semibold"
                            title="Hapus slot ini"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Hapus Slot</span>
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={slot.title}
                            onChange={(e) => {
                              const updated = bacaJugaSlots.map((s) =>
                                s.id === slot.id
                                  ? { ...s, title: e.target.value }
                                  : s
                              );
                              setBacaJugaSlots(updated);
                            }}
                            placeholder="Judul artikel terkait..."
                            className="w-full text-xs p-2 bg-white border border-amber-200 rounded focus:outline-none focus:ring-1 focus:ring-[#EDBC1B]"
                          />
                          <input
                            type="url"
                            value={slot.url}
                            onChange={(e) => {
                              const updated = bacaJugaSlots.map((s) =>
                                s.id === slot.id
                                  ? { ...s, url: e.target.value }
                                  : s
                              );
                              setBacaJugaSlots(updated);
                            }}
                            placeholder="URL artikel (https://dialogsatu.com/...)"
                            className="w-full text-xs p-2 bg-white border border-amber-200 rounded focus:outline-none focus:ring-1 focus:ring-[#EDBC1B]"
                          />
                        </div>
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Quick Jump Next Steps Banner */}
          <div className="p-4 bg-slate-100 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
            <span className="text-xs font-semibold text-slate-700">
              Berita telah siap. Lanjutkan ke pembuatan gambar sampul atau konten medsos:
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onNavigateToCover}
                className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-[#042453] bg-white border border-slate-300 hover:bg-slate-50 rounded-lg shadow-2xs"
              >
                <span>2. Gambar Cover</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={onNavigateToSocial}
                className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-[#00ADE6] hover:bg-[#00ADE6]/90 rounded-lg shadow-2xs"
              >
                <span>3. Konten Medsos</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
