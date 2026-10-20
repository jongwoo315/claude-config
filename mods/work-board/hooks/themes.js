// The color themes of the work board. Every color the pane and band use is a token:
//   bg      pane background
//   accent  headings: stage and lane names
//   add / del / warn   the green, red and yellow roles: new, removed, changed; done, failed, running
//   muted   dim text; absent, text keeps the terminal's own dim
// Claude Code draws in 256 colors here, so a hex is rounded to the nearest palette entry; each hex below
// is exactly one: a cube color (red, green and blue each 0x00 0x5f 0x87 0xaf 0xd7 0xff) or a gray
// 0x08 + 10 * n. #262626 (palette 235) matches the dock's own top and bottom rows.
export const THEMES = {
  classic: { bg: '#262626', accent: 'cyan', add: 'green', del: 'red', warn: 'yellow', muted: undefined },
  dusk: { bg: '#303030', accent: '#d787d7', add: '#87d787', del: '#ff8787', warn: '#ffaf5f', muted: '#8a8a8a' },
  aurora: { bg: '#1c1c1c', accent: '#5fd7d7', add: '#5fff87', del: '#ff5f87', warn: '#d7d75f', muted: '#6c6c6c' },
  'high-contrast': { bg: '#000000', accent: '#00ffff', add: '#00ff00', del: '#ff0000', warn: '#ffff00', muted: '#d0d0d0' },
}
