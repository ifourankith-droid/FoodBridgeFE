/** Two-letter initials from a name (first + last word), e.g. "Green Leaf" → "GL". */
export function initials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return '?';
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  console.log('parts', parts);
  return (parts[0].slice(0, 1) + (parts[1]?.slice(0, 1) ?? '')).toUpperCase();
}
