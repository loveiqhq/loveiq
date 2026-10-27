/**
 * The top of the screen V4's own floating chrome covers on a phone: the header (8→56)
 * and the chapter pill's band (80→136), per the note above `.rv4-chrome`, with a little
 * air. Whatever is scrolled to must land below it, or its heading hides under the pill.
 * `scroll-margin-top: 144px` (reportV3.css) says the same for in-page jumps.
 */
export const V4_CHROME_OFFSET_PX = 144;
