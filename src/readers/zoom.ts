export function clampZoomOffset(offset: number, viewport: number, scale: number) {
  'worklet';
  const limit = Math.max(0, viewport * (scale - 1) / 2);
  return Math.max(-limit, Math.min(limit, offset));
}

export function zoomOffsetForTap(position: number, viewport: number, scale: number) {
  'worklet';
  return clampZoomOffset((viewport / 2 - position) * (scale - 1), viewport, scale);
}

export function swipeDirection(translationX: number, velocityX: number, viewport: number): -1 | 0 | 1 {
  'worklet';
  const movement = Math.abs(translationX) >= viewport * 0.15
    ? translationX
    : Math.abs(velocityX) >= 500 ? velocityX : 0;
  return movement < 0 ? 1 : movement > 0 ? -1 : 0;
}
