export function clampProgress(progress: number) {
  return Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
}

export function pageFromProgress(progress: number, total: number) {
  if (total <= 1) return 1;
  return Math.round(clampProgress(progress) * (total - 1)) + 1;
}

export function normalizeEpubProgress(progress: number) {
  return clampProgress(progress > 1 ? progress / 100 : progress);
}
