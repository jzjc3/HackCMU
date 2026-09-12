export const REGIONS = [
  "North America",
  "South America",
  "Europe",
  "Asia",
  "Africa",
  "Oceania",
  "Antarctica",
] as const;

export const EMOTIONS = [
  "Proud",
  "Calm",
  "Grateful",
  "Nervous",
  "Sad",
  "Curious",
  "Tired",
] as const;

export type Region = (typeof REGIONS)[number];
export type Emotion = (typeof EMOTIONS)[number];

export type Dimension = {
  id: string;
  name: string;
  region: Region;
  color: string;
  active: boolean;
};

export type Memory = {
  id: string;
  text: string;
  title: string;
  date: string;
  dims: string[];
  emotion: Emotion | null;
  importance: number | null;
  clarity: number | null;
  created: number;
  photo?: string;
  attachmentIds?: string[];
};

export type RegionOverride = { color?: string; opacity?: number };

export type World = {
  setupDone: boolean;
  dims: Dimension[];
  memories: Memory[];
  overrides: Partial<Record<Region, RegionOverride>>;
  lastOpened: string | null;
  revision: number;
};

export type AttachmentKind = "upload" | "generated";

export type Attachment = {
  id: string;
  url: string;
  contentType: string;
  name: string;
  kind: AttachmentKind;
  size: number;
  created: number;
};

export const DEFAULT_DIMENSIONS: Dimension[] = [
  { id: "career", name: "Career", region: "North America", color: "#1863dc", active: true },
  { id: "health", name: "Physical Health", region: "South America", color: "#2f8f6b", active: true },
  { id: "relationships", name: "Relationships", region: "Europe", color: "#ff7759", active: true },
  { id: "entertainment", name: "Entertainment", region: "Asia", color: "#9b60aa", active: true },
  { id: "travel", name: "Travel", region: "Africa", color: "#d99a3a", active: false },
  { id: "creativity", name: "Creativity", region: "Oceania", color: "#2b9aa8", active: false },
  { id: "growth", name: "Personal Growth", region: "Antarctica", color: "#c4506f", active: false },
];

export function emptyWorld(): World {
  return { setupDone: false, dims: DEFAULT_DIMENSIONS.map((dimension) => ({ ...dimension })), memories: [], overrides: {}, lastOpened: null, revision: 0 };
}
