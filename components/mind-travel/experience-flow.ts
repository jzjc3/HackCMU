import type {Memory, MemoryDraft, Proposal, Region, World} from '@/lib/types';

export function draftsFromProposals(items: Proposal[], date: string): MemoryDraft[] {
  return items.filter((item) => !item.removed && item.text.trim() && item.dims.length).map((item) => ({
    text: item.text.trim(), title: '', date, dims: [...new Set(item.dims)], emotion: item.emotion ?? null,
    importance: null, clarity: null, attachmentIds: [],
  }));
}

export function appendUniqueMemories(world: World, memories: Memory[]): World {
  const existing = new Set(world.memories.map((memory) => memory.id));
  return {...world, memories: [...world.memories, ...memories.filter((memory) => !existing.has(memory.id))]};
}

export function clearMapMemories(world: World): World {
  return {...world, memories: []};
}

export function regionsForDimensions(world: World, ids: string[]): Region[] {
  const selected = new Set(ids);
  return world.dims.filter((dimension) => dimension.active && selected.has(dimension.id)).map((dimension) => dimension.region);
}
