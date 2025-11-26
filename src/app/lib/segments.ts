// Split string into fixed-length hex segments
export function splitIntoSegments(str: string, size = 64): string[] {
  const segments: string[] = [];
  for (let i = 0; i < str.length; i += size) {
    segments.push(str.slice(i, i + size));
  }
  return segments;
}
