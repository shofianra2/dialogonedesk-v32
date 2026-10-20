import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Upload,
  Download,
  RotateCcw,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  ZoomIn,
  Move,
} from 'lucide-react';
import {
  CropState,
  DecodedSource,
  CompressionResult,
  decodeAndOptimizeSource,
  createBlurredBackground,
  drawImageWithCrop,
  compressToTarget,
  triggerDownload,
} from '../utils/canvasUtils';
import { slugify } from '../utils/textUtils';

interface SectionCoverImageProps {
  newsTitle?: string;
  onShareImageToSocial?: (img: DecodedSource) => void;
}

export const SectionCoverImage: React.FC<SectionCoverImageProps> = ({
  newsTitle,
  onShareImageToSocial,
}) => {
  const [decoded, setDecoded] = useState<DecodedSource | null>(null);
  const [cropMode, setCropMode] = useState<'crop' | 'blur'>('crop');
  const [zoom, setZoom] = useState<number>(1.0);

  // Status estimation for the info badge
  const [stats, setStats] = useState<{
    sizeKb: number;
    quality: number;
    isWithinTarget: boolean;
  } | null>(null);

  const [isCompressing, setIsCompressing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Mutable refs for high-frequency 60fps gesture handling
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

  // Pointer tracking for drag & pinch
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStartDistRef = useRef<number>(0);
  const pinchStartZoomRef = useRef<number>(1.0);
  const isDraggingRef = useRef<boolean>(false);
  const lastSinglePointerRef = useRef<{ x: number; y: number } | null>(null);

  // Cached export blob if already compressed
  const cachedBlobRef = useRef<Blob | null>(null);

  // 1. Render Preview Frame via requestAnimationFrame
  const requestRender = useCallback(() => {
    if (rafIdRef.current !== null) return;

    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      if (!decoded || !previewCanvasRef.current) return;

      const canvas = previewCanvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Preview canvas is lightweight 720 x 480 px (3:2)
      if (canvas.width !== 720 || canvas.height !== 480) {
        canvas.width = 720;
        canvas.height = 480;
      }

      drawImageWithCrop(
        ctx,
        decoded.source,
        720,
        480,
        cropRef.current,
        cachedBlurBgRef.current,
        false
      );
    });
  }, [decoded]);

  // 2. Debounced background compression estimator (600ms after user stops moving)
  const triggerDebouncedEstimation = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(async () => {
      if (!decoded) return;
      try {
        const res: CompressionResult = await compressToTarget(
          decoded.source,
          1200,
          800,
          cropRef.current,
          cachedBlurBgRef.current,
          180 * 1024
        );
        cachedBlobRef.current = res.blob;
        setStats({
          sizeKb: res.sizeKb,
          quality: res.quality,
          isWithinTarget: res.isWithinTarget,
        });
      } catch (e) {
        console.error('Debounced estimation error:', e);
      }
    }, 600);
  }, [decoded]);

  // When source or mode changes
  useEffect(() => {
    if (!decoded) return;

    // Cache blurred background once for this source
    cachedBlurBgRef.current = createBlurredBackground(decoded.source, 3, 2);

    cropRef.current = {
      mode: cropMode,
      zoom,
      offsetX: cropRef.current.offsetX,
      offsetY: cropRef.current.offsetY,
    };

    cachedBlobRef.current = null;
    requestRender();
    triggerDebouncedEstimation();
  }, [decoded, cropMode, requestRender, triggerDebouncedEstimation]);

  // File Upload Handler (< 1s display)
  const handleFileUpload = async (file: File) => {
    setErrorMessage(null);
    if (!file.type.match(/^image\/(jpeg|png|webp)/i)) {
      setErrorMessage('Format gambar harus JPG, PNG, atau WEBP.');
      return;
    }

    try {
      const decodedImg = await decodeAndOptimizeSource(file);
      setDecoded(decodedImg);

      // Default center crop
      cropRef.current = {
        mode: cropMode,
        zoom: 1.0,
        offsetX: 0,
        offsetY: 0,
      };
      setZoom(1.0);
      cachedBlobRef.current = null;
      setStats(null);

      if (onShareImageToSocial) {
        onShareImageToSocial(decodedImg);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Gagal memproses gambar.');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  // Reset Crop to center and 1.0x
  const handleResetCrop = () => {
    cropRef.current = {
      mode: cropMode,
      zoom: 1.0,
      offsetX: 0,
      offsetY: 0,
    };
    setZoom(1.0);
    cachedBlobRef.current = null;
    requestRender();
    triggerDebouncedEstimation();
  };

  // Slider Zoom change
  const handleSliderZoomChange = (val: number) => {
    setZoom(val);
    cropRef.current.zoom = val;
    cachedBlobRef.current = null;
    requestRender();
    triggerDebouncedEstimation();
  };

  // POINTER EVENTS: Direct Drag & Pinch-to-zoom on preview canvas
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!decoded) return;
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);

    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointersRef.current.size === 1) {
      isDraggingRef.current = true;
      lastSinglePointerRef.current = { x: e.clientX, y: e.clientY };
    } else if (activePointersRef.current.size === 2) {
      // Start 2-finger pinch
      const points = Array.from(activePointersRef.current.values());
      const dist = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      pinchStartDistRef.current = dist > 0 ? dist : 1;
      pinchStartZoomRef.current = cropRef.current.zoom;
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!decoded || !activePointersRef.current.has(e.pointerId)) return;

    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointersRef.current.size === 1 && isDraggingRef.current && lastSinglePointerRef.current) {
      const dx = e.clientX - lastSinglePointerRef.current.x;
      const dy = e.clientY - lastSinglePointerRef.current.y;
      lastSinglePointerRef.current = { x: e.clientX, y: e.clientY };

      // Calculate max pan displacement on the 720x480 preview canvas
      const targetW = 720;
      const targetH = 480;
      const baseScale = Math.max(targetW / decoded.width, targetH / decoded.height);
      const drawW = decoded.width * baseScale * cropRef.current.zoom;
      const drawH = decoded.height * baseScale * cropRef.current.zoom;

      const maxShiftX = Math.max(1, (drawW - targetW) / 2);
      const maxShiftY = Math.max(1, (drawH - targetH) / 2);

      // Delta relative offset
      const newOffsetX = Math.max(-1, Math.min(1, cropRef.current.offsetX + dx / maxShiftX));
      const newOffsetY = Math.max(-1, Math.min(1, cropRef.current.offsetY + dy / maxShiftY));

      cropRef.current.offsetX = newOffsetX;
      cropRef.current.offsetY = newOffsetY;

      cachedBlobRef.current = null;
      requestRender();
      triggerDebouncedEstimation();
    } else if (activePointersRef.current.size === 2) {
      // 2-finger pinch zoom
      const points = Array.from(activePointersRef.current.values());
      const currentDist = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      if (pinchStartDistRef.current > 0) {
        const factor = currentDist / pinchStartDistRef.current;
        const newZoom = Math.max(1.0, Math.min(3.0, pinchStartZoomRef.current * factor));
        cropRef.current.zoom = newZoom;
        setZoom(newZoom);
        cachedBlobRef.current = null;
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

  // Mouse wheel scroll to zoom
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!decoded) return;
    e.preventDefault();
    const delta = -e.deltaY * 0.0015;
    const newZoom = Math.max(1.0, Math.min(3.0, cropRef.current.zoom + delta));
    cropRef.current.zoom = newZoom;
    setZoom(newZoom);
    cachedBlobRef.current = null;
    requestRender();
    triggerDebouncedEstimation();
  };

  // Download JPG Button (Compresses on click, target <= 180 KB)
  const handleDownload = async () => {
    if (!decoded || isCompressing) return;
    setIsCompressing(true);

    try {
      let blobToDownload = cachedBlobRef.current;
      if (!blobToDownload) {
        const res = await compressToTarget(
          decoded.source,
          1200,
          800,
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

      const filename = `${slugify(newsTitle || 'cover-dialogsatu')}.jpg`;
      triggerDownload(blobToDownload, filename);
    } catch (err: any) {
      setErrorMessage(`Gagal mengompres gambar: ${err?.message || 'Error'}`);
    } finally {
      setIsCompressing(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {errorMessage && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-xs text-rose-600 font-bold hover:underline"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Header Info */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-[#042453] uppercase tracking-wider flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-[#00ADE6]" />
            <span>Bagian 2: Gambar Cover Berita</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Standar redaksi: Tepat <strong>1200 x 800 px</strong> (rasio 3:2), kompresi JPEG maksimal <strong>180 KB</strong>. Olah gambar langsung di peramban (tanpa AI).
          </p>
        </div>

        {decoded && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetCrop}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors shadow-2xs"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Atur Ulang Posisi Crop</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#042453] bg-amber-100 hover:bg-amber-200 rounded-lg transition-colors shadow-2xs"
            >
              <Upload className="w-3.5 h-3.5 text-[#042453]" />
              <span>Ganti Gambar</span>
            </button>
          </div>
        )}
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

      {/* Upload Zone if no image loaded */}
      {!decoded && (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-slate-300 hover:border-[#00ADE6] hover:bg-sky-50/40 rounded-xl p-12 text-center cursor-pointer transition-all bg-white"
        >
          <div className="w-14 h-14 bg-slate-100 text-[#00ADE6] rounded-full flex items-center justify-center mx-auto mb-4">
            <Upload className="w-7 h-7" />
          </div>
          <p className="text-sm font-bold text-slate-800">
            Tarik & Lepas Gambar ke Sini atau Klik untuk Memilih File
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Mendukung file JPG, PNG, atau WEBP. Pratinjau instan dalam &lt; 1 detik ke ukuran 1200 x 800 px.
          </p>
        </div>
      )}

      {/* Workspace when image is uploaded */}
      {decoded && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Controls Column */}
          <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 space-y-5">
            <div>
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider block mb-1">
                Informasi Sumber
              </span>
              <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg space-y-1 font-mono-numbers">
                <p>
                  Ukuran Asli:{' '}
                  <strong>
                    {decoded.naturalWidth} × {decoded.naturalHeight} px
                  </strong>
                </p>
                <p>
                  Rasio Asli:{' '}
                  {(decoded.naturalWidth / decoded.naturalHeight).toFixed(2)}:1
                </p>
              </div>
            </div>

            {/* Mode Selection */}
            <div>
              <label className="text-xs font-bold text-slate-800 uppercase tracking-wider block mb-2">
                Mode Penyesuaian Kanvas
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
              <p className="text-[11px] text-slate-500 mt-1.5">
                {cropMode === 'crop'
                  ? 'Gambar menutupi 1200x800 penuh tanpa celah kosong.'
                  : 'Latar blur dibuat sekali dan foto utama tajam di tengah.'}
              </p>
            </div>

            {/* Zoom Slider */}
            <div className="pt-2 border-t border-slate-100 space-y-2">
              <div className="flex items-center justify-between text-xs font-medium text-slate-700">
                <span className="flex items-center gap-1 font-semibold">
                  <ZoomIn className="w-3.5 h-3.5 text-[#00ADE6]" />
                  <span>Zoom Skala</span>
                </span>
                <span className="font-mono-numbers font-bold text-slate-800">
                  {zoom.toFixed(2)}x
                </span>
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
                Tip: Geser / drag langsung pada gambar untuk atur posisi. Scroll mouse atau cubit 2 jari di HP untuk zoom.
              </p>
            </div>

            {/* Download Button */}
            <div className="pt-2 border-t border-slate-100 space-y-2">
              <button
                type="button"
                onClick={handleDownload}
                disabled={isCompressing}
                className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-white rounded-lg shadow-sm transition-all ${
                  isCompressing
                    ? 'bg-slate-400 cursor-not-allowed'
                    : 'bg-[#00ADE6] hover:bg-[#00ADE6]/90 active:scale-[0.99]'
                }`}
              >
                {isCompressing ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Mengompres...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>Download JPG (1200 x 800)</span>
                  </>
                )}
              </button>
              <p className="text-[11px] text-center text-slate-400">
                Maksimal 180 KB. Nama file dari slug judul berita, tanpa watermark.
              </p>
            </div>
          </div>

          {/* Preview Column */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
              <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs font-semibold text-slate-700">
                <span>Pratinjau Langsung (Drag / Scroll / Cubit)</span>
                <span className="text-slate-500 font-mono-numbers">1200 × 800 px</span>
              </div>

              {/* 60FPS Interactive Canvas Viewport */}
              <div
                className="relative bg-slate-900 overflow-hidden aspect-[3/2] flex items-center justify-center select-none cursor-grab active:cursor-grabbing"
                style={{ touchAction: 'none' }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onWheel={handleWheel}
              >
                <canvas
                  ref={previewCanvasRef}
                  className="w-full h-full object-cover pointer-events-none"
                />

                <div className="absolute bottom-2 left-2 px-2.5 py-1 bg-black/60 backdrop-blur-xs rounded-md text-[11px] text-white pointer-events-none flex items-center gap-1.5 shadow-xs">
                  <Move className="w-3 h-3 text-[#EDBC1B]" />
                  <span>Drag untuk geser · Scroll / cubit untuk zoom</span>
                </div>
              </div>

              {/* Status Strip: Final size, file size, quality (Updated via Debounce / Download) */}
              <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between flex-wrap gap-2">
                {stats ? (
                  <div className="flex items-center gap-2 text-xs font-semibold font-mono-numbers">
                    <span
                      className={`flex items-center gap-1.5 ${
                        stats.isWithinTarget ? 'text-emerald-700' : 'text-amber-700'
                      }`}
                    >
                      {stats.isWithinTarget ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                      )}
                      <span>
                        Ukuran akhir: 1200 x 800 px | Ukuran file: {stats.sizeKb} KB | Kualitas: {stats.quality}%
                      </span>
                    </span>
                  </div>
                ) : (
                  <span className="text-xs text-slate-500 font-mono-numbers">
                    Ukuran akhir: 1200 x 800 px | Target: &le; 180 KB
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
