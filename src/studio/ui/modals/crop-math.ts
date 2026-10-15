// Pure geometry for the artwork crop tool (ArtworkCropper). No DOM, no React,
// so the interactions (moving the frame, dragging a handle, rotating) are
// unit tested. All rects are in the same coordinate space as `bounds`.

export type Rect = { x: number; y: number; w: number; h: number };
export type Size = { w: number; h: number };
export type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export const MIN_CROP_PX = 24;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

// A frame covering the whole image (what the tool starts with).
export function fullRect(bounds: Size): Rect {
  return { x: 0, y: 0, w: bounds.w, h: bounds.h };
}

// Drag the whole frame; it can't leave the image.
export function moveRect(start: Rect, dx: number, dy: number, bounds: Size): Rect {
  return {
    ...start,
    x: clamp(start.x + dx, 0, bounds.w - start.w),
    y: clamp(start.y + dy, 0, bounds.h - start.h),
  };
}

// Drag one handle. The opposite edge/corner stays put; the frame is kept
// inside the image and never smaller than `min` on either side.
export function resizeRect(start: Rect, handle: Handle, dx: number, dy: number, bounds: Size, min: number = MIN_CROP_PX): Rect {
  let left = start.x;
  let top = start.y;
  let right = start.x + start.w;
  let bottom = start.y + start.h;

  if (handle.includes("w")) left = clamp(start.x + dx, 0, right - min);
  if (handle.includes("e")) right = clamp(right + dx, left + min, bounds.w);
  if (handle.includes("n")) top = clamp(start.y + dy, 0, bottom - min);
  if (handle.includes("s")) bottom = clamp(bottom + dy, top + min, bounds.h);

  return { x: left, y: top, w: right - left, h: bottom - top };
}

// Size of the smallest box containing a w x h image rotated by `degrees`.
export function rotatedSize(size: Size, degrees: number): Size {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  return { w: size.w * cos + size.h * sin, h: size.w * sin + size.h * cos };
}

// Scale that fits `content` inside `box` (never enlarges past 1 unless allowed).
export function fitScale(content: Size, box: Size, allowUpscale = false): number {
  if (content.w <= 0 || content.h <= 0 || box.w <= 0 || box.h <= 0) return 1;
  const scale = Math.min(box.w / content.w, box.h / content.h);
  return allowUpscale ? scale : Math.min(1, scale);
}

// Convert the on-screen frame back to whole source pixels (what is actually cut).
export function rectToSource(rect: Rect, displayScale: number, source: Size): Rect {
  const s = displayScale > 0 ? displayScale : 1;
  const x = clamp(Math.round(rect.x / s), 0, source.w - 1);
  const y = clamp(Math.round(rect.y / s), 0, source.h - 1);
  const w = clamp(Math.round(rect.w / s), 1, source.w - x);
  const h = clamp(Math.round(rect.h / s), 1, source.h - y);
  return { x, y, w, h };
}

// A crop that changes nothing (full image, no rotation) needn't re-upload.
export function isNoopCrop(source: Rect, full: Size, rotation: number): boolean {
  return rotation === 0 && source.x === 0 && source.y === 0 && source.w === full.w && source.h === full.h;
}

// Caps the output so a huge image can't produce a file bigger than the upload limit.
export function limitOutputSize(size: Size, maxSide: number): { size: Size; factor: number } {
  const longest = Math.max(size.w, size.h);
  if (longest <= maxSide) return { size, factor: 1 };
  const factor = maxSide / longest;
  return { size: { w: Math.max(1, Math.round(size.w * factor)), h: Math.max(1, Math.round(size.h * factor)) }, factor };
}

// ---------------------------------------------------------------------------
// Canva-style crop: the crop WINDOW stays put on the canvas while the IMAGE
// slides (and zooms) underneath it; the window's handles resize the window.
// The window must always lie inside the image.
// ---------------------------------------------------------------------------

export type Point = { x: number; y: number };

// Keep the image covering the window while it is being dragged.
export function clampImageOffset(offset: Point, image: Size, window: Rect): Point {
  return {
    x: clamp(offset.x, window.x + window.w - image.w, window.x),
    y: clamp(offset.y, window.y + window.h - image.h, window.y),
  };
}

// Smallest zoom at which an image of `baseSize` (zoom 1) still covers the window.
export function minZoomFor(window: Rect, baseSize: Size): number {
  if (baseSize.w <= 0 || baseSize.h <= 0) return 1;
  return Math.max(1, window.w / baseSize.w, window.h / baseSize.h);
}

export const MAX_CROP_ZOOM = 5;

// Zoom the image about the window's centre (the point under the middle of the
// window stays under the middle of the window), then re-clamp.
export function zoomAboutWindow(offset: Point, image: Size, window: Rect, nextImage: Size): Point {
  const cx = window.x + window.w / 2;
  const cy = window.y + window.h / 2;
  const fx = image.w > 0 ? (cx - offset.x) / image.w : 0.5;
  const fy = image.h > 0 ? (cy - offset.y) / image.h : 0.5;
  return clampImageOffset({ x: cx - fx * nextImage.w, y: cy - fy * nextImage.h }, nextImage, window);
}

// What the crop window covers, as fractions (0..1) of the image.
export type CropWindowFraction = { x: number; y: number; w: number; h: number };
export type CropMeta = { rotation: number; window: CropWindowFraction };

export function windowToFraction(window: Rect, offset: Point, image: Size): CropWindowFraction {
  const f = (value: number, total: number) => (total > 0 ? clamp(value / total, 0, 1) : 0);
  const x = f(window.x - offset.x, image.w);
  const y = f(window.y - offset.y, image.h);
  return { x, y, w: Math.min(f(window.w, image.w), 1 - x), h: Math.min(f(window.h, image.h), 1 - y) };
}

export function fractionToWindow(fraction: CropWindowFraction, offset: Point, image: Size): Rect {
  return { x: offset.x + fraction.x * image.w, y: offset.y + fraction.y * image.h, w: fraction.w * image.w, h: fraction.h * image.h };
}

// Validates untrusted crop metadata (it comes back from the server / client).
export function parseCropMeta(value: unknown): CropMeta | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const win = raw.window as Record<string, unknown> | undefined;
  if (typeof raw.rotation !== "number" || !Number.isFinite(raw.rotation) || raw.rotation < -180 || raw.rotation > 180) return null;
  if (!win || typeof win !== "object") return null;
  const { x, y, w, h } = win as Record<string, unknown>;
  for (const n of [x, y, w, h]) if (typeof n !== "number" || !Number.isFinite(n)) return null;
  const [fx, fy, fw, fh] = [x, y, w, h] as number[];
  if (fx < 0 || fy < 0 || fw < 0.005 || fh < 0.005 || fx + fw > 1.0001 || fy + fh > 1.0001) return null;
  return { rotation: Math.round(raw.rotation * 100) / 100, window: { x: fx, y: fy, w: fw, h: fh } };
}
