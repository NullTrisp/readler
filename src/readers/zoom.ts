export function clampZoomOffset(offset: number, viewport: number, scale: number) {
  'worklet';
  const limit = Math.max(0, viewport * (scale - 1) / 2);
  return Math.max(-limit, Math.min(limit, offset));
}

export function zoomOffsetForTap(position: number, viewport: number, scale: number) {
  'worklet';
  return clampZoomOffset((viewport / 2 - position) * (scale - 1), viewport, scale);
}
