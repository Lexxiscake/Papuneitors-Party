export type IntensityLevel = 1 | 2 | 3 | 4;

type IntensityMeta = {
  level: IntensityLevel;
  emoji: string;
  label: string;
  hint: string;
};

export const INTENSITIES: readonly IntensityMeta[] = [
  { level: 1, emoji: "🟢", label: "Suave", hint: "para calentar" },
  { level: 2, emoji: "🟡", label: "Picante", hint: "sube la temperatura" },
  { level: 3, emoji: "🟠", label: "Fuerte", hint: "sin anestesia" },
  { level: 4, emoji: "🔴", label: "Sin filtros", hint: "lo más nuclear" },
];

export function intensityMeta(level?: number | null): IntensityMeta {
  const n = Number.isFinite(level) ? Math.round(level as number) : 2;
  const safe = Math.min(4, Math.max(1, n)) as IntensityLevel;
  return INTENSITIES[safe - 1];
}
