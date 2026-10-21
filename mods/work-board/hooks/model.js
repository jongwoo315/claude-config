// Pure state updates for the work board. No $ and no drawing here, so tests can call them directly.

// "## Task N ..." headings of a dev-workflow plan. Status comes from the "- [x]" / "- [ ]" boxes under
// each heading: all checked = completed, some = in_progress, none = pending, no boxes = unknown.
export function parsePlanTasks(markdown) {
  const tasks = []
  let current = null
  for (const line of markdown.split('\n')) {
    const heading = line.match(/^##\s+(.*)$/)
    if (heading) {
      current = /^Task\b/.test(heading[1]) ? { text: heading[1].trim(), done: 0, total: 0 } : null
      if (current) tasks.push(current)
      continue
    }
    const box = current && line.match(/^\s*[-*]\s+\[( |x|X)\]/)
    if (box) {
      current.total += 1
      if (box[1] !== ' ') current.done += 1
    }
  }
  return tasks.map((t, i) => ({
    id: 'task-' + i,
    text: t.text,
    status: t.total === 0 ? 'unknown' : t.done === t.total ? 'completed' : t.done > 0 ? 'in_progress' : 'pending',
  }))
}

// The work tab's turns, rebuilt from the transcript so a reload or a resume keeps them. A turn starts at
// a prompt: a user message with text that is no tool result and no engine markup (<command-name>, ...).
// { prompt (first line), start, end (message indexes, end exclusive), tools: { Read: 2, ... }, reply }.
// reply is the turn's last assistant text, its answer, or null: what it says between tool calls is passed over
export function turnRows(messages) {
  const turns = []
  messages.forEach((m, i) => {
    const isPrompt = m.role === 'user' && m.text.trim() !== '' && !m.text.trimStart().startsWith('<') && !(m.toolResults?.length > 0)
    if (isPrompt) {
      if (turns.length > 0) turns[turns.length - 1].end = i
      turns.push({ prompt: m.text.split('\n')[0].trim(), start: i, end: messages.length, tools: {}, reply: null })
    } else if (turns.length > 0) {
      const turn = turns[turns.length - 1]
      for (const use of m.toolUses ?? []) turn.tools[use.tool] = (turn.tools[use.tool] ?? 0) + 1
      if (m.role === 'assistant' && m.text.trim() !== '') turn.reply = m.text
    }
  })
  return turns
}

// The pins of each session sit under their own store key (two sessions writing one key would undo each
// other). entries: [{ key, at }], at = the session's last pin write. The keys past the newest `keep`.
export function stalePinKeys(entries, keep) {
  return [...entries]
    .sort((a, b) => b.at - a.at)
    .slice(keep)
    .map((e) => e.key)
}

// $.agent.list() drops an agent once it has finished, so keep every agent we have seen.
// The live list wins for status; seen-only agents keep what we stored.
export function mergeAgents(seen, live) {
  const byId = new Map(seen.map((a) => [a.id, a]))
  for (const a of live) byId.set(a.id, { ...byId.get(a.id), ...a })
  return [...byId.values()]
}

// Flatten $.agent.list() into rows in tree order: each agent, then its children one level deeper.
// An agent whose parent isn't in the list goes to the top level, so nothing disappears.
export function agentRows(list) {
  const ids = new Set(list.map((a) => a.id))
  const childrenOf = new Map()
  const roots = []
  for (const a of list) {
    if (a.parentId && ids.has(a.parentId)) {
      if (!childrenOf.has(a.parentId)) childrenOf.set(a.parentId, [])
      childrenOf.get(a.parentId).push(a)
    } else {
      roots.push(a)
    }
  }
  const rows = []
  const walk = (a, depth) => {
    rows.push({ id: a.id, depth, label: a.description || a.name || a.type, type: a.type, status: a.status })
    for (const c of childrenOf.get(a.id) ?? []) walk(c, depth + 1)
  }
  for (const r of roots) walk(r, 0)
  return rows
}

// The changes tab starts from these rows. Built from the transcript, not from hooks, so it survives a reload and a /resume.
const EDIT_PATH = { Edit: 'file_path', Write: 'file_path', NotebookEdit: 'notebook_path' }

// messages: $.session.messages(). Returns { edited, read }, each [{ path, count }] sorted by
// directory, then name. A file both read and edited is listed once, under edited.
export function fileRows(messages, cwd, home) {
  const files = new Map() // absolute path -> { count, isEdited }
  const touch = (path, isEdited) => {
    const f = files.get(path) ?? { count: 0, isEdited: false }
    files.set(path, { count: f.count + 1, isEdited: f.isEdited || isEdited })
  }
  // Claude Code's shell keeps its directory from one Bash call to the next, until it says it reset it
  let shellDir = cwd
  for (const m of messages) {
    for (const use of m.toolUses ?? []) {
      if (use.tool === 'Bash' && typeof use.input?.command === 'string') {
        if (!use.isError) {
          const out = bashTargets(use.input.command, shellDir, home)
          out.paths.forEach((path) => touch(path, true))
          shellDir = out.cwd
        }
        // Claude Code adds this as its own line; a match inside printed output is not a reset
        const reset = use.text?.match(/^Shell cwd was reset to (\/\S*)$/m)
        if (reset) shellDir = reset[1]
        continue
      }
      if (use.isError) continue
      const key = EDIT_PATH[use.tool] ?? (use.tool === 'Read' ? 'file_path' : null)
      const path = key && use.input?.[key]
      if (typeof path === 'string') touch(path, use.tool in EDIT_PATH)
    }
  }
  const rows = [...files].map(([path, f]) => ({ path: shortPath(path, cwd, home), count: f.count, isEdited: f.isEdited }))
  rows.sort((a, b) => compareKeys(dirKey(a.path), dirKey(b.path)))
  const pick = (isEdited) => rows.filter((r) => r.isEdited === isEdited).map(({ path, count }) => ({ path, count }))
  return { edited: pick(true), read: pick(false) }
}

// The changes tab. `git status --porcelain -z` entries: "XY path\0", a rename or copy ("R"/"C" in X)
// followed by its old path as one more word. Paths are relative to the repo root.
export function parseStatus(output) {
  const words = output.split('\0')
  const entries = []
  for (let i = 0; i < words.length; i++) {
    const word = words[i]
    if (word.length < 4) continue
    const isMoved = /[RC]/.test(word[0])
    entries.push({ path: word.slice(3), isUntracked: word.startsWith('??'), ...(isMoved ? { oldPath: words[i + 1] } : {}) })
    if (isMoved) i += 1
  }
  return entries
}

// `git diff --numstat -z`: "add\tdel\tpath\0", a binary file "-\t-", a rename "add\tdel\t\0old\0new\0"
export function parseNumstat(output) {
  const words = output.split('\0')
  const stats = []
  for (let i = 0; i < words.length; i++) {
    const m = words[i].match(/^(-|\d+)\t(-|\d+)\t(.*)$/s)
    if (!m) continue
    const path = m[3] === '' ? words[(i += 2)] : m[3]
    const isBinary = m[1] === '-'
    stats.push({ path, add: isBinary ? 0 : Number(m[1]), del: isBinary ? 0 : Number(m[2]), isBinary })
  }
  return stats
}

// The part of a unified diff the diff tab can draw: Code does not parse a diff cut mid-hunk (and draws 100000
// characters at most), so the cut falls on a hunk boundary. When the first hunk alone is over the limit, it is
// cut and its "@@ -a,b +c,d @@" counts are rewritten to what is kept. { source, total, shown } or, when the
// diff has no hunk to cut, { total, isTooBig }.
export function cutDiff(text, maxLines, maxChars) {
  const lines = text.replace(/\n$/, '').split('\n')
  const total = lines.length
  if (total <= maxLines && text.length <= maxChars) return { source: text, total, shown: total }
  let n = Math.min(maxLines, total)
  let chars = 0
  for (let i = 0; i < n; i++) {
    chars += lines[i].length + 1
    if (chars > maxChars) n = i
  }
  const first = lines.findIndex((l) => l.startsWith('@@'))
  for (let k = n; k > first && k > 0; k--) {
    if (lines[k]?.startsWith('@@')) return { source: lines.slice(0, k).join('\n'), total, shown: k }
  }
  const head = first >= 0 && n > first + 1 && lines[first].match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/)
  if (!head) return { total, isTooBig: true }
  const body = lines.slice(first + 1, n)
  const kept = (marks) => body.filter((l) => !l.startsWith('\\') && !marks.includes(l[0])).length
  const oldCount = body.filter((l) => l[0] === '-').length + kept(['+', '-'])
  const newCount = body.filter((l) => l[0] === '+').length + kept(['+', '-'])
  const header = '@@ -' + head[1] + ',' + oldCount + ' +' + head[2] + ',' + newCount + ' @@' + head[3]
  return { source: [...lines.slice(0, first), header, ...body].join('\n'), total, shown: n }
}

export const countLines = (text) => (text === '' ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0))

// files: fileRows(); status: parseStatus(); stats: parseNumstat() of `git diff HEAD`; lines: line count of
// each untracked file by repo path. Returns { changed, read }: the files the conversation edited that git
// still reports, with +/-, and the files only read.
export function changeRows({ files, status, stats, lines, root, cwd, home }) {
  const byPath = new Map(status.map((s) => [shortPath(root + '/' + s.path, cwd, home), s]))
  const statOf = new Map(stats.map((s) => [s.path, s]))
  const changed = files.edited
    .filter((f) => byPath.has(f.path))
    .map((f) => {
      const entry = byPath.get(f.path)
      const stat = statOf.get(entry.path)
      return {
        path: f.path,
        rel: entry.path,
        oldRel: entry.oldPath ?? null,
        count: f.count,
        add: entry.isUntracked ? (lines[entry.path] ?? null) : (stat?.add ?? 0),
        del: entry.isUntracked ? 0 : (stat?.del ?? 0),
        isBinary: stat?.isBinary ?? false,
        isUntracked: entry.isUntracked,
      }
    })
  // Edited in the conversation but gone from git status: committed, reverted, or outside this repo
  const settled = files.edited.filter((f) => !byPath.has(f.path))
  return { changed, settled, read: files.read }
}

function shortPath(path, cwd, home) {
  if (cwd && path.startsWith(cwd + '/')) return path.slice(cwd.length + 1)
  if (home && path.startsWith(home + '/')) return '~' + path.slice(home.length)
  return path
}

// Files under the cwd first, then under ~, then elsewhere; within each, by directory, then name.
// Plain code-point order, so "hooks" comes before "hooks/sub".
function dirKey(path) {
  const slash = path.lastIndexOf('/')
  return [path.startsWith('/') ? 2 : path.startsWith('~') ? 1 : 0, slash < 0 ? '' : path.slice(0, slash), path.slice(slash + 1)]
}

function compareKeys(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1
  return 0
}

// The files a Bash command writes, as absolute paths, and the directory its shell ends in:
// { paths, cwd }. Paths are `sed -i` files, `>`/`>>`/`&>` targets and
// `tee` arguments. A path holding $, ` or a glob is skipped: only running the shell would tell it.
// ponytail: a guess from the command text; a script that writes files itself (python, node) is missed
export function bashTargets(command, cwd, home) {
  const found = []
  let dir = cwd
  const resolve = (word) => {
    if (word.isOpaque || word.text === '' || word.text.startsWith('/dev/')) return null
    const text = word.text
    const path = text === '~' || text.startsWith('~/') ? home + text.slice(1) : text.startsWith('/') ? text : dir && dir + '/' + text
    return path ? normalize(path) : null
  }
  const write = (word) => {
    const path = resolve(word)
    if (path && !found.includes(path)) found.push(path)
  }
  const run = (segment) => {
    const words = []
    for (let i = 0; i < segment.length; i++) {
      const t = segment[i]
      if (!t.op) {
        words.push(t)
        continue
      }
      // Every operator takes the word after it; only a stdout redirect's word is a written file
      const target = segment[i + 1]
      i += 1
      if (t.op === '>' && t.fd !== '2' && target && !target.op) write(target)
    }
    while (words.length > 0 && /^\w+=/.test(words[0].text)) words.shift()
    const [name, ...args] = words
    if (name?.text === 'cd') {
      dir = args[0] ? (args[0].isOpaque ? null : resolve(args[0])) : home
    } else if (name?.text === 'sed') {
      let isInPlace = false
      let hasScript = false
      const files = []
      for (let k = 0; k < args.length; k++) {
        const a = args[k].text
        if (/^-[A-Za-z]*i$/.test(a) || a === '--in-place') {
          isInPlace = true
          // macOS sed takes the backup suffix as its own word, usually ''
          if (args[k + 1]?.text === '') k += 1
        } else if (/^-[A-Za-z]*i./.test(a) || a.startsWith('--in-place=')) {
          isInPlace = true
        } else if (a === '-e' || a === '-f' || a === '--expression' || a === '--file') {
          hasScript = true
          k += 1
        } else if (a.startsWith('-') && a !== '-') {
          // another flag
        } else if (!hasScript) {
          hasScript = true
        } else {
          files.push(args[k])
        }
      }
      if (isInPlace) files.forEach(write)
    } else if (name?.text === 'tee') {
      args.filter((a) => !a.text.startsWith('-')).forEach(write)
    }
  }
  let segment = []
  for (const t of tokenize(stripHeredocs(command))) {
    if (t.op === 'sep') {
      run(segment)
      segment = []
    } else {
      segment.push(t)
    }
  }
  run(segment)
  return { paths: found, cwd: dir }
}

function normalize(path) {
  const parts = []
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  return '/' + parts.join('/')
}

// Drops the body of each heredoc, so `>` inside a file's text is not read as a redirect
function stripHeredocs(command) {
  const kept = []
  const delimiters = []
  for (const line of command.split('\n')) {
    if (delimiters.length > 0) {
      if (line.trim() === delimiters[0]) delimiters.shift()
      continue
    }
    kept.push(line)
    for (const m of line.matchAll(/(?<!<)<<(?!<)-?\s*(['"]?)([A-Za-z_]\w*)\1/g)) delimiters.push(m[2])
  }
  return kept.join('\n')
}

// Words with their quotes removed, and operators: { op: 'sep' } between commands, { op: '>', fd }
// for an output redirect, { op: '<' } and { op: 'dup' } for the rest (each takes the next word).
function tokenize(command) {
  const tokens = []
  let word = null
  const start = () => (word ??= { text: '', isOpaque: false })
  const end = () => {
    if (word) tokens.push(word)
    word = null
  }
  for (let i = 0; i < command.length; i++) {
    const c = command[i]
    const next = command[i + 1]
    if (c === "'") {
      const close = command.indexOf("'", i + 1)
      start().text += command.slice(i + 1, close < 0 ? command.length : close)
      i = close < 0 ? command.length : close
    } else if (c === '"') {
      start()
      for (i += 1; i < command.length && command[i] !== '"'; i++) {
        if (command[i] === '\\' && i + 1 < command.length) i += 1
        else if (command[i] === '$' || command[i] === '`') word.isOpaque = true
        word.text += command[i]
      }
    } else if (c === '\\' && next === '\n') {
      // A line continued with a backslash is one line
      i += 1
    } else if (c === '\\') {
      start().text += next ?? ''
      i += 1
    } else if (c === ' ' || c === '\t') {
      end()
    } else if (c === '\n' || c === ';' || c === '|' || c === '(' || c === ')' || (c === '&' && next !== '>')) {
      end()
      tokens.push({ op: 'sep' })
      if ((c === '|' || c === '&') && next === c) i += 1
    } else if (c === '>' || (c === '&' && next === '>')) {
      // A digit word right before > is its file descriptor (2>), not an argument
      const fd = c === '&' ? 'all' : word && /^\d+$/.test(word.text) ? word.text : null
      if (fd && c !== '&') word = null
      else end()
      if (c === '&') i += 1
      if (command[i + 1] === '>') i += 1
      if (command[i + 1] === '&') {
        i += 1
        tokens.push({ op: 'dup' })
      } else {
        tokens.push({ op: '>', fd })
      }
    } else if (c === '<') {
      end()
      while (command[i + 1] === '<') i += 1
      tokens.push({ op: '<' })
    } else {
      start().text += c
      if (c === '$' || c === '`' || c === '*' || c === '?' || c === '[') word.isOpaque = true
    }
  }
  end()
  return tokens
}

// Terminal cells a string takes: Hangul and other CJK characters take two
export const displayWidth = (text) =>
  [...text].reduce((w, c) => w + (/[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/.test(c) ? 2 : 1), 0)

// The flow tab. An archify workflow candidate two ways: `lanes`, archify's own grid (one row per
// lane, one cell per column), and `nodes`, a flat list for a pane too narrow for that grid — the
// main path in its own order, then every other node by column and lane.
export function flowRows(candidate) {
  const title = candidate.meta?.title ?? null
  const type = candidate.diagram_type ?? 'workflow'
  if (type === 'dataflow') return dataflowRows(candidate, title)
  if (type !== 'workflow') return { title, unsupported: type }
  const lanes = [...(candidate.lanes ?? [])]
  for (const n of candidate.nodes) if (!lanes.some((l) => l.id === n.lane)) lanes.push({ id: n.lane })
  // Only the columns some node sits in, so a gap in archify's numbering takes no room
  const cols = [...new Set(candidate.nodes.map((n) => n.col ?? 0))].sort((a, b) => a - b)
  const byId = new Map(candidate.nodes.map((n) => [n.id, n]))
  const laneOf = (n) => lanes.findIndex((l) => l.id === n.lane)
  const colOf = (n) => cols.indexOf(n.col ?? 0)
  // Where an arrow goes on the grid: `next` is the cell right after in the same lane, the one
  // arrow drawn between boxes; every other one is a line in the box it leaves
  const direction = (from, to) => {
    if (!to) return 'forward'
    const lane = laneOf(to) - laneOf(from)
    if (lane !== 0) return lane > 0 ? 'down' : 'up'
    const col = colOf(to) - colOf(from)
    return col === 1 ? 'next' : col > 0 ? 'forward' : 'back'
  }
  const main = candidate.mainPath ?? []
  const rank = (n) => (main.includes(n.id) ? main.indexOf(n.id) : main.length)
  const sorted = [...candidate.nodes].sort((a, b) => rank(a) - rank(b) || colOf(a) - colOf(b) || laneOf(a) - laneOf(b))
  const rows = new Map(
    sorted.map((n) => [
      n.id,
      {
        id: n.id,
        label: n.label ?? n.id,
        sublabel: n.sublabel ?? null,
        tag: n.tag ?? null,
        // rules/after-pr.md tags a step that went away; its lane alone doesn't say so, since an
        // exception lane may as well hold a failure path
        isRemoved: n.tag === '없어짐',
        edges: (candidate.edges ?? [])
          .filter((e) => e.from === n.id)
          .map((e) => ({
            toId: e.to,
            to: byId.get(e.to)?.label ?? e.to,
            label: e.label ?? null,
            isMain: !e.role || e.role === 'main',
            direction: direction(n, byId.get(e.to)),
          })),
      },
    ]),
  )
  return {
    title,
    lanes: lanes.map((l) => ({
      label: l.label ?? l.id ?? '',
      isException: l.variant === 'exception',
      cells: cols.map((_, c) => sorted.filter((n) => n.lane === l.id && colOf(n) === c).map((n) => rows.get(n.id))),
    })),
    nodes: sorted.map((n) => rows.get(n.id)),
  }
}

// An archify dataflow candidate: one column per stage, its nodes top to bottom by row, each
// with the flows that leave it. A dashed flow is one archify draws as not there yet.
function dataflowRows(candidate, title) {
  const byId = new Map(candidate.nodes.map((n) => [n.id, n]))
  return {
    title,
    dashedLabel: candidate.meta?.legend?.entries?.dashed?.label ?? null,
    stages: (candidate.stages ?? []).map((stage, i) => ({
      label: stage.label ?? String(i + 1),
      nodes: candidate.nodes
        .filter((n) => n.stage === i)
        .sort((a, b) => (a.row ?? 0) - (b.row ?? 0))
        .map((n) => ({
          id: n.id,
          label: n.label ?? n.id,
          sublabel: n.sublabel ?? null,
          edges: (candidate.flows ?? [])
            .filter((f) => f.from === n.id)
            .map((f) => ({ to: byId.get(f.to)?.label ?? f.to, label: f.label ?? null, isDashed: f.variant === 'dashed' })),
        })),
    })),
  }
}
