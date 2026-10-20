/**
 * DialogOneDesk V3.2 - Canvas Image Processing Utilities
 * High Performance 60FPS Architecture:
 * - Single-pass decode (createImageBitmap / max 2400px downscale)
 * - Cached blurred background (no per-frame filter blur)
 * - Lightweight preview canvas with relative crop coordinates
 * - Pointer events for Drag & Pinch-to-zoom
 * - Binary search compression targeting <= 180 KB on export/debounce
 */

export interface CropState {
  mode: 'crop' | 'blur';
  zoom: number; // 1.0 to 3.0
  offsetX: number; // -1 to 1 (normalized displacement from center)
  offsetY: number; // -1 to 1 (normalized displacement from center)
}

export interface DecodedSource {
  source: ImageBitmap | HTMLCanvasElement | HTMLImageElement;
  naturalWidth: number;
  naturalHeight: number;
  width: number; // scaled working width (<= 2400)
  height: number; // scaled working height (<= 2400)
  dataUrl?: string;
}

export interface CompressionResult {
  blob: Blob;
  sizeBytes: number;
  sizeKb: number;
  quality: number;
  width: number;
  height: number;
  isWithinTarget: boolean;
}

/**
 * 1. Decode image once, downscale if > 2400px on longest side
 */
export async function decodeAndOptimizeSource(file: File): Promise<DecodedSource> {
  let sourceBitmap: ImageBitmap | null = null;
  let imgElem: HTMLImageElement | null = null;
  let natW = 0;
  let natH = 0;
  let previewDataUrl = '';

  // Try createImageBitmap first for maximum decode performance
  if (typeof window !== 'undefined' && 'createImageBitmap' in window) {
    try {
      sourceBitmap = await createImageBitmap(file);
      natW = sourceBitmap.width;
      natH = sourceBitmap.height;
    } catch (_e) {
      sourceBitmap = null;
    }
  }

  // Fallback to HTMLImageElement if createImageBitmap fails or is unsupported
  if (!sourceBitmap) {
    imgElem = await new Promise<HTMLImageElement>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        previewDataUrl = e.target?.result as string;
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Format gambar tidak dapat dibaca.'));
        img.src = previewDataUrl;
      };
      reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
      reader.readAsDataURL(file);
    });
    natW = imgElem.naturalWidth || imgElem.width;
    natH = imgElem.naturalHeight || imgElem.height;
  }

  const rawSource = sourceBitmap || imgElem!;
  const maxDim = Math.max(natW, natH);

  // If larger than 2400px, create downscaled working canvas
  if (maxDim > 2400) {
    const scale = 2400 / maxDim;
    const targetW = Math.round(natW * scale);
    const targetH = Math.round(natH * scale);

    const downscaleCanvas = document.createElement('canvas');
    downscaleCanvas.width = targetW;
    downscaleCanvas.height = targetH;
    const ctx = downscaleCanvas.getContext('2d');
    if (ctx) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(rawSource, 0, 0, targetW, targetH);
      return {
        source: downscaleCanvas,
        naturalWidth: natW,
        naturalHeight: natH,
        width: targetW,
        height: targetH,
        dataUrl: previewDataUrl,
      };
    }
  }

  return {
    source: rawSource,
    naturalWidth: natW,
    naturalHeight: natH,
    width: natW,
    height: natH,
    dataUrl: previewDataUrl,
  };
}

/**
 * 2. Pre-generate blurred background canvas ONCE (tiny canvas, e.g. 120x80 or 108x135)
 */
export function createBlurredBackground(
  source: ImageBitmap | HTMLCanvasElement | HTMLImageElement,
  aspectRatioWidth: number,
  aspectRatioHeight: number
): HTMLCanvasElement {
  const bgCanvas = document.createElement('canvas');
  // Small dimension for instant generation and smooth hardware stretching
  const baseWidth = 120;
  const baseHeight = Math.round((baseWidth * aspectRatioHeight) / aspectRatioWidth);
  bgCanvas.width = baseWidth;
  bgCanvas.height = baseHeight;

  const ctx = bgCanvas.getContext('2d');
  if (!ctx) return bgCanvas;

  const srcW = 'width' in source ? source.width : (source as any).naturalWidth;
  const srcH = 'height' in source ? source.height : (source as any).naturalHeight;

  // Aspect fill
  const scale = Math.max(baseWidth / srcW, baseHeight / srcH) * 1.1;
  const drawW = srcW * scale;
  const drawH = srcH * scale;
  const drawX = (baseWidth - drawW) / 2;
  const drawY = (baseHeight - drawH) / 2;

  ctx.save();
  ctx.filter = 'blur(6px) brightness(0.65)';
  ctx.drawImage(source, drawX, drawY, drawW, drawH);
  ctx.restore();

  return bgCanvas;
}

/**
 * 3. Render frame to canvas (used for both Preview and Export)
 * Position is strictly relative and clamped to never leave empty gaps
 */
export function drawImageWithCrop(
  ctx: CanvasRenderingContext2D,
  source: ImageBitmap | HTMLCanvasElement | HTMLImageElement,
  targetWidth: number,
  targetHeight: number,
  crop: CropState,
  cachedBlurBg?: HTMLCanvasElement | null,
  applySoftBlur = false
): void {
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // White base background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, targetWidth, targetHeight);

  if (applySoftBlur) {
    ctx.filter = 'blur(0.4px)';
  }

  const srcW = 'width' in source ? source.width : (source as any).naturalWidth;
  const srcH = 'height' in source ? source.height : (source as any).naturalHeight;

  if (crop.mode === 'blur' && cachedBlurBg) {
    // Draw pre-rendered blurred background stretched across entire target canvas
    ctx.drawImage(cachedBlurBg, 0, 0, targetWidth, targetHeight);

    // Foreground image: fit contain centered with zoom
    const fitScale = Math.min(targetWidth / srcW, targetHeight / srcH) * crop.zoom;
    const fgW = srcW * fitScale;
    const fgH = srcH * fitScale;

    // Displacement allowed in blur mode
    const maxShiftX = targetWidth * 0.35;
    const maxShiftY = targetHeight * 0.35;
    const fgX = (targetWidth - fgW) / 2 + crop.offsetX * maxShiftX;
    const fgY = (targetHeight - fgH) / 2 + crop.offsetY * maxShiftY;

    // Subtle drop shadow for foreground
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 4;
    ctx.drawImage(source, fgX, fgY, fgW, fgH);
    ctx.restore();
  } else {
    // Mode 'crop': Perbesar + Crop (Cover aspect fill)
    const baseScale = Math.max(targetWidth / srcW, targetHeight / srcH);
    const scale = baseScale * crop.zoom;
    const drawW = srcW * scale;
    const drawH = srcH * scale;

    // Max pan limits so the image NEVER leaves empty margins
    const maxShiftX = Math.max(0, (drawW - targetWidth) / 2);
    const maxShiftY = Math.max(0, (drawH - targetHeight) / 2);

    const posX = (targetWidth - drawW) / 2 + crop.offsetX * maxShiftX;
    const posY = (targetHeight - drawH) / 2 + crop.offsetY * maxShiftY;

    ctx.drawImage(source, posX, posY, drawW, drawH);
  }

  ctx.restore();
}

/**
 * 4. Compression algorithm targeting <= 180 KB (184,320 bytes)
 * - Binary search quality between 0.45 and 0.82 (7-8 iterations)
 * - If still > 180 KB at 0.45, retry with slight soft blur (0.4px)
 */
export async function compressToTarget(
  source: ImageBitmap | HTMLCanvasElement | HTMLImageElement,
  targetWidth: number,
  targetHeight: number,
  crop: CropState,
  cachedBlurBg: HTMLCanvasElement | null,
  maxBytes = 180 * 1024 // 180 KB
): Promise<CompressionResult> {
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = targetWidth;
  exportCanvas.height = targetHeight;
  const ctx = exportCanvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context tidak tersedia');

  const getBlob = (canvas: HTMLCanvasElement, quality: number): Promise<Blob> => {
    return new Promise((resolve) => {
      canvas.toBlob(
        (b) => resolve(b || new Blob()),
        'image/jpeg',
        quality
      );
    });
  };

  const binarySearchQuality = async (
    canvas: HTMLCanvasElement,
    minQ: number,
    maxQ: number,
    steps: number
  ): Promise<{ blob: Blob; quality: number }> => {
    let low = minQ;
    let high = maxQ;
    let bestBlob = await getBlob(canvas, maxQ);
    let bestQ = maxQ;

    if (bestBlob.size <= maxBytes) {
      return { blob: bestBlob, quality: maxQ };
    }

    for (let i = 0; i < steps; i++) {
      const mid = (low + high) / 2;
      const b = await getBlob(canvas, mid);
      if (b.size <= maxBytes) {
        bestBlob = b;
        bestQ = mid;
        low = mid; // try to get higher quality that still fits
      } else {
        high = mid;
      }
    }

    // Check lowest quality if bestBlob still exceeds
    if (bestBlob.size > maxBytes) {
      const lowestBlob = await getBlob(canvas, minQ);
      if (lowestBlob.size < bestBlob.size) {
        bestBlob = lowestBlob;
        bestQ = minQ;
      }
    }

    return { blob: bestBlob, quality: bestQ };
  };

  // Attempt 1: Crisp render
  drawImageWithCrop(ctx, source, targetWidth, targetHeight, crop, cachedBlurBg, false);
  let searchResult = await binarySearchQuality(exportCanvas, 0.45, 0.82, 8);

  // Attempt 2: If still > 180 KB, apply subtle blur (0.4px) and re-search
  if (searchResult.blob.size > maxBytes) {
    ctx.clearRect(0, 0, targetWidth, targetHeight);
    drawImageWithCrop(ctx, source, targetWidth, targetHeight, crop, cachedBlurBg, true);
    const retryResult = await binarySearchQuality(exportCanvas, 0.45, 0.82, 7);
    if (retryResult.blob.size < searchResult.blob.size) {
      searchResult = retryResult;
    }
  }

  const finalSize = searchResult.blob.size;
  return {
    blob: searchResult.blob,
    sizeBytes: finalSize,
    sizeKb: Math.round(finalSize / 1024),
    quality: Math.round(searchResult.quality * 100),
    width: targetWidth,
    height: targetHeight,
    isWithinTarget: finalSize <= maxBytes,
  };
}

/**
 * Export canvas to PNG Blob
 */
export function exportToPngBlob(
  source: ImageBitmap | HTMLCanvasElement | HTMLImageElement,
  targetWidth: number,
  targetHeight: number,
  crop: CropState,
  cachedBlurBg: HTMLCanvasElement | null
): Promise<{ blob: Blob; sizeKb: number }> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      drawImageWithCrop(ctx, source, targetWidth, targetHeight, crop, cachedBlurBg, false);
    }
    canvas.toBlob((b) => {
      const blob = b || new Blob();
      resolve({ blob, sizeKb: Math.round(blob.size / 1024) });
    }, 'image/png');
  });
}

/**
 * Trigger file download in browser
 */
export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
