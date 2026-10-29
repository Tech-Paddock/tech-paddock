/**
 * The food-amount scroller's size (TEC-193): the pick shows in full with half of the row above and half of
 * the row below peeking in, so the window is two rows tall and the list is padded by half a row at each end.
 * Kept here so the window can be tested without a browser.
 */
export const SCROLLER_ROW = 32; // px per step
export const SCROLLER_WIDTH = 88; // px; thin, since an amount is a few characters

export function scrollerWindow(row: number = SCROLLER_ROW) {
  const height = row * 2;
  const pad = row / 2;
  return {
    height,
    /** Blank space before the first and after the last row, so either end can sit in the middle. */
    pad,
    /** Where the pick's band starts, and how tall it is: one whole row. */
    bandTop: pad,
    bandHeight: row,
    /** How much of the rows beside the pick shows, as a fraction of a row. */
    above: pad / row,
    below: (height - pad - row) / row,
  };
}
