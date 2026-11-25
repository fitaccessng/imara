export function colorHex(value: string): string | null {
  const hex = value.match(/^#?([0-9a-f]{6})$/i)?.[1];
  if (hex) return `#${hex.toLowerCase()}`;
  const rgb = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (!rgb) return null;
  return `#${rgb.slice(1, 4).map((part) => Number(part).toString(16).padStart(2, "0")).join("")}`;
}

export function halfPointSize(value: string): string | null {
  const match = value.trim().match(/^(\d+(?:\.\d+)?)(pt|px)?$/i);
  if (!match) return null;
  const amount = Number(match[1]);
  const points = match[2]?.toLowerCase() === "px" ? amount * 0.75 : amount;
  return Number.isFinite(points) && points > 0 ? String(Math.round(points * 2)) : null;
}
