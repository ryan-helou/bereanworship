import { describe, expect, it } from 'vitest';
import { autoRejectedBy } from '@/lib/auto-reject';

describe('autoRejectedBy', () => {
  it.each([
    ['Hillsong Worship', 'Hillsong'],
    ['Hillsong United', 'Hillsong'],
    ['HILLSONG Young & Free', 'Hillsong'],
    ['Elevation Worship', 'Elevation'],
    ['Bethel Music', 'Bethel'],
    ['Jenn Johnson & Bethel Music', 'Bethel'],
  ])('rejects %s', (name, rule) => expect(autoRejectedBy(name)).toBe(rule));

  it.each(['Matt Redman', 'Chris Tomlin', 'Bethelehem Choir', 'Elevationist', ''])('keeps %s', (name) =>
    expect(autoRejectedBy(name)).toBeNull(),
  );
});
