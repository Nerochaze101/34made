import { useEffect, useState } from 'react';

export interface SpriteLayer {
  url: string;
  pivotX: number;
  pivotY: number;
}

export interface FaceFeature {
  x: number;
  y: number;
  r: number;
}

export interface ArticulatedPose {
  width: number;
  height: number;
  aspectRatio: number;
  anchorX?: number;
  wideEyeMode?: boolean;
  fullUrl: string;
  bodyUrl: string;
  torso?: SpriteLayer;
  head?: SpriteLayer;
  hairTop?: SpriteLayer;
  armL?: SpriteLayer;
  armR?: SpriteLayer;
  legL?: SpriteLayer;
  legR?: SpriteLayer;
  skinColor?: string;
  irisColor?: string;
  eyeL?: FaceFeature;
  eyeR?: FaceFeature;
  mouth?: FaceFeature;
}

export interface CastSpriteAtlas {
  tundeSmug: ArticulatedPose;
  tundePanic: ArticulatedPose;
  zainab: ArticulatedPose;
  biscuitSideEye: ArticulatedPose;
  biscuitSleep: ArticulatedPose;
  biscuitBark: ArticulatedPose;
}

export const CAST_SOURCES = {
  tundeSheet: '/src/assets/images/tunde_gamer_poses_1795560270146.jpg',
  zainabPose: '/src/assets/images/zainab_doorway_pose_1795560270649.jpg',
  biscuitSheet: '/src/assets/images/biscuit_pup_poses_1795560271282.jpg',
} as const;

let cachedAtlas: CastSpriteAtlas | null = null;
let pendingPromise: Promise<CastSpriteAtlas> | null = null;

export interface MaskRegion {
  poly: Array<[number, number]>;
  pivot: [number, number];
  erasePoly?: Array<[number, number]>;
}

export interface PoseSpec {
  crop?: { x0: number; y0: number; x1: number; y1: number };
  anchorX?: number;
  chromaStrict?: boolean;
  wideEyeMode?: boolean;
  torso?: MaskRegion;
  head?: MaskRegion;
  hairTop?: MaskRegion;
  armL?: MaskRegion;
  armR?: MaskRegion;
  legL?: MaskRegion;
  legR?: MaskRegion;
  skinSample?: [number, number];
  irisColor?: string;
  eyeL?: [number, number, number];
  eyeR?: [number, number, number];
  mouth?: [number, number, number];
}

export function loadRawImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

function pointInPoly(px: number, py: number, poly: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0];
    const yi = poly[i][1];
    const xj = poly[j][0];
    const yj = poly[j][1];
    const intersect =
      yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function distToPolyEdge(px: number, py: number, poly: Array<[number, number]>): number {
  let minD = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const x1 = poly[j][0];
    const y1 = poly[j][1];
    const x2 = poly[i][0];
    const y2 = poly[i][1];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    let t = 0;
    if (lenSq > 0) {
      t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
    }
    const cx = x1 + t * dx;
    const cy = y1 + t * dy;
    const d = Math.hypot(px - cx, py - cy);
    if (d < minD) minD = d;
  }
  return minD;
}

function createMaskedCanvas(
  baseCanvas: HTMLCanvasElement,
  polysToKeep: Array<Array<[number, number]>>,
  polysToErase: Array<Array<[number, number]>>,
  featherPx = 4
): string {
  const w = baseCanvas.width;
  const h = baseCanvas.height;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d', { willReadFrequently: true });
  if (!ctx) return baseCanvas.toDataURL('image/png');
  ctx.drawImage(baseCanvas, 0, 0);

  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const a = data[idx + 3];
      if (a === 0) continue;

      let keepFactor = polysToKeep.length === 0 ? 1 : 0;
      if (polysToKeep.length > 0) {
        for (const poly of polysToKeep) {
          if (pointInPoly(x, y, poly)) {
            const d = distToPolyEdge(x, y, poly);
            const f = Math.min(1, d / featherPx);
            keepFactor = Math.max(keepFactor, f);
          }
        }
      }

      if (keepFactor > 0 && polysToErase.length > 0) {
        for (const poly of polysToErase) {
          if (pointInPoly(x, y, poly)) {
            const d = distToPolyEdge(x, y, poly);
            const eraseAlpha = Math.min(1, d / featherPx);
            keepFactor *= 1 - eraseAlpha;
          }
        }
      }

      data[idx + 3] = Math.round(a * keepFactor);
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return out.toDataURL('image/png');
}

function sampleHexColor(canvas: HTMLCanvasElement, nx: number, ny: number): string {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return '#9A6446';
  const x = Math.max(0, Math.min(canvas.width - 1, Math.round(nx * canvas.width)));
  const y = Math.max(0, Math.min(canvas.height - 1, Math.round(ny * canvas.height)));
  const px = ctx.getImageData(x, y, 1, 1).data;
  if (px[3] < 128) return '#9A6446';
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(px[0])}${toHex(px[1])}${toHex(px[2])}`;
}

export function extractPose(img: HTMLImageElement, spec: PoseSpec = {}): ArticulatedPose {
  const crop = spec.crop ?? { x0: 0, y0: 0, x1: 1, y1: 1 };
  const sx = Math.floor(img.naturalWidth * crop.x0);
  const sy = Math.floor(img.naturalHeight * crop.y0);
  const sw = Math.max(1, Math.floor(img.naturalWidth * (crop.x1 - crop.x0)));
  const sh = Math.max(1, Math.floor(img.naturalHeight * (crop.y1 - crop.y0)));

  const workCanvas = document.createElement('canvas');
  workCanvas.width = sw;
  workCanvas.height = sh;
  const ctx = workCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Unable to acquire 2D canvas context.');
  }

  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  const imageData = ctx.getImageData(0, 0, sw, sh);
  const data = imageData.data;

  let minX = sw;
  let minY = sh;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const idx = (y * sw + x) * 4;
      let r = data[idx];
      let g = data[idx + 1];
      let b = data[idx + 2];

      const maxRB = Math.max(r, b);
      const greenDiff = g - maxRB;

      const keyDiffHard = spec.chromaStrict ? 86 : 68;
      const keyGHard = spec.chromaStrict ? 160 : 125;
      const keyDiffSoft = spec.chromaStrict ? 48 : 28;
      const keyGSoft = spec.chromaStrict ? 132 : 94;
      const despillDiff = spec.chromaStrict ? 42 : 16;
      const despillG = spec.chromaStrict ? 132 : 88;

      let alpha = 255;
      if (greenDiff > keyDiffHard && g > keyGHard) {
        alpha = 0;
      } else if (greenDiff > keyDiffSoft && g > keyGSoft) {
        const t = (greenDiff - keyDiffSoft) / Math.max(1, keyDiffHard - keyDiffSoft);
        alpha = clampByte((1 - t * t) * 255);
      }

      if (alpha > 0 && greenDiff > despillDiff && g > despillG) {
        const clampedG = Math.min(g, maxRB + 5);
        const spill = g - clampedG;
        g = clampedG;
        r = clampByte(r + spill * 0.12);
        b = clampByte(b + spill * 0.1);
      }

      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = alpha;

      if (alpha > 14) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);

  const pad = 3;
  const tx = maxX >= minX ? Math.max(0, minX - pad) : 0;
  const ty = maxY >= minY ? Math.max(0, minY - pad) : 0;
  const tw = maxX >= minX ? Math.min(sw - tx, maxX - minX + 1 + pad * 2) : sw;
  const th = maxY >= minY ? Math.min(sh - ty, maxY - ty + 1) : sh;

  const trimCanvas = document.createElement('canvas');
  trimCanvas.width = tw;
  trimCanvas.height = th;
  const trimCtx = trimCanvas.getContext('2d', { willReadFrequently: true });
  if (!trimCtx) {
    throw new Error('Unable to acquire trim canvas context.');
  }
  trimCtx.drawImage(workCanvas, tx, ty, tw, th, 0, 0, tw, th);

  const toTrimPx = (poly: Array<[number, number]>): Array<[number, number]> =>
    poly.map(([ux, uy]) => [ux * sw - tx, uy * sh - ty]);

  const toTrimNorm = ([ux, uy]: [number, number]): [number, number] => [
    (ux * sw - tx) / tw,
    (uy * sh - ty) / th,
  ];

  const erasePolys: Array<Array<[number, number]>> = [];
  const torsoSubErases: Array<Array<[number, number]>> = [];
  const buildPart = (
    region?: MaskRegion,
    skipErase = false,
    excludeFromTorso = true
  ): SpriteLayer | undefined => {
    if (!region) return undefined;
    const ePoly = toTrimPx(region.erasePoly ?? region.poly);
    if (!skipErase) {
      erasePolys.push(ePoly);
      if (excludeFromTorso) {
        torsoSubErases.push(ePoly);
      }
    }
    const url = createMaskedCanvas(trimCanvas, [toTrimPx(region.poly)], [], 5);
    const [px, py] = toTrimNorm(region.pivot);
    return { url, pivotX: px, pivotY: py };
  };

  const head = buildPart(spec.head);
  const hairTop = buildPart(spec.hairTop, true, false);
  const armL = buildPart(spec.armL);
  const armR = buildPart(spec.armR);
  const legL = buildPart(spec.legL, false, false);
  const legR = buildPart(spec.legR, false, false);

  let torso: SpriteLayer | undefined;
  if (spec.torso) {
    erasePolys.push(toTrimPx(spec.torso.erasePoly ?? spec.torso.poly));
    const url = createMaskedCanvas(
      trimCanvas,
      [toTrimPx(spec.torso.poly)],
      torsoSubErases,
      4
    );
    const [px, py] = toTrimNorm(spec.torso.pivot);
    torso = { url, pivotX: px, pivotY: py };
  }

  const fullUrl = trimCanvas.toDataURL('image/png');
  const bodyUrl =
    erasePolys.length > 0
      ? createMaskedCanvas(trimCanvas, [], erasePolys, 3)
      : fullUrl;

  const toFeature = (f?: [number, number, number]): FaceFeature | undefined => {
    if (!f) return undefined;
    const [nx, ny] = toTrimNorm([f[0], f[1]]);
    return { x: nx, y: ny, r: (f[2] * sh) / th };
  };

  let skinColor: string | undefined;
  if (spec.skinSample) {
    const [snx, sny] = toTrimNorm(spec.skinSample);
    skinColor = sampleHexColor(trimCanvas, snx, sny);
  }

  return {
    width: tw,
    height: th,
    aspectRatio: tw / th,
    anchorX: spec.anchorX,
    wideEyeMode: spec.wideEyeMode,
    fullUrl,
    bodyUrl,
    torso,
    head,
    hairTop,
    armL,
    armR,
    legL,
    legR,
    skinColor,
    irisColor: spec.irisColor,
    eyeL: toFeature(spec.eyeL),
    eyeR: toFeature(spec.eyeR),
    mouth: toFeature(spec.mouth),
  };
}

export async function loadCastSprites(): Promise<CastSpriteAtlas> {
  if (cachedAtlas) return cachedAtlas;
  if (pendingPromise) return pendingPromise;

  pendingPromise = (async () => {
    const [tundeImg, zainabImg, biscuitImg] = await Promise.all([
      loadRawImage(CAST_SOURCES.tundeSheet),
      loadRawImage(CAST_SOURCES.zainabPose),
      loadRawImage(CAST_SOURCES.biscuitSheet),
    ]);

    const atlas: CastSpriteAtlas = {
      tundeSmug: extractPose(tundeImg, {
        crop: { x0: 0.0, y0: 0, x1: 0.48, y1: 1 },
        anchorX: 0.53,
        torso: {
          poly: [[0.12, 0.44], [0.95, 0.44], [0.95, 0.99], [0.12, 0.99]],
          erasePoly: [[0.12, 0.45], [0.95, 0.45], [0.95, 0.97], [0.12, 0.97]],
          pivot: [0.53, 0.95],
        },
        head: {
          poly: [[0.28, 0.06], [0.78, 0.06], [0.76, 0.48], [0.30, 0.48]],
          erasePoly: [[0.28, 0.06], [0.78, 0.06], [0.75, 0.45], [0.30, 0.45]],
          pivot: [0.535, 0.455],
        },
        hairTop: {
          poly: [[0.28, 0.06], [0.78, 0.06], [0.76, 0.25], [0.30, 0.25]],
          pivot: [0.53, 0.24],
        },
        armR: {
          poly: [[0.32, 0.59], [0.75, 0.59], [0.75, 0.77], [0.32, 0.77]],
          erasePoly: [[0.34, 0.61], [0.73, 0.61], [0.73, 0.75], [0.34, 0.75]],
          pivot: [0.53, 0.72],
        },
        skinSample: [0.538, 0.365],
        irisColor: '#1E1B18',
        eyeL: [0.475, 0.313, 0.017],
        eyeR: [0.585, 0.312, 0.017],
        mouth: [0.534, 0.402, 0.028],
      }),

      tundePanic: extractPose(tundeImg, {
        crop: { x0: 0.52, y0: 0, x1: 1.0, y1: 1 },
        anchorX: 0.51,
        wideEyeMode: true,
        torso: {
          poly: [[0.10, 0.44], [0.93, 0.44], [0.93, 0.99], [0.10, 0.99]],
          erasePoly: [[0.10, 0.45], [0.93, 0.45], [0.93, 0.97], [0.10, 0.97]],
          pivot: [0.51, 0.95],
        },
        head: {
          poly: [[0.24, 0.06], [0.78, 0.06], [0.76, 0.48], [0.25, 0.48]],
          erasePoly: [[0.24, 0.06], [0.78, 0.06], [0.74, 0.45], [0.26, 0.45]],
          pivot: [0.51, 0.455],
        },
        hairTop: {
          poly: [[0.24, 0.06], [0.78, 0.06], [0.76, 0.25], [0.25, 0.25]],
          pivot: [0.51, 0.24],
        },
        armR: {
          poly: [[0.30, 0.59], [0.73, 0.59], [0.73, 0.77], [0.30, 0.77]],
          erasePoly: [[0.32, 0.61], [0.71, 0.61], [0.71, 0.75], [0.32, 0.75]],
          pivot: [0.51, 0.72],
        },
        skinSample: [0.510, 0.365],
        irisColor: '#111827',
        eyeL: [0.455, 0.319, 0.022],
        eyeR: [0.566, 0.319, 0.022],
        mouth: [0.510, 0.402, 0.028],
      }),

      zainab: extractPose(zainabImg, {
        anchorX: 0.48,
        torso: {
          poly: [[0.26, 0.31], [0.78, 0.31], [0.78, 0.72], [0.26, 0.72]],
          erasePoly: [[0.26, 0.32], [0.78, 0.32], [0.78, 0.70], [0.26, 0.70]],
          pivot: [0.49, 0.70],
        },
        head: {
          poly: [[0.30, 0.05], [0.70, 0.05], [0.68, 0.33], [0.30, 0.33]],
          erasePoly: [[0.30, 0.05], [0.70, 0.05], [0.66, 0.31], [0.31, 0.31]],
          pivot: [0.485, 0.315],
        },
        hairTop: {
          poly: [[0.30, 0.05], [0.70, 0.05], [0.68, 0.24], [0.30, 0.24]],
          pivot: [0.49, 0.16],
        },
        armR: {
          poly: [[0.27, 0.50], [0.58, 0.50], [0.58, 0.67], [0.27, 0.67]],
          erasePoly: [[0.28, 0.51], [0.57, 0.51], [0.57, 0.66], [0.28, 0.66]],
          pivot: [0.55, 0.58],
        },
        skinSample: [0.462, 0.242],
        irisColor: '#1F1612',
        eyeL: [0.416, 0.205, 0.015],
        eyeR: [0.508, 0.201, 0.015],
        mouth: [0.458, 0.276, 0.022],
      }),

      biscuitSideEye: extractPose(biscuitImg, {
        crop: { x0: 0.0, y0: 0, x1: 0.31, y1: 1 },
        head: {
          poly: [[0.24, 0.22], [0.85, 0.22], [0.83, 0.50], [0.24, 0.50]],
          erasePoly: [[0.24, 0.22], [0.85, 0.22], [0.82, 0.47], [0.26, 0.47]],
          pivot: [0.56, 0.47],
        },
        armL: {
          poly: [[0.10, 0.46], [0.32, 0.46], [0.32, 0.73], [0.10, 0.73]],
          erasePoly: [[0.10, 0.48], [0.30, 0.48], [0.30, 0.72], [0.10, 0.72]],
          pivot: [0.30, 0.67],
        },
      }),

      biscuitSleep: extractPose(biscuitImg, {
        crop: { x0: 0.31, y0: 0, x1: 0.70, y1: 1 },
      }),

      biscuitBark: extractPose(biscuitImg, {
        crop: { x0: 0.70, y0: 0, x1: 1.0, y1: 1 },
        head: {
          poly: [[0.14, 0.20], [0.72, 0.20], [0.72, 0.50], [0.14, 0.50]],
          erasePoly: [[0.14, 0.20], [0.72, 0.20], [0.70, 0.47], [0.16, 0.47]],
          pivot: [0.46, 0.47],
        },
        armL: {
          poly: [[0.69, 0.47], [0.93, 0.47], [0.93, 0.74], [0.69, 0.74]],
          erasePoly: [[0.71, 0.49], [0.92, 0.49], [0.92, 0.73], [0.71, 0.73]],
          pivot: [0.71, 0.68],
        },
      }),
    };

    cachedAtlas = atlas;
    return atlas;
  })();

  return pendingPromise;
}

export function useCastSprites(): {
  sprites: CastSpriteAtlas | null;
  error: boolean;
} {
  const [sprites, setSprites] = useState<CastSpriteAtlas | null>(cachedAtlas);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (cachedAtlas) {
      setSprites(cachedAtlas);
      return;
    }
    let mounted = true;
    loadCastSprites()
      .then((atlas) => {
        if (mounted) setSprites(atlas);
      })
      .catch(() => {
        if (mounted) setError(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  return { sprites, error };
}
