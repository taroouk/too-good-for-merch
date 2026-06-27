export const PLACEMENTS = [
  "LEFT_CHEST",
  "RIGHT_CHEST",
  "RIGHT_SLEEVE",
  "LEFT_SLEEVE",
  "CENTER_FRONT",
  "FULL_FRONT",
  "CENTER_BACK",
  "FULL_BACK",
] as const;

export type PlacementKey = (typeof PLACEMENTS)[number];

export const DEFAULT_PLACEMENTS: PlacementKey[] = ["CENTER_FRONT"];

const PLACEMENT_SET = new Set<string>(PLACEMENTS);

export function normalizePlacements(value: unknown): PlacementKey[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  return [
    ...new Set(
      raw
        .map((item) => String(item).trim().toUpperCase())
        .filter((item): item is PlacementKey => PLACEMENT_SET.has(item)),
    ),
  ].slice(0, PLACEMENTS.length);
}

export function placementsFromCustomNotes(notes?: string | null): PlacementKey[] {
  if (!notes) return [];

  const trimmed = notes.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    return normalizePlacements(parsed.placements ?? parsed.placement);
  } catch {
    const match = trimmed.match(/PLACEMENTS=([A-Z_,]+)/);
    return normalizePlacements(match?.[1] ?? []);
  }
}

export function upsertPlacementsInNotes(
  notes: string | null | undefined,
  placements: PlacementKey[],
) {
  const clean = (notes ?? "").trim();
  const normalized = normalizePlacements(placements);

  if (!clean) {
    return JSON.stringify({ placements: normalized });
  }

  try {
    const parsed = JSON.parse(clean) as Record<string, unknown>;
    return JSON.stringify({
      ...parsed,
      placement: undefined,
      placements: normalized,
    });
  } catch {
    const tag = `PLACEMENTS=${normalized.join(",")}`;
    if (/PLACEMENTS=[A-Z_,]+/.test(clean)) {
      return clean.replace(/PLACEMENTS=[A-Z_,]+/, tag);
    }
    return `${clean}\n${tag}`;
  }
}

export function placementsOrDefault(value: unknown): PlacementKey[] {
  const placements = normalizePlacements(value);
  return placements.length ? placements : DEFAULT_PLACEMENTS;
}

export function placementLabel(placement: PlacementKey) {
  return placement
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}
