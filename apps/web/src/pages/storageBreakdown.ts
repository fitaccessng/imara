export interface StorageBreakdown {
  usedPercent: number;
  reservedPercent: number;
  availablePercent: number;
}

export function formatStoragePercent(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0%";
  const rounded = Math.round(value);
  return rounded === 0 ? "<1%" : `${rounded}%`;
}

export function getStorageBreakdown(
  usedBytes: number,
  reservedBytes: number,
  availableBytes: number,
): StorageBreakdown {
  const totalBytes = usedBytes + reservedBytes + availableBytes;
  if (totalBytes === 0) {
    return { usedPercent: 0, reservedPercent: 0, availablePercent: 100 };
  }

  return {
    usedPercent: (usedBytes / totalBytes) * 100,
    reservedPercent: (reservedBytes / totalBytes) * 100,
    availablePercent: (availableBytes / totalBytes) * 100,
  };
}
