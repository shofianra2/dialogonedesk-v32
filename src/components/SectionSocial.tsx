import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Share2,
  Copy,
  Check,
  Sparkles,
  Download,
  Upload,
  RotateCcw,
  AlertTriangle,
  Move,
  ZoomIn,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { NewsResult, SocialCaptions } from '../types';
import {
  generateSocialCaptions,
  getStoredApiKey,
  getStoredModel,
} from '../utils/geminiApi';
import {
  CropState,
  DecodedSource,
  CompressionResult,
  decodeAndOptimizeSource,
  createBlurredBackground,
  drawImageWithCrop,
  compressToTarget,
  exportToPngBlob,
  triggerDownload,
} from '../utils/canvasUtils';
import { slugify, applyAhadRule } from '../utils/textUtils';

interface SectionSocialProps {
  newsResult: NewsResult | null;
  sharedCoverImage: DecodedSource | null;
  onOpenSettings: () => void;
  cooldownRemaining: number;
  triggerCooldown: () => void;
  savedCaptions?: SocialCaptions;
  onCaptionsUpdated?: (captions: SocialCaptions) => void;
}

type SocialPlatform = 'facebook' | 'instagram' | 'tiktok' | 'youtube' | 'threads' | 'x';

export const SectionSocial: React.FC<SectionSocialProps> = ({
  newsResult,
  sharedCoverImage,
  onOpenSettings,
  cooldownRemaining,
  triggerCooldown,
  savedCaptions,
  onCaptionsUpdated,
}) => {
  // (A) Captions state
  const [captions, setCaptions] = useState<SocialCaptions | null>(
    savedCaptions || null
  );
  const [activePlatform, setActivePlatform] = useState<SocialPlatform>('facebook');
  const [loadingCaptions, setLoadingCaptions] = useState(false);
  const [captionError, setCaptionError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // (B) Social Crop 4:5 state (1080 x 1350 px)
  const [socialDecoded, setSocialDecoded] = useState<DecodedSource | null>(
    sharedCoverImage || null
  );
  const [cropMode, setCropMode] = useState<'crop' | 'blur'>('crop');
  const [zoom, setZoom] = useState<number>(1.0);

  const [stats, setStats] = useState<{
    sizeKb: number;
    quality: number;
    isWithinTarget: boolean;
  } | null>(null);

  const [isCompressingJpg, setIsCompressingJpg] = useState<boolean>(false);
  const [isExportingPng, setIsExportingPng] = useState<boolean>(false);
  const [imageErrorMessage, setImageErrorMessage] = useState<string | null>(null);

  // Mutable refs for 60FPS RAF gestures
  const cropRef = useRef<CropState>({
    mode: 'crop',
    zoom: 1.0,
    offsetX: 0,
    offsetY: 0,
  });

  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rafIdRef = useRef<number | null>(null);
  const debounceTimerRef = useRef<any>(null);
  const cachedBlurBgRef = useRef<HTMLCanvasElement | null>(null);

  // Pointer tracking
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStartDistRef = useRef<number>(0);
  const pinchStartZoomRef = useRef<number>(1.0);
  const isDraggingRef = useRef<boolean>(false);
  const lastSinglePointerRef = useRef<{ x: number; y: number } | null>(null);

  const cachedJpgBlobRef = useRef<Blob | null>(null);
  const apiKey = getStoredApiKey();

  // If shared cover image changed from Bagian 2 and social doesn't have an image, adopt it
  useEffect(() => {
    if (sharedCoverImage && !socialDecoded) {
      setSocialDecoded(sharedCoverImage);
    }
  }, [sharedCoverImage, socialDecoded]);

  // Render 4:5 Preview Frame via requestAnimationFrame (540 x 675 px)
  const requestRender = useCallback(() => {
    if (rafIdRef.current !== null) return;

    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      if (!socialDecoded || !previewCanvasRef.current) return;

      const canvas = previewCanvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      if (canvas.width !== 540 || canvas.height !== 675) {
        canvas.width = 540;
        canvas.height = 675;
      }

      drawImageWithCrop(
        ctx,
        socialDecoded.source,
        540,
        675,
        cropRef.current,
        cachedBlurBgRef.current,
        false
      );
    });
  }, [socialDecoded]);

  // Debounced estimation (600ms)
  const triggerDebouncedEstimation = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(async () => {
      if (!socialDecoded) return;
      try {
        const res: CompressionResult = await compressToTarget(
          socialDecoded.source,
          1080,
          1350,
          cropRef.current,
          cachedBlurBgRef.current,
          180 * 1024
        );
        cachedJpgBlobRef.current = res.blob;
        setStats({
          sizeKb: res.sizeKb,
          quality: res.quality,
          isWithinTarget: res.isWithinTarget,
        });
      } catch (e) {
        console.error('Debounced social estimation error:', e);
      }
    }, 600);
  }, [socialDecoded]);

  useEffect(() => {
    if (!socialDecoded) return;

    // Cache blurred background for 4:5 aspect ratio
    cachedBlurBgRef.current = createBlurredBackground(socialDecoded.source, 4, 5);

    cropRef.current = {
      mode: cropMode,
      zoom,
      offsetX: cropRef.current.offsetX,
      offsetY: cropRef.current.offsetY,
    };

    cachedJpgBlobRef.current = null;
    requestRender();
    triggerDebouncedEstimation();
  }, [socialDecoded, cropMode, requestRender, triggerDebouncedEstimation]);

  // Handle Generate Captions (1 request, based on paraphrased news)
  const handleGenerateCaptions = async () => {
    if (!newsResult) return;
    if (!apiKey) {
      onOpenSettings();
      return;
    }
    if (cooldownRemaining > 0) return;

    setLoadingCaptions(true);
    setCaptionError(null);
    triggerCooldown();

    try {
      const model = getStoredModel();
      const generated = await generateSocialCaptions(newsResult, apiKey, model);
      setCaptions(generated);
      if (onCaptionsUpdated) {
        onCaptionsUpdated(generated);
      }
    } catch (err: any) {
      setCaptionError(err?.message || 'Gagal menghasilkan caption media sosial.');
    } finally {
      setLoadingCaptions(false);
    }
  };

  const handleCopyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    });
  };

  const updateCaption = (platform: SocialPlatform, value: string) => {
    if (!captions) return;
    const cleanVal = applyAhadRule(value);
    const updated = { ...captions, [platform]: cleanVal };
    setCaptions(updated);
    if (onCaptionsUpdated) onCaptionsUpdated(updated);
  };

  // Upload new image in Section 3B
  const handleFileUpload = async (file: File) => {
    setImageErrorMessage(null);
    if (!file.type.match(/^image\/(jpeg|png|webp)/i)) {
      setImageErrorMessage('Format gambar harus JPG, PNG, atau WEBP.');
      return;
    }

    try {
      const decodedImg = await decodeAndOptimizeSource(file);
      setSocialDecoded(decodedImg);
      cropRef.current = {
        mode: cropMode,
        zoom: 1.0,
        offsetX: 0,
        offsetY: 0,
      };
      setZoom(1.0);
      cachedJpgBlobRef.current = null;
      setStats(null);
    } catch (err: any) {
      setImageErrorMessage(err?.message || 'Gagal memproses gambar.');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleResetCrop = () => {
    cropRef.current = {
      mode: cropMode,
      zoom: 1.0,
      offsetX: 0,
      offsetY: 0,
    };
    setZoom(1.0);
    cachedJpgBlobRef.current = null;
    requestRender();
    triggerDebouncedEstimation();
  };

  const handleSliderZoomChange = (val: number) => {
    setZoom(val);
    cropRef.current.zoom = val;
    cachedJpgBlobRef.current = null;
    requestRender();
    triggerDebouncedEstimation();
  };

  // POINTER EVENTS for 4:5 Preview Canvas
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!socialDecoded) return;
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);

    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointersRef.current.size === 1) {
      isDraggingRef.current = true;
      lastSinglePointerRef.current = { x: e.clientX, y: e.clientY };
    } else if (activePointersRef.current.size === 2) {
      const points = Array.from(activePointersRef.current.values());
      const dist = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      pinchStartDistRef.current = dist > 0 ? dist : 1;
      pinchStartZoomRef.current = cropRef.current.zoom;
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!socialDecoded || !activePointersRef.current.has(e.pointerId)) return;

    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointersRef.current.size === 1 && isDraggingRef.current && lastSinglePointerRef.current) {
      const dx = e.clientX - lastSinglePointerRef.current.x;
      const dy = e.clientY - lastSinglePointerRef.current.y;
      lastSinglePointerRef.current = { x: e.clientX, y: e.clientY };

      const targetW = 540;
      const targetH = 675;
      const baseScale = Math.max(targetW / socialDecoded.width, targetH / socialDecoded.height);
      const drawW = socialDecoded.width * baseScale * cropRef.current.zoom;
      const drawH = socialDecoded.height * baseScale * cropRef.current.zoom;

      const maxShiftX = Math.max(1, (drawW - targetW) / 2);
      const maxShiftY = Math.max(1, (drawH - targetH) / 2);

      const newOffsetX = Math.max(-1, Math.min(1, cropRef.current.offsetX + dx / maxShiftX));
      const newOffsetY = Math.max(-1, Math.min(1, cropRef.current.offsetY + dy / maxShiftY));

      cropRef.current.offsetX = newOffsetX;
      cropRef.current.offsetY = newOffsetY;

      cachedJpgBlobRef.current = null;
      requestRender();
      triggerDebouncedEstimation();
    } else if (activePointersRef.current.size === 2) {
      const points = Array.from(activePointersRef.current.values());
      const currentDist = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      if (pinchStartDistRef.current > 0) {
        const factor = currentDist / pinchStartDistRef.current;
        const newZoom = Math.max(1.0, Math.min(3.0, pinchStartZoomRef.current * factor));
        cropRef.current.zoom = newZoom;
        setZoom(newZoom);
        cachedJpgBlobRef.current = null;
        requestRender();
        triggerDebouncedEstimation();
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    activePointersRef.current.delete(e.pointerId);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (_e) {}

    if (activePointersRef.current.size < 2) {
      pinchStartDistRef.current = 0;
    }
    if (activePointersRef.current.size === 0) {
      isDraggingRef.current = false;
      lastSinglePointerRef.current = null;
      triggerDebouncedEstimation();
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!socialDecoded) return;
    e.preventDefault();
    const delta = -e.deltaY * 0.0015;
    const newZoom = Math.max(1.0, Math.min(3.0, cropRef.current.zoom + delta));
    cropRef.current.zoom = newZoom;
    setZoom(newZoom);
    cachedJpgBlobRef.current = null;
    requestRender();
    triggerDebouncedEstimation();
  };

  // Download JPG (target <= 180 KB)
  const handleDownloadJpg = async () => {
    if (!socialDecoded || isCompressingJpg) return;
    setIsCompressingJpg(true);

    try {
      let blobToDownload = cachedJpgBlobRef.current;
      if (!blobToDownload) {
        const res = await compressToTarget(
          socialDecoded.source,
          1080,
          1350,
          cropRef.current,
          cachedBlurBgRef.current,
          180 * 1024
        );
        blobToDownload = res.blob;
        setStats({
          sizeKb: res.sizeKb,
          quality: res.quality,
          isWithinTarget: res.isWithinTarget,
        });
      }

      const filename = `${slugify(newsResult?.judul || 'dialogsatu-medsos')}-4x5.jpg`;
      triggerDownload(blobToDownload, filename);
    } catch (err: any) {
      setImageErrorMessage(`Gagal mengompres JPG: ${err?.message || 'Error'}`);
    } finally {
      setIsCompressingJpg(false);
    }
  };

  // Download PNG
  const handleDownloadPng = async () => {
    if (!socialDecoded || isExportingPng) return;
    setIsExportingPng(true);

    try {
      const res = await exportToPngBlob(
        socialDecoded.source,
        1080,
        1350,
        cropRef.current,
        cachedBlurBgRef.current
      );
      const filename = `${slugify(newsResult?.judul || 'dialogsatu-medsos')}-4x5.png`;
      triggerDownload(res.blob, filename);
    } catch (err: any) {
      setImageErrorMessage(`Gagal mengekspor PNG: ${err?.message || 'Error'}`);
    } finally {
      setIsExportingPng(false);
    }
  };

  return (
    <div className="space-y-10 max-w-5xl mx-auto">
      {imageErrorMessage && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{imageErrorMessage}</span>
          </div>
          <button
            onClick={() => setImageErrorMessage(null)}
            className="text-xs text-rose-600 font-bold hover:underline"
          >
            Tutup
          </button>
        </div>
      )}

      {/* SECTION 3A: CAPTION MEDSOS */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
        <div className="p-6 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#00ADE6]" />
              <h2 className="text-sm font-bold text-[#042453] uppercase tracking-wider">
                3A. Caption Media Sosial (6 Platform)
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Dibuat otomatis dari hasil parafrase berita dengan awalan standar &quot;DIALOGSATU - &quot;.
            </p>
          </div>

          <button
            type="button"
            onClick={handleGenerateCaptions}
            disabled={!newsResult || loadingCaptions || cooldownRemaining > 0 || !apiKey}
            className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white rounded-lg shadow-xs transition-all ${
              !newsResult || loadingCaptions || cooldownRemaining > 0 || !apiKey
                ? 'bg-slate-400 cursor-not-allowed opacity-70'
                : 'bg-[#00ADE6] hover:bg-[#00ADE6]/90 active:scale-[0.99]'
            }`}
          >
            {loadingCaptions ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Menghasilkan Caption (1 Permintaan)...</span>
              </>
            ) : cooldownRemaining > 0 ? (
              <span>Tunggu ({cooldownRemaining}s)</span>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 text-[#EDBC1B]" />
                <span>Generate Caption Medsos</span>
              </>
            )}
          </button>
        </div>

        <div className="p-6 space-y-5">
          {!newsResult && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                Selesaikan naskah berita di <strong>1. Berita</strong> terlebih dahulu sebelum membuat caption medsos.
              </span>
            </div>
          )}

          {captionError && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1 overflow-hidden">
                <p className="font-semibold">Gagal Menghasilkan Caption</p>
                <p className="mt-1 break-words font-mono text-[11px] leading-relaxed bg-white/60 p-2 rounded border border-rose-200">
                  {captionError}
                </p>
              </div>
            </div>
          )}

          {captions ? (
            <div className="space-y-4">
              {/* Platform Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-slate-200 scrollbar-none">
                {[
                  { id: 'facebook', label: 'Facebook', badge: 'Informatif' },
                  { id: 'instagram', label: 'Instagram', badge: 'Hook + Hashtag' },
                  { id: 'tiktok', label: 'TikTok', badge: 'Santai & Singkat' },
                  { id: 'youtube', label: 'YouTube', badge: 'SEO Video' },
                  { id: 'threads', label: 'Threads', badge: 'Diskusi' },
                  { id: 'x', label: 'X (Twitter)', badge: 'Maks 280 Karakter' },
                ].map((item) => {
                  const isActive = activePlatform === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActivePlatform(item.id as SocialPlatform)}
                      className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-t-lg transition-all whitespace-nowrap shrink-0 border-b-2 ${
                        isActive
                          ? 'border-[#00ADE6] text-[#042453] bg-[#00ADE6]/10'
                          : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                      }`}
                    >
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Active Platform Editor */}
              {activePlatform === 'youtube' ? (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Judul Video YouTube (SEO)
                      </label>
                      <button
                        type="button"
                        onClick={() => handleCopyText(captions.youtubeTitle, 'yt-title')}
                        className="text-xs text-[#00ADE6] hover:text-[#042453] font-semibold flex items-center gap-1"
                      >
                        {copiedKey === 'yt-title' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>Salin Judul</span>
                      </button>
                    </div>
                    <input
                      type="text"
                      value={captions.youtubeTitle}
                      onChange={(e) => {
                        const updated = {
                          ...captions,
                          youtubeTitle: applyAhadRule(e.target.value),
                        };
                        setCaptions(updated);
                        if (onCaptionsUpdated) onCaptionsUpdated(updated);
                      }}
                      className="w-full text-sm font-semibold p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00ADE6]"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                          Deskripsi Video YouTube
                        </label>
                        <span className="text-[11px] font-mono-numbers text-slate-500">
                          ({captions.youtubeDescription.length} karakter)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopyText(captions.youtubeDescription, 'yt-desc')}
                        className="text-xs text-[#00ADE6] hover:text-[#042453] font-semibold flex items-center gap-1"
                      >
                        {copiedKey === 'yt-desc' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>Salin Deskripsi</span>
                      </button>
                    </div>
                    <textarea
                      value={captions.youtubeDescription}
                      onChange={(e) => {
                        const updated = {
                          ...captions,
                          youtubeDescription: applyAhadRule(e.target.value),
                        };
                        setCaptions(updated);
                        if (onCaptionsUpdated) onCaptionsUpdated(updated);
                      }}
                      rows={5}
                      className="w-full text-xs font-normal leading-relaxed p-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00ADE6]"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Caption {activePlatform.toUpperCase()}
                      </span>
                      <span
                        className={`text-[11px] font-mono-numbers font-semibold ${
                          activePlatform === 'x' && captions.x.length > 280
                            ? 'text-rose-600'
                            : 'text-slate-500'
                        }`}
                      >
                        {activePlatform === 'x'
                          ? `${captions.x.length} / 280 karakter`
                          : `${captions[activePlatform].length} karakter`}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        handleCopyText(captions[activePlatform], activePlatform)
                      }
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-[#00ADE6] hover:bg-[#00ADE6]/90 rounded-lg shadow-2xs transition-colors"
                    >
                      {copiedKey === activePlatform ? (
                        <Check className="w-3.5 h-3.5 text-white" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>Salin Caption</span>
                    </button>
                  </div>

                  <textarea
                    value={captions[activePlatform]}
                    onChange={(e) => updateCaption(activePlatform, e.target.value)}
                    rows={6}
                    className="w-full text-sm leading-relaxed p-3.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00ADE6] text-slate-800"
                  />

                  {activePlatform === 'x' && captions.x.length > 280 && (
                    <p className="text-xs text-rose-600 font-semibold flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>Melebihi batas 280 karakter X (Twitter). Silakan ringkas teks di atas.</span>
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-400">
              <Share2 className="w-10 h-10 mx-auto stroke-1 mb-2 text-slate-300" />
              <p className="text-xs font-medium">Belum ada caption medsos yang dihasilkan.</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Klik tombol &quot;Generate Caption Medsos&quot; di atas untuk membuat variasi 6 platform.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* SECTION 3B: CROP GAMBAR MEDSOS (1080 x 1350 px, Rasio 4:5) */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
        <div className="p-6 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#EDBC1B]" />
              <h2 className="text-sm font-bold text-[#042453] uppercase tracking-wider">
                3B. Crop Gambar Medsos (1080 x 1350 px · Rasio 4:5)
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Standar redaksi: Tepat <strong>1080 x 1350 px</strong> (rasio 4:5), kompresi JPEG maksimal <strong>180 KB</strong>. 60FPS responsif dan mulus.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {sharedCoverImage && (
              <button
                type="button"
                onClick={() => {
                  setSocialDecoded(sharedCoverImage);
                  handleResetCrop();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#042453] bg-amber-100 hover:bg-amber-200 rounded-lg transition-colors shadow-2xs"
              >
                <ImageIcon className="w-3.5 h-3.5 text-[#042453]" />
                <span>Gunakan Gambar dari Bagian 2</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors shadow-2xs"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Upload Gambar Baru</span>
            </button>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              handleFileUpload(e.target.files[0]);
            }
          }}
          className="hidden"
        />

        <div className="p-6">
          {!socialDecoded ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 hover:border-[#00ADE6] rounded-xl p-10 text-center cursor-pointer bg-slate-50 transition-colors"
            >
              <Upload className="w-10 h-10 mx-auto text-slate-400 mb-2" />
              <p className="text-xs font-bold text-slate-700">
                Pilih atau unggah gambar untuk dipotong ke ukuran 1080 x 1350 px
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                Atau gunakan tombol &quot;Gunakan Gambar dari Bagian 2&quot; jika sudah mengunggah di atas.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Controls */}
              <div className="space-y-4">
                <div>
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider block mb-1">
                    Informasi Sumber
                  </span>
                  <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg space-y-1 font-mono-numbers">
                    <p>
                      Ukuran Asli:{' '}
                      <strong>
                        {socialDecoded.naturalWidth} × {socialDecoded.naturalHeight} px
                      </strong>
                    </p>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-800 uppercase tracking-wider block mb-2">
                    Mode Kanvas 4:5
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setCropMode('crop')}
                      className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-all text-center ${
                        cropMode === 'crop'
                          ? 'bg-[#00ADE6] text-white border-[#00ADE6] shadow-xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      Perbesar + Crop
                    </button>
                    <button
                      type="button"
                      onClick={() => setCropMode('blur')}
                      className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-all text-center ${
                        cropMode === 'blur'
                          ? 'bg-[#00ADE6] text-white border-[#00ADE6] shadow-xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      Perluas Latar (blur)
                    </button>
                  </div>
                </div>

                {/* Zoom Slider */}
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between text-xs font-medium text-slate-700">
                    <span className="flex items-center gap-1 font-semibold">
                      <ZoomIn className="w-3.5 h-3.5 text-[#00ADE6]" />
                      <span>Zoom: {zoom.toFixed(2)}x</span>
                    </span>
                    <button
                      type="button"
                      onClick={handleResetCrop}
                      className="text-[11px] text-slate-500 hover:text-slate-800 flex items-center gap-1 font-medium hover:underline"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Atur Ulang</span>
                    </button>
                  </div>
                  <input
                    type="range"
                    min="1.0"
                    max="3.0"
                    step="0.05"
                    value={zoom}
                    onChange={(e) => handleSliderZoomChange(parseFloat(e.target.value))}
                    className="w-full accent-[#00ADE6] cursor-pointer"
                  />
                  <p className="text-[11px] text-slate-400">
                    Drag langsung pada gambar untuk geser posisi. Scroll mouse atau cubit 2 jari di HP untuk zoom.
                  </p>
                </div>

                {/* Download Actions */}
                <div className="pt-2 border-t border-slate-100 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadJpg}
                    disabled={isCompressingJpg}
                    className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-bold text-white rounded-lg shadow-2xs transition-all ${
                      isCompressingJpg
                        ? 'bg-slate-400 cursor-not-allowed'
                        : 'bg-[#00ADE6] hover:bg-[#00ADE6]/90 active:scale-[0.99]'
                    }`}
                  >
                    {isCompressingJpg ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Mengompres JPG...</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-3.5 h-3.5" />
                        <span>Download JPG (1080 x 1350)</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadPng}
                    disabled={isExportingPng}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download PNG (1080 x 1350)</span>
                  </button>

                  {stats && (
                    <div className="mt-1 text-[11px] font-mono-numbers flex items-center gap-1.5 text-slate-600">
                      {stats.isWithinTarget ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      ) : (
                        <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      )}
                      <span>
                        JPG: {stats.sizeKb} KB (Kualitas {stats.quality}%) | Maks 180 KB
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Viewport 4:5 */}
              <div className="md:col-span-2 flex flex-col items-center">
                <div
                  className="relative bg-slate-900 rounded-lg shadow-md overflow-hidden select-none cursor-grab active:cursor-grabbing w-full max-w-[340px] aspect-[4/5] flex items-center justify-center"
                  style={{ touchAction: 'none' }}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  onWheel={handleWheel}
                >
                  <canvas ref={previewCanvasRef} className="w-full h-full object-cover pointer-events-none" />

                  <div className="absolute bottom-2 left-2 px-2.5 py-1 bg-black/60 backdrop-blur-xs rounded-md text-[10px] text-white pointer-events-none flex items-center gap-1.5 shadow-xs">
                    <Move className="w-3 h-3 text-[#EDBC1B]" />
                    <span>Drag untuk geser · Scroll / cubit untuk zoom</span>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 font-mono-numbers mt-2">
                  Format vertikal 1080 x 1350 px (4:5)
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
