// The color themes of the work board. Every color the pane and band use is a token:
//   bg      pane background
//   accent  headings: stage and lane names
//   add / del / warn   the green, red and yellow roles: new, removed, changed; done, failed, running
//   muted   dim text; absent, text keeps the terminal's own dim
// classic is the board's own look; #262626 matches the dock's own top and bottom rows. The rest are
// glowup's presets (NovusEdge/glowup hooks/presets.ts, MIT): bg = panel, accent, add = pass,
// del = fail, warn = edit, muted = dim.
export const THEMES = {
  classic: { bg: '#262626', accent: 'cyan', add: 'green', del: 'red', warn: 'yellow', muted: undefined },
  glowup: { bg: '#1d1924', accent: '#ffc857', add: '#7ee0a1', del: '#ff6f7d', warn: '#ffa94d', muted: '#8e86a0' },
  aurora: { bg: '#131c23', accent: '#5ef1c6', add: '#5ef1c6', del: '#ff7a8a', warn: '#ffd479', muted: '#7f97a3' },
  dusk: { bg: '#171a2b', accent: '#b69cff', add: '#8ef0b0', del: '#ff7088', warn: '#ffcf7a', muted: '#8a8cad' },
  cyberpunk: { bg: '#140c22', accent: '#ff2bd6', add: '#39ff88', del: '#ff3b5c', warn: '#ffb000', muted: '#7d7398' },
  vaporwave: { bg: '#24123f', accent: '#ff71ce', add: '#05ffa1', del: '#ff6b6b', warn: '#fffb96', muted: '#a08bc0' },
  'high-contrast': { bg: '#000000', accent: '#ffff00', add: '#00ff00', del: '#ff4040', warn: '#ffaa00', muted: '#d0d0d0' },
}
