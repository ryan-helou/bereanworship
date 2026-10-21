/**
 * Artists whose songs are always rejected, whatever a review scores them.
 *
 * This is the owner's standing decision, kept apart from scoring on purpose:
 * artist validity never feeds a song's score, so the rule lives with the
 * private notes. The match is on whole words of the artist name, so
 * "Hillsong United", "Hillsong Young & Free", "Elevation Worship" and
 * "Bethel Music" all match and an unrelated name that merely contains the
 * letters does not.
 */
export const AUTO_REJECTED_ARTISTS = [
  'Hillsong',
  'Elevation',
  'Bethel',
  'Jeremy Riddle',
  'Pat Barrett',
  'Kalley Heiligenthal',
  'Brandon Lake',
  'Darlene Zschech',
  'Jesus Culture',
  'Lauren Daigle',
  'Lauren Dale',
  'Glorious',
  'Phil Wickham',
] as const;

const PATTERN = new RegExp(`\\b(${AUTO_REJECTED_ARTISTS.join('|')})\\b`, 'i');

/** The rule that rejects this artist, or null when none does. */
export function autoRejectedBy(artistName: string): (typeof AUTO_REJECTED_ARTISTS)[number] | null {
  const hit = PATTERN.exec(artistName)?.[1].toLowerCase();
  return AUTO_REJECTED_ARTISTS.find((name) => name.toLowerCase() === hit) ?? null;
}
