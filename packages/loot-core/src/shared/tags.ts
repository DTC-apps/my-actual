import type { ObjectExpression } from './query';

// for a given string, returns an array of unique words
// (whitespace-separated) with only a single # prepended,
// so "one #one ##one ##two three" becomes
// ["#one", "#two", "#three"]
export function extractTagsForFilter(value: string) {
  if (!value) return [];
  const tagValues = [];
  const seenTags = new Set();
  for (const [_, tag] of value.matchAll(/#*([^#\s]+)/g)) {
    const tagWithHash = '#' + tag;
    if (!seenTags.has(tagWithHash)) {
      seenTags.add(tagWithHash);
      tagValues.push(tagWithHash);
    }
  }
  return tagValues;
}

// Tags in notes are delimited by whitespace or another '#', and a doubled
// '#' escapes the tag (see `parseNotes`). Matching is case sensitive because
// tag identity elsewhere (colors, discovery) is case sensitive too.
export function renameTagInNotes(
  notes: string,
  oldTag: string,
  newTag: string,
) {
  const escaped = oldTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(?<!#)#${escaped}(?=[\\s#]|$)`, 'g');
  return notes.replace(pattern, () => `#${newTag}`);
}

// Turns user input like "#just-imported" into a bare tag name. Returns null
// when nothing usable is left or when the input can't be a single tag (tags end
// at whitespace or another '#', see `extractTagsFromText`).
export function normalizeTagName(
  value: string | null | undefined,
): string | null {
  const name = (value ?? '').trim().replace(/^#+/, '');
  if (name === '' || /[\s#]/.test(name)) {
    return null;
  }
  return name;
}

// Removes every `#tag` (and the space before it) from the notes. Escaped
// `##tag` and longer tags such as `#tag-old` are kept, and the rest of the
// notes is left as it was. Returns null when nothing else remains, matching how
// empty notes are stored.
export function removeTagFromNotes(
  notes: string | null | undefined,
  tag: string,
): string | null {
  if (!notes) return notes ?? null;

  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`[ \\t]*(?<!#)#${escaped}(?=[\\s#]|$)`, 'g');
  const removed = notes.replace(pattern, '');
  if (removed === notes) return notes;

  const cleaned = removed.trim();
  return cleaned === '' ? null : cleaned;
}

export function extractTagsFromText(value: string): string[] {
  if (!value) return [];

  const tags: string[] = [];
  const seenTags = new Set<string>();
  for (const match of value.matchAll(/(?<!#)#([^#\s]+)/g)) {
    const tag = match[1];
    if (!seenTags.has(tag)) {
      seenTags.add(tag);
      tags.push(tag);
    }
  }

  return tags;
}

export function makeTagAqlRegex(tag: string): string {
  const tagWithHash = tag.startsWith('#') ? tag : `#${tag}`;
  const escapedTag = tagWithHash
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // AQL unescapes `\$`, so a character class is needed for a literal `$`.
    .replace(/\\\$/g, '[$]');

  return `(^|[^#])${escapedTag}([\\s#]|$)`;
}

export function makeExactTagSetQueryFilter(
  bucketTagNames: string[],
  scopeTagNames: string[],
): ObjectExpression {
  const bucketTags = new Set(bucketTagNames);
  const includedTagFilters = bucketTagNames.map(tag => ({
    notes: { $regexp: makeTagAqlRegex(tag) },
  }));
  const excludedTagFilters = scopeTagNames
    .filter(tag => !bucketTags.has(tag))
    .map(tag => ({
      notes: { $notregexp: makeTagAqlRegex(tag) },
    }));

  return { $and: [...includedTagFilters, ...excludedTagFilters] };
}
