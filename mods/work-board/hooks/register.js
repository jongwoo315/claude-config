import { THEMES } from './themes.js'
import { agentRows, changeRows, countLines, cutDiff, displayWidth, fileRows, flowRows, mergeAgents, parseNumstat, parsePlanTasks, parseStatus, stalePinKeys, turnRows } from './model.js'

const PANE = 'work-board'
const PLANS_DIR = 'docs/plans'
const DIFF_LINES = 400 // the diff tab draws this many lines of a diff, or this many characters (Code's limit),
const DIFF_CHARS = 100000 // cut at a hunk
const TMP = '/private/tmp'
let themeName = 'classic'
const theme = () => THEMES[themeName]
// Dim text: the theme's muted color when it has one, else the terminal's dim
const muted = () => (theme().muted ? { color: theme().muted } : { dimColor: true })

// What the pane shows. Module variables: a reload of this file (a save during development) empties them.
let tab = 'work'
const TABS = ['work', 'orch', 'agents', 'changes', 'diff', 'flow', 'pin']
const RING = 'ring'
const INDENT = 1 // the body's left indent: the width of RING, drawn before the tabs
let orchTasks = [] // orch's queue as loadOrch reads it, for the band
let tmuxSession = null // the tmux session this one runs in: orch tasks started from it name it their parent
let isWorking = false // between turn.start and turn.complete: the newest turn is still running
let turnFilter = null // the turn (index in turnRows) the changes and diff tabs are narrowed to, or null
let detailTurn = null // the turn (index in turnRows) the work tab has opened, or null for the list
// This session's pins, kept in the store under pinKey ('pins:<session id>'): a turn's reply
// { turn, prompt, text }, or what was pasted after /board pin { isPasted, at, text }
// so a reload or a resume keeps them; each session has its own key, or two would overwrite each other
let pins = []
let pinKey = null
let pinError = null // why the last write of the pins failed, shown on the pin tab
const PIN_SESSIONS = 20 // the sessions whose pins the store keeps
// Markdown takes tab and newline as its only control characters and draws 100000 characters in one drawing
const PIN_CHARS = 10000
const DRAWN_CHARS = 90000
const pinId = (p) => (p.isPasted ? 'paste-' + p.at : String(p.turn))
const clip = (text) =>
  text
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
    .trim()
    .slice(0, PIN_CHARS)
let seenAgents = []
let hasRunningAgent = false
let flowAt = null // mtime of the newest archify candidate, or null
let selected = null // the path the changes tab last picked, shown on the diff tab

const MARK = { in_progress: '◐', pending: '○', completed: '●', unknown: '·' }
// The tags rules/after-pr.md puts on a changed-flow diagram
const tagColor = (tag) => (tag === '새로 생김' ? theme().add : tag === '없어짐' ? theme().del : /바뀜|좁아짐/.test(tag) ? theme().warn : undefined)
const agentColor = (status) => {
  const t = theme()
  return { running: t.warn, waiting: t.warn, completed: t.add, failed: t.del, killed: t.del }[status]
}

// Reads the newest plan file under a worktree. No plan, no Task list.
async function loadPlan($, base) {
  const dir = base + '/' + PLANS_DIR
  if (!(await $.fs.exists(dir))) return null
  const files = (await $.fs.list(dir)).filter((f) => f.kind === 'file' && /-plan-.*\.md$/.test(f.name))
  if (files.length === 0) return null
  const newest = files.sort((a, b) => b.mtimeMs - a.mtimeMs)[0]
  const tasks = parsePlanTasks(await $.fs.read(dir + '/' + newest.name))
  return tasks.length > 0 ? { name: newest.name, tasks } : null
}

// The tmux session this one runs in, read the way orch reads a task's parent (orch/lib/task.sh)
async function loadTmuxSession($) {
  const pane = await $.env.get('TMUX_PANE')
  if (!pane) return null
  const out = await $.process.run(['tmux', 'display-message', '-pt', pane, '#{session_name}'])
  return out.exitCode === 0 ? out.stdout.trim() || null : null
}

// The orch tasks started from tmux session parent (~/.claude/orch/queue/task-*.json), running
// first, each with its worktree's plan. An orch session starts none, so it sees none.
// Plans live in the worktrees orch runs, not under the main session's directory.
const ORCH_ORDER = { running: 0, queued: 1, failed: 2, done: 3 }
async function loadOrch($, parent) {
  const queue = (await $.env.get('HOME')) + '/.claude/orch/queue'
  if (parent === null || !(await $.fs.exists(queue))) return []
  const tasks = []
  for (const f of await $.fs.list(queue)) {
    if (f.kind !== 'file' || !/^task-.*\.json$/.test(f.name)) continue
    let task
    try {
      task = JSON.parse(await $.fs.read(queue + '/' + f.name))
    } catch {
      continue // orch is rewriting it, or it is gone: the next read has it
    }
    if (task.parent !== parent) continue
    const plan = task.target ? await loadPlan($, task.target).catch(() => null) : null
    tasks.push({ ...task, plan })
  }
  return tasks.sort((a, b) => (ORCH_ORDER[a.status] ?? 4) - (ORCH_ORDER[b.status] ?? 4))
}

// The newest archify candidate.json of this session: archify's default <cwd>/.archify, or this
// session's scratchpad (rules/after-pr.md keeps company diagrams there) — either its .archify or a
// directory straight under it, since -o names any folder. Another session's is not this work.
async function loadFlow($) {
  const sid = await $.session.id()
  const roots = [(await $.session.cwd()) + '/.archify']
  try {
    for (const tmp of await $.fs.list(TMP)) {
      if (tmp.kind !== 'dir' || !tmp.name.startsWith('claude-')) continue
      for (const project of await $.fs.list(TMP + '/' + tmp.name)) {
        if (project.kind !== 'dir') continue
        const scratchpad = [TMP, tmp.name, project.name, sid, 'scratchpad'].join('/')
        roots.push(scratchpad, scratchpad + '/.archify')
      }
    }
  } catch {
    // The file system may refuse /private/tmp: then only the cwd counts
  }
  let newest = null
  for (const root of roots) {
    if (!(await $.fs.exists(root))) continue
    for (const dir of await $.fs.list(root)) {
      if (dir.kind !== 'dir') continue
      const files = await $.fs.list(root + '/' + dir.name)
      const candidate = files.find((f) => f.name === 'candidate.json')
      if (candidate && (!newest || candidate.mtimeMs > newest.mtimeMs)) {
        const html = files.find((f) => f.name.endsWith('.html'))
        newest = { dir: root + '/' + dir.name, mtimeMs: candidate.mtimeMs, html: html ? root + '/' + dir.name + '/' + html.name : null }
      }
    }
  }
  if (!newest) return null
  return { ...newest, candidate: JSON.parse(await $.fs.read(newest.dir + '/candidate.json')) }
}

// When the newest archify diagram was written, for the band. Read at session start and turn end
// rather than on every draw, since it walks /private/tmp.
async function loadFlowAt($) {
  try {
    return (await loadFlow($))?.mtimeMs ?? null
  } catch {
    return null
  }
}

// The first line of what git or the runtime said, to put after a note: the reason a count is missing
const why = (text) => {
  const first = String(text ?? '').split('\n')[0].trim()
  return first ? ' (' + first + ')' : ''
}

// Writes this session's pins (none: drops its key) and drops the keys of all but the newest sessions
async function savePins($) {
  try {
    pinKey ??= 'pins:' + (await $.session.id())
    if (pins.length === 0) await $.store.delete(pinKey)
    else await $.store.set(pinKey, { at: await $.clock.now(), pins })
    // This session's own key is never the stale one, whatever its clock says
    const others = (await $.store.keys()).filter((key) => key.startsWith('pins:') && key !== pinKey)
    if (others.length >= PIN_SESSIONS) {
      const entries = await Promise.all(others.map(async (key) => ({ key, at: (await $.store.get(key))?.at ?? 0 })))
      for (const key of stalePinKeys(entries, PIN_SESSIONS - 1)) await $.store.delete(key)
    }
    pinError = null
  } catch (err) {
    pinError = '저장하지 못했다' + why(err?.message ?? err) + '. 이 세션이 끝나면 사라진다'
  }
}

// The changes tab's rows: what the conversation edited that git still reports, with +/-. Where git can't
// say (no repo, git failing) the rows are the transcript's edited files alone and `note` says why.
async function loadChanges($) {
  const cwd = await $.session.cwd()
  const messages = await $.session.messages()
  // A picked turn narrows to its own messages. A cd made in an earlier turn is not seen then, so a
  // relative path a Bash command wrote resolves against the session's directory
  const turn = turnFilter === null ? undefined : turnRows(messages)[turnFilter]
  const files = fileRows(turn ? messages.slice(turn.start, turn.end) : messages, cwd, await $.env.get('HOME'))
  const withoutGit = (note) => ({
    changed: files.edited.map((f) => ({ ...f, rel: null, add: null, del: null, isBinary: false, isUntracked: false })),
    settled: [],
    read: files.read,
    note,
  })
  try {
    const run = (argv, dir) => $.process.run(argv, { cwd: dir })
    const top = await run(['git', 'rev-parse', '--show-toplevel', '--show-prefix'], cwd)
    if (top.exitCode !== 0) return withoutGit('git repo가 아니라 +/−를 못 센다' + why(top.stderr))
    const [root, prefix = ''] = top.stdout.split('\n')
    // git names the root by its real path; the transcript's paths go by the session's, which may run through a symlink
    const logicalRoot = prefix && cwd.endsWith('/' + prefix.replace(/\/$/, '')) ? cwd.slice(0, cwd.length - prefix.length) : prefix ? root : cwd
    const status = await run(['git', 'status', '--porcelain', '-z', '--untracked-files=all'], root)
    const diff = await run(['git', 'diff', '--numstat', '-z', 'HEAD'], root)
    if (status.exitCode !== 0 || diff.exitCode !== 0) return withoutGit('git이 실패해서 +/−를 못 센다' + why(status.exitCode !== 0 ? status.stderr : diff.stderr))
    const args = { files, status: parseStatus(status.stdout), stats: parseNumstat(diff.stdout), lines: {}, root: logicalRoot, cwd, home: await $.env.get('HOME') }
    // An untracked file has no diff stat: its lines are all added. One that can't be read (over 4 MiB, gone
    // since git looked) is left without a count; the other rows keep theirs.
    const untracked = changeRows(args).changed.filter((r) => r.isUntracked)
    for (const r of untracked) args.lines[r.rel] = await $.fs.read(root + '/' + r.rel).then(countLines, () => undefined)
    return { ...changeRows(args), root, note: null }
  } catch (e) {
    return withoutGit('git이 실패해서 +/−를 못 센다' + why(e?.message ?? e))
  }
}

// The diff of one changes row: tracked against HEAD, untracked against /dev/null (which exits 1 when the
// files differ). Resolves { source, total } or { error }.
async function loadDiff($, root, file) {
  try {
    // A renamed file's old path goes in too, or git shows the new one as all added
    const paths = [file.rel, ...(file.oldRel ? [file.oldRel] : [])]
    const argv = file.isUntracked ? ['git', 'diff', '--no-index', '--', '/dev/null', file.rel] : ['git', 'diff', 'HEAD', '--', ...paths]
    const out = await $.process.run(argv, { cwd: root })
    if (out.exitCode > (file.isUntracked ? 1 : 0)) return { error: 'git diff가 실패했다' }
    if (out.stdout === '') return { error: 'diff가 비어 있다' }
    const cut = cutDiff(out.stdout, DIFF_LINES, DIFF_CHARS)
    return cut.isTooBig ? { error: 'hunk가 없어 자를 수 없다 (' + cut.total + '줄)' } : cut
  } catch {
    return { error: 'git diff가 실패했다' }
  }
}

const openPane = ($) => $.ui.open({ id: PANE, title: 'Work', focus: true, closeOnEscape: true })

function seconds(ms) {
  if (ms === null || ms === undefined) return '…'
  return ms < 60000 ? Math.round(ms / 1000) + 's' : Math.round(ms / 60000) + 'm'
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'board', description: 'Open the work board, or pick its colors', argumentHint: '[theme [name] | pin <pasted text>]', immediate: true })
    // The saved theme is a nicety: a store that can't be read leaves the classic colors
    const saved = await $.store.get('theme').catch(() => undefined)
    if (typeof saved === 'string' && Object.hasOwn(THEMES, saved)) themeName = saved
    // The pane opens only when asked (/board): a docked pane always on screen
    // was drawn over by the / typeahead. The band above the prompt sums it up meanwhile.
    pinKey = await $.session
      .id()
      .then((sid) => 'pins:' + sid)
      .catch(() => null)
    const savedPins = pinKey && (await $.store.get(pinKey).catch(() => undefined))
    pins = Array.isArray(savedPins?.pins) ? savedPins.pins : []
    tmuxSession = await loadTmuxSession($).catch(() => null)
    orchTasks = await loadOrch($, tmuxSession).catch(() => [])
    flowAt = await loadFlowAt($)
    $.ui.invalidate('ui.render')
    // Subagent status changes don't arrive as events, so poll while one is running
    $.clock.every(2000, () => {
      if (hasRunningAgent) $.ui.invalidate('ui.render')
    })
    // Nor do orch's: its queue files change under a task's own session
    $.clock.every(5000, async () => {
      const latest = await loadOrch($, tmuxSession).catch(() => orchTasks)
      if (JSON.stringify(latest) !== JSON.stringify(orchTasks)) {
        orchTasks = latest
        $.ui.invalidate('ui.render')
      }
    })
    return next(e)
  })

  on('command.run', { command: 'board' }, async ($, e) => {
    const [sub, name] = e.args.trim().split(/\s+/)
    // A part of a reply: the engine sees no selection with fullscreen off, but the terminal copies
    // one from its scrollback, and it comes back pasted after the command
    if (sub === 'pin') {
      const text = clip(e.args.trim().slice('pin'.length))
      if (text === '') return { text: '붙여 넣을 글이 없다. 응답에서 고른 부분을 복사해 /board pin 뒤에 붙여 넣는다' }
      if (!pins.some((p) => p.text === text)) pins = [...pins, { isPasted: true, at: await $.clock.now(), text }]
      $.ui.invalidate('ui.render')
      await savePins($)
      return { text: pinError ?? '붙여 넣은 ' + text.length + '자를 pin했다' }
    }
    if (sub !== 'theme') {
      await openPane($)
      return {}
    }
    const names = Object.keys(THEMES).join(' · ')
    if (!name) return { text: '테마: ' + names + '\n현재: ' + themeName }
    if (!Object.hasOwn(THEMES, name)) return { text: '없는 테마: ' + name + '\n테마: ' + names }
    themeName = name
    $.ui.invalidate('ui.render')
    try {
      await $.store.set('theme', name)
    } catch {
      return { text: '테마를 ' + name + '(으)로 바꿨지만 저장하지 못했다. 새 세션에서는 이전 테마로 열린다' }
    }
    return { text: '테마를 ' + name + '(으)로 바꿨다' }
  })

  // The turns themselves come from the transcript (turnRows); only whether one is running is kept here
  on('turn.start', async ($, e, next) => {
    isWorking = true
    $.ui.invalidate('ui.render')
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    isWorking = false
    flowAt = await loadFlowAt($)
    $.ui.invalidate('ui.render')
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const out = await next(e)
    // The id only exists once core has started the agent
    if (out.agentId) {
      const agent = { id: out.agentId, description: e.description, type: e.subagentType, status: 'running', parentId: e.parentAgentId }
      seenAgents = mergeAgents(seenAgents, [agent])
      hasRunningAgent = true
      $.ui.invalidate('ui.render')
    }
    return out
  })

  on('classic.SubagentStop', async ($, e, next) => {
    seenAgents = seenAgents.map((a) => (a.id === e.agent_id && a.status === 'running' ? { ...a, status: 'completed' } : a))
    $.ui.invalidate('ui.render')
    return next(e)
  })

  // One line above the prompt summing up the tabs, and a button to open them
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    // One-cell symbols in the family Claude Code draws with (✻ ⏺), East Asian Width N so no
    // width table counts them as two. ✎ and ⇢ are the marks the changes and flow tabs use.
    const parts = []
    const orchCounts = Object.keys(ORCH_ORDER)
      .map((status) => [status, orchTasks.filter((t) => t.status === status).length])
      .filter(([, n]) => n > 0)
    if (orchCounts.length > 0) parts.push('⚙ Orch ' + orchCounts.map(([status, n]) => n + ' ' + status).join(', '))
    const { edited } = fileRows(await $.session.messages(), await $.session.cwd(), await $.env.get('HOME'))
    if (edited.length > 0) parts.push('✎ Changes ' + edited.length)
    const running = mergeAgents(seenAgents, await $.agent.list()).filter((a) => a.status === 'running').length
    if (running > 0) parts.push('✢ Agents ' + running + ' running')
    if (flowAt !== null) parts.push('⇢ Flow ' + Math.max(0, Math.round(((await $.clock.now()) - flowAt) / 60000)) + 'm ago')
    if (pins.length > 0) parts.push('⚑ Pin ' + pins.length)
    // The band has one instance: draw what the plugins beneath drew (prompt-rail) under this line.
    // With no plugin beneath, next(e) is the engine's own band; if it fails the line is drawn alone
    const below = await next(e).catch(() => undefined)
    return Box({
      flexDirection: 'column',
      // A blank row between the transcript above and the band
      marginTop: 1,
      children: [
        // The width sits on the line, not the outer Box: the engine refuses its own band under a Box with a width
        Box({
          flexDirection: 'row',
          columnGap: 2,
          width: e.props.bodyColumns,
          children: [
            Box({ flexShrink: 1, children: [Text({ ...muted(), wrap: 'truncate-end', children: [parts.join(' · ') || '✧ No orch task, changes, agents, flow or pins yet'] })] }),
          ],
        }),
        ...(below ? [below] : []),
      ],
    })
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    const { Box, Text, Button, Code, Markdown } = $.ui.resolve(e)
    const redraw = () => $.ui.invalidate('ui.render')
    // Shown at once, then written: a store that fails leaves the pin on screen and says so on the pin tab
    const setPins = async (list) => {
      pins = list
      redraw()
      await savePins($)
      redraw()
    }

    // Where the ring rests (see ui.focus): one space in the background's color on the background, so
    // the engine's inverse of it is the same cell. Drawn first in the tab row, so it is the ring's
    // first stop; the body is indented by its width (INDENT) to line up with the tabs
    const ringStop = Button({
      key: RING,
      plain: true,
      onPress: () => {},
      children: [Text({ color: theme().bg, backgroundColor: theme().bg, children: [' '] })],
    })
    // The body's width once indented
    const bodyColumns = e.props.bodyColumns - INDENT
    const tabButton = (name, label) =>
      Button({
        key: 'tab-' + name,
        // [Work], glowup's look: a plain Button with its own brackets, colored text and no
        // background. The open tab in the theme's accent, the others in its muted
        plain: true,
        children: [Text(tab === name ? { color: theme().accent, bold: true, children: ['[' + label + ']'] } : { ...muted(), children: ['[' + label + ']'] })],
        onPress: () => {
          tab = name
          redraw()
        },
      })

    const line = (text, { dimColor, ...style } = {}) => Text({ wrap: 'truncate-end', ...style, ...(dimColor ? muted() : {}), children: [text] })

    let body
    if (tab === 'orch') {
      const tasks = await loadOrch($, tmuxSession).catch(() => [])
      const ORCH_MARK = { running: '◐', queued: '○', done: '●', failed: '✗' }
      const progress = (plan) => '  plan ' + plan.tasks.filter((t) => t.status === 'completed').length + '/' + plan.tasks.length
      body =
        tasks.length === 0
          ? [line('이 세션이 띄운 orch 태스크가 없다 (orch clean이 끝난 태스크를 지운다)', { dimColor: true })]
          : tasks.flatMap((t) => {
              const steps = t.steps?.length ?? 0
              const step = t.status === 'done' ? steps : Math.min((t.cursor ?? 0) + 1, steps)
              const head = (ORCH_MARK[t.status] ?? '·') + ' ' + t.id + '  ' + t.status + '  step ' + step + '/' + steps + (t.plan ? progress(t.plan) : '')
              // A running task's Tasks under it, in the plan's order so the next one reads below the done ones
              const tasksOf = t.status === 'running' && t.plan ? t.plan.tasks : []
              return [
                line(head, { bold: t.status === 'running', dimColor: t.status === 'done', color: t.status === 'failed' ? theme().del : undefined }),
                ...tasksOf.map((task) =>
                  Box({ key: 'orch-' + t.id + '-' + task.id, paddingLeft: 2, children: [line(MARK[task.status] + ' ' + task.text, { dimColor: task.status === 'completed', bold: task.status === 'in_progress' })] }),
                ),
              ]
            })
    } else if (tab === 'work') {
      // A transcript that can't be read leaves the tab with the reason, not the whole pane undrawn
      const messages = await $.session.messages().catch((err) => ({ error: '대화 기록을 못 읽었다' + why(err?.message ?? err) }))
      const turns = messages.error ? [] : turnRows(messages)
      const cwd = turns.length > 0 ? await $.session.cwd() : null
      const home = turns.length > 0 ? await $.env.get('HOME') : null
      const opened = detailTurn === null ? undefined : turns[detailTurn]
      // An opened turn: its prompt, its reply as markdown, and what to do with it
      const turnView = (t, i) => {
        const isPinned = pins.some((p) => !p.isPasted && p.turn === i)
        const action = (key, hotkey, label, onPress, style = muted()) => Button({ key, plain: true, hotkey, onPress, children: [Text({ ...style, children: [label] })] })
        return [
          line('턴 ' + (i + 1) + '  ' + (t.prompt || '(빈 프롬프트)'), { bold: true }),
          Box({
            flexDirection: 'row',
            columnGap: 2,
            children: [
              ...(t.reply ? [action('turn-pin', 'p', isPinned ? 'pin 풀기' : 'pin', () => setPins(isPinned ? pins.filter((p) => p.isPasted || p.turn !== i) : [...pins, { turn: i, prompt: t.prompt, text: clip(t.reply) }]), { color: theme().accent })] : []),
              action('turn-changes', 'c', '이 턴의 Changes', () => {
                turnFilter = i
                detailTurn = null
                tab = 'changes'
                redraw()
              }),
              action('turn-back', '0', '목록으로', () => {
                detailTurn = null
                redraw()
              }),
            ],
          }),
          Text({ children: [' '] }),
          t.reply ? Markdown({ key: 'turn-reply', text: clip(t.reply) }) : line('이 턴에는 응답 글이 없다', { dimColor: true }),
        ]
      }
      // Newest first, a letter on each of the first 26: it opens that turn
      body = opened
        ? turnView(opened, detailTurn)
        : turns.length === 0
          ? [line(messages.error ?? '아직 턴이 없다', { dimColor: true })]
          : turns
              .map((t, i) => ({ t, i }))
              .reverse()
              .flatMap(({ t, i }, n) => {
                const isRunning = isWorking && i === turns.length - 1
                const edited = fileRows(messages.slice(t.start, t.end), cwd, home).edited.length
                const tools = Object.entries(t.tools).map(([name, count]) => name + ' ' + count)
                const reply = t.reply?.trim().split('\n')[0]
                const summary = [...tools, ...(edited > 0 ? ['파일 ' + edited] : []), ...(reply ? [reply] : [])].join(' · ') || '도구 없음'
                return [
                  Button({
                    key: 'turn-' + i,
                    plain: true,
                    ...(n < 26 ? { hotkey: String.fromCharCode(97 + n) } : {}),
                    onPress: () => {
                      detailTurn = i
                      redraw()
                    },
                    children: [Text({ wrap: 'truncate-end', bold: isRunning, children: [(isRunning ? '◐ ' : '● ') + (i + 1) + '  ' + (t.prompt || '(빈 프롬프트)')] })],
                  }),
                  Box({ key: 'turn-summary-' + i, paddingLeft: 5, children: [line(summary, { dimColor: true })] }),
                ]
              })
    } else if (tab === 'pin') {
      // Newest first, as many as one drawing takes
      let room = DRAWN_CHARS
      const drawn = [...pins].reverse().filter((p) => (room -= p.text.length) >= 0)
      body = [
        ...(pinError ? [line(pinError, { color: theme().del }), Text({ children: [' '] })] : []),
        ...(pins.length === 0
          ? [line('pin이 없다. Work에서 턴을 고르고 p를 누르거나, 복사한 글을 /board pin 뒤에 붙여 넣는다', { dimColor: true })]
          : drawn.flatMap((p, n) => [
              Box({
                key: 'pin-' + pinId(p),
                flexDirection: 'row',
                columnGap: 2,
                children: [
                  Box({ flexShrink: 1, children: [line(p.isPasted ? '⚑ 붙여 넣음' : '⚑ 턴 ' + (p.turn + 1) + '  ' + p.prompt, { bold: true, color: theme().accent })] }),
                  Button({
                    key: 'pin-del-' + pinId(p),
                    plain: true,
                    ...(n < 26 ? { hotkey: String.fromCharCode(97 + n) } : {}),
                    onPress: () => setPins(pins.filter((q) => pinId(q) !== pinId(p))),
                    children: [Text({ ...muted(), children: ['지우기'] })],
                  }),
                ],
              }),
              // Pasted text is what the terminal drew, markdown already rendered
              p.isPasted ? Text({ key: 'pin-text-' + pinId(p), children: [p.text] }) : Markdown({ key: 'pin-text-' + pinId(p), text: p.text }),
              Text({ children: [' '] }),
            ])),
        ...(drawn.length < pins.length ? [line('한 화면에 그릴 수 있는 글자 수를 넘어 오래된 pin ' + (pins.length - drawn.length) + '개는 그리지 않았다', { dimColor: true })] : []),
      ]
    } else if (tab === 'changes') {
      const { changed, settled, read, note } = await loadChanges($)
      // The ring stays off the pane's buttons (see ui.focus), so a row is picked by its letter
      const changeRow = (f, i) =>
        Button({
          key: 'change-' + f.path,
          plain: true,
          ...(i < 26 ? { hotkey: String.fromCharCode(97 + i) } : {}),
          onPress: () => {
            selected = f.path
            tab = 'diff'
            redraw()
          },
          children: [
            '✎ ' + f.path + ' ',
            ...(f.add === null
              ? []
              : f.isBinary
                ? [Text({ ...muted(), children: ['바이너리'] })]
                : [Text({ color: theme().add, children: ['+' + f.add] }), ' ', Text({ color: theme().del, children: ['−' + f.del] })]),
          ],
        })
      // Path truncates at its start so the file name at the end stays visible
      const readLine = (f) =>
        Box({
          key: 'read-' + f.path,
          flexDirection: 'row',
          columnGap: 1,
          children: [
            line('·', { dimColor: true }),
            Box({ flexGrow: 1, flexShrink: 1, children: [line(f.path, { wrap: 'truncate-start', dimColor: true })] }),
            line('×' + f.count, { dimColor: true }),
          ],
        })
      // The band counts every file edited in the conversation; the ones git no longer shows are listed too
      const settledLine = (f) =>
        Box({
          key: 'settled-' + f.path,
          flexDirection: 'row',
          columnGap: 1,
          children: [
            line('✓', { dimColor: true }),
            Box({ flexGrow: 1, flexShrink: 1, children: [line(f.path, { wrap: 'truncate-start', dimColor: true })] }),
            line('×' + f.count, { dimColor: true }),
          ],
        })
      const groups = [
        changed.map(changeRow),
        settled.length > 0 ? [line('커밋했거나 이 repo 밖 ' + settled.length, { dimColor: true }), ...settled.map(settledLine)] : [],
        read.map(readLine),
      ].filter((g) => g.length > 0)
      const filterRow =
        turnFilter === null
          ? []
          : [
              Box({
                flexDirection: 'row',
                columnGap: 1,
                children: [
                  line('턴 ' + (turnFilter + 1) + '만 보는 중 ·', { color: theme().accent }),
                  Button({ key: 'turn-filter-off', plain: true, hotkey: '0', onPress: () => ((turnFilter = null), redraw()), children: [Text({ ...muted(), children: ['전체 보기'] })] }),
                ],
              }),
              Text({ children: [' '] }),
            ]
      body =
        changed.length + settled.length + read.length === 0
          ? [...filterRow, line(turnFilter === null ? '아직 건드린 파일이 없다' : '이 턴은 파일을 건드리지 않았다', { dimColor: true })]
          : [
              ...filterRow,
              line('변경 ' + changed.length + (settled.length > 0 ? ' · 커밋했거나 repo 밖 ' + settled.length : '') + ' · 읽은 파일 ' + read.length, { bold: true }),
              Text({ children: [' '] }),
              ...groups.flatMap((g, i) => (i === 0 ? g : [Text({ children: [' '] }), ...g])),
              Text({ children: [' '] }),
              ...(note ? [line(note, { dimColor: true })] : []),
              line('Bash는 sed -i · > · tee 로 쓴 파일만 센다. python 등이 쓴 파일은 빠진다', { dimColor: true }),
            ]
    } else if (tab === 'diff') {
      const { changed, root, note } = await loadChanges($)
      const file = changed.find((f) => f.path === selected) ?? changed[0]
      const diff = file && (file.rel === null ? { error: 'git 없이는 diff를 못 만든다' + (note ? ' — ' + note : '') } : await loadDiff($, root, file))
      body = !file
        ? [line('보여 줄 변경이 없다', { dimColor: true })]
        : [
            line(file.path, { bold: true }),
            line('Changes 탭에서 행 앞 글자를 누르면 다른 파일', { dimColor: true }),
            ...(turnFilter === null ? [] : [line('턴 ' + (turnFilter + 1) + '의 파일 중에서 고른다. diff는 그 턴만이 아니라 HEAD 대비 전체다', { dimColor: true })]),
            Text({ children: [' '] }),
            ...(diff.error
              ? [line(diff.error, { dimColor: true })]
              : [
                  Code({ source: diff.source, format: 'diff', path: file.path }),
                  ...(diff.shown < diff.total ? [Text({ children: [' '] }), line(diff.total + '줄 중 ' + diff.shown + '줄', { dimColor: true })] : []),
                ]),
          ]
    } else if (tab === 'flow') {
      const found = await loadFlow($)
      const flow = found && flowRows(found.candidate)
      const minutes = found && Math.max(0, Math.round(((await $.clock.now()) - found.mtimeMs) / 60000))
      const footer = found?.html ? [Text({ children: [' '] }), line('HTML: ' + found.html, { dimColor: true, wrap: 'wrap' })] : []
      if (!flow) {
        body = [
          line('archify 그림이 없다', { dimColor: true }),
          line('Claude에게 「바뀐 흐름 archify로 그려」라고 하면 여기 뜬다', { dimColor: true }),
        ]
      } else if (flow.unsupported) {
        body = [line(flow.unsupported + ' 그림은 아직 못 그린다', { dimColor: true }), ...footer]
      } else if (flow.stages) {
        // A dataflow: one column per stage, left to right. Flows go many to many, so each box
        // lists where its data goes instead of drawing connectors. Columns wrap when the pane
        // is too narrow for all stages side by side.
        const columnWidth = Math.max(22, Math.floor(bodyColumns / Math.max(1, flow.stages.length)) - 1)
        body = [
          line((flow.title ?? '흐름') + ' · ' + minutes + '분 전', { bold: true }),
          ...(flow.dashedLabel ? [line('⇢ 는 ' + flow.dashedLabel, { dimColor: true })] : []),
          Text({ children: [' '] }),
          Box({
            flexDirection: 'row',
            flexWrap: 'wrap',
            columnGap: 1,
            rowGap: 1,
            width: bodyColumns,
            children: flow.stages.map((stage, i) =>
              Box({
                key: 'stage-' + i,
                flexDirection: 'column',
                width: columnWidth,
                flexShrink: 0,
                rowGap: 1,
                children: [
                  line(stage.label, { bold: true, color: theme().accent }),
                  ...stage.nodes.map((n) =>
                    Box({
                      key: 'node-' + n.id,
                      flexDirection: 'column',
                      borderStyle: 'round',
                      borderDimColor: true,
                      paddingX: 1,
                      children: [
                        line(n.label, { bold: true, wrap: 'wrap' }),
                        ...(n.sublabel ? [line(n.sublabel, { dimColor: true, wrap: 'wrap' })] : []),
                        ...n.edges.map((edge) =>
                          line((edge.isDashed ? '⇢ ' : '→ ') + edge.to + (edge.label ? ' (' + edge.label + ')' : ''), {
                            wrap: 'wrap',
                            dimColor: edge.isDashed,
                          }),
                        ),
                      ],
                    }),
                  ),
                ],
              }),
            ),
          }),
          ...footer,
        ]
      } else {
        // A node's box; `others` are the arrows with no connector of their own, one line each
        const nodeBox = (n, width, others, mark) =>
          Box({
            key: 'node-' + n.id,
            flexDirection: 'column',
            width,
            flexShrink: 0,
            borderStyle: 'round',
            borderColor: n.isRemoved ? theme().del : tagColor(n.tag),
            borderDimColor: !n.isRemoved && !tagColor(n.tag),
            paddingX: 1,
            children: [
              line(n.label, { bold: true, wrap: 'wrap', color: n.isRemoved ? theme().del : undefined }),
              ...(n.tag ? [line('[' + n.tag + ']', { color: n.isRemoved ? theme().del : tagColor(n.tag), dimColor: n.tag === '그대로' })] : []),
              ...(n.sublabel ? [line(n.sublabel, { dimColor: true, wrap: 'wrap' })] : []),
              ...others.map((edge) => line(mark(edge) + ' ' + edge.to + (edge.label ? ' (' + edge.label + ')' : ''), { wrap: 'wrap', dimColor: !edge.isMain })),
            ],
          })
        const connectorText = (edge) => (edge.label ? '─ ' + edge.label + ' ─▶' : '──▶')
        const header = [line((flow.title ?? '흐름') + ' · ' + minutes + '분 전', { bold: true }), Text({ children: [' '] })]

        // archify's grid: one row per lane, its name first, each node in its column so the
        // columns line up across lanes. The arrow to the next cell of the same lane sits between
        // the boxes; an arrow to another lane or further along is a line in the box it leaves.
        const cols = flow.lanes[0]?.cells.length ?? 0
        const laneWidth = Math.min(12, Math.max(0, ...flow.lanes.map((l) => displayWidth(l.label)))) + 1
        const nextEdges = flow.nodes.flatMap((n) => n.edges.filter((edge) => edge.direction === 'next'))
        const gap = Math.min(16, Math.max(3, ...nextEdges.map((edge) => displayWidth(connectorText(edge))))) + 1
        const colWidth = Math.floor((bodyColumns - laneWidth - (cols - 1) * gap) / Math.max(1, cols))
        const MARK = { down: '↓', up: '↑', back: '←', forward: '→', next: '→' }

        if (colWidth >= 16) {
          body = [
            ...header,
            Box({
              flexDirection: 'column',
              rowGap: 1,
              width: bodyColumns,
              children: flow.lanes.map((lane, l) =>
                Box({
                  key: 'lane-' + l,
                  flexDirection: 'row',
                  alignItems: 'center',
                  children: [
                    Box({ width: laneWidth, flexShrink: 0, children: [line(lane.label, { bold: true, wrap: 'wrap', color: lane.isException ? theme().del : theme().accent })] }),
                    ...lane.cells.flatMap((cell, c) => {
                      const connector = cell.flatMap((n) => n.edges).find((edge) => edge.direction === 'next')
                      return [
                        Box({
                          key: 'cell-' + l + '-' + c,
                          flexDirection: 'column',
                          width: colWidth,
                          flexShrink: 0,
                          children: cell.map((n) => nodeBox(n, colWidth, n.edges.filter((edge) => edge !== connector), (edge) => MARK[edge.direction])),
                        }),
                        ...(c < cols - 1
                          ? [Box({ key: 'gap-' + l + '-' + c, width: gap, flexShrink: 0, children: connector ? [line(connectorText(connector), { dimColor: true })] : [] })]
                          : []),
                      ]
                    }),
                  ],
                }),
              ),
            }),
            ...footer,
          ]
        } else {
          // Too narrow for the grid: boxes in a row that wraps at the pane's width, the main arrow
          // to the next box a connector between them
          body = [
            ...header,
            Box({
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignItems: 'center',
              rowGap: 1,
              width: bodyColumns,
              children: flow.nodes.flatMap((n, i) => {
                const following = flow.nodes[i + 1]
                const connector = following && n.edges.find((edge) => edge.isMain && edge.toId === following.id)
                return [
                  nodeBox(n, Math.min(bodyColumns, 26), n.edges.filter((edge) => edge !== connector), () => '⇢'),
                  ...(connector ? [Text({ key: 'arrow-' + n.id, dimColor: true, children: [connectorText(connector)] })] : []),
                ]
              }),
            }),
            ...footer,
          ]
        }
      }
    } else {
      // ui.render can read state but not write it, so the merge is local to this draw
      const agents = mergeAgents(seenAgents, await $.agent.list())
      hasRunningAgent = agents.some((a) => a.status === 'running' || a.status === 'waiting' || a.status === 'pending')
      const rows = agentRows(agents)
      body = [
        line('main', { bold: true }),
        ...(rows.length === 0
          ? [line('  subagent 없음', { dimColor: true })]
          : rows.map((r) =>
              Box({
                key: 'agent-' + r.id,
                flexDirection: 'row',
                columnGap: 1,
                children: [
                  line('  '.repeat(r.depth) + '└ ' + r.label),
                  line(r.status, { color: agentColor(r.status), dimColor: !agentColor(r.status) }),
                ],
              }),
            )),
      ]
    }

    return Box({
      flexDirection: 'column',
      width: e.props.bodyColumns,
      // Fill the whole body so the color reaches the bottom, not just the drawn rows
      minHeight: e.props.scroll.bodyRows,
      backgroundColor: theme().bg,
      children: [
        Box({
          flexDirection: 'row',
          children: [
            ringStop,
            Box({ flexDirection: 'row', columnGap: 1, flexGrow: 1, children: [tabButton('work', 'Work'), tabButton('orch', 'Orch'), tabButton('agents', 'Agents'), tabButton('changes', 'Changes'), tabButton('diff', 'Diff'), tabButton('flow', 'Flow'), tabButton('pin', 'Pin')] }),
          ],
        }),
        Text({ children: [' '] }),
        Box({ flexDirection: 'column', paddingLeft: INDENT, children: body }),
      ],
    })
  })

  // Tab, or left/right as ~/.claude/keybindings.json binds them in the Pane context,
  // opens a tab as the focus lands on it, with no Enter
  // The ring never rests on a tab: the engine inverts whatever it holds, a colored block over the
  // open tab. It rests on RING, an invisible one-space Button (see ringStop), and the open tab is
  // drawn in color instead. The engine's aim says the person's direction:
  //   from RING or from nothing  next -> RING or tab-work, previous -> its close mark (it wraps)
  // The engine's close mark takes no color, so it is no stop here: a move aimed at it is kept (a
  // move is redirected only between this plugin's elements). Esc, ctrl+x x or a click closes.
  // A click aims at what it hit; its press opens it.
  on('ui.focus', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    if (e.origin.kind !== 'person') return next(e)
    const el = e.element
    const step = el === RING || el === 'tab-' + TABS[0] ? 1 : el === undefined ? -1 : 0
    if (step !== 0) {
      tab = TABS[(TABS.indexOf(tab) + step + TABS.length) % TABS.length]
      $.ui.invalidate('ui.render')
    }
    if (el === undefined) return { deny: 'work-board keeps the ring on its anchor' }
    return el === RING ? next(e) : next({ ...e, element: RING })
  })
}
