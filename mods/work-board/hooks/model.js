// Pure state updates for the work board. No $ and no drawing here, so tests can call them directly.

// The work tab shows a plan's Tasks when the session has one, and a timeline of turns otherwise.

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

const MAX_TURNS = 20

// A turn: { id, prompt (first line), tools: { Read: 2, ... }, durationMs, isRunning }
export function startTurn(turns, id, text) {
  const prompt = (text ?? '').split('\n')[0].trim()
  return [...turns, { id, prompt, tools: {}, durationMs: null, isRunning: true }].slice(-MAX_TURNS)
}

// Counts a tool call against the turn that is running now
export function addTool(turns, tool) {
  const last = turns[turns.length - 1]
  if (!last || !last.isRunning) return turns
  const tools = { ...last.tools, [tool]: (last.tools[tool] ?? 0) + 1 }
  return [...turns.slice(0, -1), { ...last, tools }]
}

export function endTurn(turns, id, durationMs) {
  return turns.map((t) => (t.id === id ? { ...t, durationMs: durationMs ?? null, isRunning: false } : t))
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

// The files tab. Built from the transcript, not from hooks, so it survives a reload and a /resume.
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

// The flow tab. An archify workflow candidate laid out as a vertical list: the pane is too
// narrow for archify's columns, so nodes go top to bottom by column, then by lane.
export function flowRows(candidate) {
  const title = candidate.meta?.title ?? null
  const type = candidate.diagram_type ?? 'workflow'
  if (type !== 'workflow') return { title, unsupported: type }
  const lanes = (candidate.lanes ?? []).map((l) => l.id)
  // rules/after-pr.md puts steps that went away in a lane of their own, drawn as an exception
  const removedLanes = new Set((candidate.lanes ?? []).filter((l) => l.variant === 'exception').map((l) => l.id))
  const byId = new Map(candidate.nodes.map((n) => [n.id, n]))
  // The main path in its own order, then every other node by column and lane
  const main = candidate.mainPath ?? []
  const rank = (n) => (main.includes(n.id) ? main.indexOf(n.id) : main.length)
  const nodes = [...candidate.nodes].sort(
    (a, b) => rank(a) - rank(b) || (a.col ?? 0) - (b.col ?? 0) || lanes.indexOf(a.lane) - lanes.indexOf(b.lane),
  )
  return {
    title,
    nodes: nodes.map((n) => ({
      id: n.id,
      label: n.label ?? n.id,
      sublabel: n.sublabel ?? null,
      tag: n.tag ?? null,
      isRemoved: removedLanes.has(n.lane),
      edges: (candidate.edges ?? [])
        .filter((e) => e.from === n.id)
        .map((e) => ({
          toId: e.to,
          to: byId.get(e.to)?.label ?? e.to,
          label: e.label ?? null,
          isMain: !e.role || e.role === 'main',
        })),
    })),
  }
}
