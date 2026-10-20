import { THEMES } from './themes.js'
import { addTool, agentRows, changeRows, countLines, cutDiff, displayWidth, endTurn, fileRows, flowRows, mergeAgents, parseNumstat, parsePlanTasks, parseStatus, startTurn } from './model.js'

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
const TABS = ['work', 'plan', 'agents', 'changes', 'diff', 'flow']
const RING_START = 'ring-start'
const RING_END = 'ring-end'
let rest = null // where the person's ring rests: 'start', 'end' or 'close' (see ui.focus); null before it moved
let plan = null // { name, tasks } of the newest *-plan-*.md in docs/plans, or null
let turns = []
let seenAgents = []
let hasRunningAgent = false
let flowAt = null // mtime of the newest archify candidate, or null
let selected = null // the path the changes tab last picked, shown on the diff tab

const MARK = { in_progress: '◐', pending: '○', completed: '●', unknown: '·' }
const ORDER = { in_progress: 0, pending: 1, unknown: 1, completed: 2 }
// The tags rules/after-pr.md puts on a changed-flow diagram
const tagColor = (tag) => (tag === '새로 생김' ? theme().add : tag === '없어짐' ? theme().del : /바뀜|좁아짐/.test(tag) ? theme().warn : undefined)
const agentColor = (status) => {
  const t = theme()
  return { running: t.warn, waiting: t.warn, completed: t.add, failed: t.del, killed: t.del }[status]
}

// Reads the newest plan file under the session's working directory. No plan, no Task list.
async function loadPlan($) {
  // A relative path doesn't resolve against the session's directory, so build it from cwd
  const dir = (await $.session.cwd()) + '/' + PLANS_DIR
  if (!(await $.fs.exists(dir))) return null
  const files = (await $.fs.list(dir)).filter((f) => f.kind === 'file' && /-plan-.*\.md$/.test(f.name))
  if (files.length === 0) return null
  const newest = files.sort((a, b) => b.mtimeMs - a.mtimeMs)[0]
  const tasks = parsePlanTasks(await $.fs.read(dir + '/' + newest.name))
  return tasks.length > 0 ? { name: newest.name, tasks } : null
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

// The changes tab's rows: what the conversation edited that git still reports, with +/-. Where git can't
// say (no repo, git failing) the rows are the transcript's edited files alone and `note` says why.
async function loadChanges($) {
  const cwd = await $.session.cwd()
  const files = fileRows(await $.session.messages(), cwd, await $.env.get('HOME'))
  const withoutGit = (note) => ({
    changed: files.edited.map((f) => ({ ...f, rel: null, add: null, del: null, isBinary: false, isUntracked: false })),
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
    await $.command.register({ name: 'board', description: 'Open the work board, or pick its colors', argumentHint: '[theme [name]]', immediate: true })
    // The saved theme is a nicety: a store that can't be read leaves the classic colors
    const saved = await $.store.get('theme').catch(() => undefined)
    if (typeof saved === 'string' && Object.hasOwn(THEMES, saved)) themeName = saved
    // The pane opens only when asked (/board or the band's button): a docked pane always on screen
    // was drawn over by the / typeahead. The band above the prompt sums it up meanwhile.
    plan = await loadPlan($)
    flowAt = await loadFlowAt($)
    $.ui.invalidate('ui.render')
    // Subagent status changes don't arrive as events, so poll while one is running
    $.clock.every(2000, () => {
      if (hasRunningAgent) $.ui.invalidate('ui.render')
    })
    return next(e)
  })

  on('command.run', { command: 'board' }, async ($, e) => {
    const [sub, name] = e.args.trim().split(/\s+/)
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

  on('turn.start', async ($, e, next) => {
    turns = startTurn(turns, e.turnId, e.text)
    $.ui.invalidate('ui.render')
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    // A subagent's calls carry agentId; the timeline is the main conversation's
    if (!e.agentId) {
      turns = addTool(turns, e.tool)
      $.ui.invalidate('ui.render')
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    turns = endTurn(turns, e.turnId, e.durationMs)
    // The plan may have changed during the turn (a box ticked, a new plan written)
    plan = await loadPlan($)
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
    if (plan) parts.push('✓ Plan ' + plan.tasks.filter((t) => t.status === 'completed').length + '/' + plan.tasks.length)
    const { edited } = fileRows(await $.session.messages(), await $.session.cwd(), await $.env.get('HOME'))
    if (edited.length > 0) parts.push('✎ Changes ' + edited.length)
    const running = mergeAgents(seenAgents, await $.agent.list()).filter((a) => a.status === 'running').length
    if (running > 0) parts.push('✢ Agents ' + running + ' running')
    if (flowAt !== null) parts.push('⇢ Flow ' + Math.max(0, Math.round(((await $.clock.now()) - flowAt) / 60000)) + 'm ago')
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
            Box({ flexShrink: 1, children: [Text({ ...muted(), wrap: 'truncate-end', children: [parts.join(' · ') || '✧ No plan, changes, agents or flow yet'] })] }),
            Button({ key: 'open-pane', label: 'Open', plain: true, onPress: () => openPane($) }),
          ],
        }),
        ...(below ? [below] : []),
      ],
    })
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    const { Box, Text, Button, Code } = $.ui.resolve(e)
    const redraw = () => $.ui.invalidate('ui.render')

    // Where the ring rests while a tab is open (see ui.focus): one space in the background's color
    // on the background, so the engine's inverse of it is the same cell
    const ringStop = (key) =>
      Button({ key, plain: true, onPress: () => {}, children: [Text({ color: theme().bg, backgroundColor: theme().bg, children: [' '] })] })

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
    if (tab === 'plan' && !plan) {
      body = [line('docs/plans에 *-plan-*.md가 없다 (## Task 제목이 있는 plan만 보인다)', { dimColor: true })]
    } else if (tab === 'plan') {
      const sorted = [...plan.tasks].sort((a, b) => ORDER[a.status] - ORDER[b.status])
      const done = plan.tasks.filter((t) => t.status === 'completed').length
      body = [
        line('plan: ' + plan.name, { dimColor: true }),
        Text({ children: [' '] }),
        ...sorted.map((t) =>
          line(MARK[t.status] + ' ' + t.text, { dimColor: t.status === 'completed', bold: t.status === 'in_progress' }),
        ),
        Text({ children: [' '] }),
        line('완료 ' + done + '/' + plan.tasks.length, { dimColor: true }),
      ]
    } else if (tab === 'work') {
      body =
        turns.length === 0
          ? [line('아직 턴이 없다 (이 패널을 불러온 뒤부터 보인다)', { dimColor: true })]
          : [...turns].reverse().flatMap((t) => {
              const tools = Object.entries(t.tools)
                .map(([name, n]) => name + ' ' + n)
                .join(' · ')
              return [
                line((t.isRunning ? '◐ ' : '● ') + seconds(t.durationMs).padEnd(4) + ' ' + (t.prompt || '(빈 프롬프트)'), {
                  bold: t.isRunning,
                }),
                line('       ' + (tools || '도구 없음'), { dimColor: true }),
              ]
            })
    } else if (tab === 'changes') {
      const { changed, read, note } = await loadChanges($)
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
      body =
        changed.length + read.length === 0
          ? [line('아직 건드린 파일이 없다', { dimColor: true })]
          : [
              line('변경 ' + changed.length + ' · 읽은 파일 ' + read.length, { bold: true }),
              Text({ children: [' '] }),
              ...changed.map(changeRow),
              ...(changed.length > 0 && read.length > 0 ? [Text({ children: [' '] })] : []),
              ...read.map(readLine),
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
        const columnWidth = Math.max(22, Math.floor(e.props.bodyColumns / Math.max(1, flow.stages.length)) - 1)
        body = [
          line((flow.title ?? '흐름') + ' · ' + minutes + '분 전', { bold: true }),
          ...(flow.dashedLabel ? [line('⇢ 는 ' + flow.dashedLabel, { dimColor: true })] : []),
          Text({ children: [' '] }),
          Box({
            flexDirection: 'row',
            flexWrap: 'wrap',
            columnGap: 1,
            rowGap: 1,
            width: e.props.bodyColumns,
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
        const colWidth = Math.floor((e.props.bodyColumns - laneWidth - (cols - 1) * gap) / Math.max(1, cols))
        const MARK = { down: '↓', up: '↑', back: '←', forward: '→', next: '→' }

        if (colWidth >= 16) {
          body = [
            ...header,
            Box({
              flexDirection: 'column',
              rowGap: 1,
              width: e.props.bodyColumns,
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
              width: e.props.bodyColumns,
              children: flow.nodes.flatMap((n, i) => {
                const following = flow.nodes[i + 1]
                const connector = following && n.edges.find((edge) => edge.isMain && edge.toId === following.id)
                return [
                  nodeBox(n, Math.min(e.props.bodyColumns, 26), n.edges.filter((edge) => edge !== connector), () => '⇢'),
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
        Box({ flexDirection: 'row', columnGap: 1, children: [ringStop(RING_START), tabButton('work', 'Work'), tabButton('plan', 'Plan'), tabButton('agents', 'Agents'), tabButton('changes', 'Changes'), tabButton('diff', 'Diff'), tabButton('flow', 'Flow'), ringStop(RING_END)] }),
        Text({ children: [' '] }),
        ...body,
      ],
    })
  })

  // Tab, or left/right as ~/.claude/keybindings.json binds them in the Pane context,
  // opens a tab as the focus lands on it, with no Enter
  // The ring never rests on a tab: the engine inverts whatever it holds, a colored block over the
  // open tab. It rests on one of two one-space Buttons at the ends of the tab row, painted in the
  // pane's background so their inverse is invisible (RING_START before Work, RING_END after Flow),
  // or on the pane's close mark, the stop after Flow. The engine's aim says the person's direction:
  //   from RING_START  next -> tab-work, previous -> the close mark (it wraps)
  //   from RING_END    next -> the close mark (Flow's body draws no Button), previous -> tab-flow
  //   from the close mark  next -> RING_START (it wraps), previous -> what this plugin drew last
  //   from nothing (the pane just took the keys)  next -> RING_START, previous -> the close mark
  // A move is redirected only from one of this plugin's elements to another, never onto or off
  // the close mark, so Flow rests on RING_END to reach it with next, and a move aimed at the close
  // mark that should not land there is kept where it was. A click aims at what it hit; its press opens it.
  on('ui.focus', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    if (e.origin.kind !== 'person') return next(e)
    const el = e.element
    const step =
      rest === 'close' ? (el === RING_START ? 1 : el !== undefined ? -1 : 0)
      : rest === 'end' ? (el === undefined ? 1 : el === 'tab-' + TABS[TABS.length - 1] ? -1 : 0)
      : el === RING_START || el === 'tab-' + TABS[0] ? 1 : el === undefined ? -1 : 0
    if (step !== 0) {
      if (rest === 'close') tab = step > 0 ? TABS[0] : TABS[TABS.length - 1]
      else {
        const i = TABS.indexOf(tab) + step
        if (i >= 0 && i < TABS.length) tab = TABS[i]
        else if (el === undefined) {
          rest = 'close'
          return next(e)
        }
      }
      $.ui.invalidate('ui.render')
    }
    rest = tab === TABS[TABS.length - 1] ? 'end' : 'start'
    const anchor = rest === 'end' ? RING_END : RING_START
    // A move aimed at the close mark can be kept but not redirected: it stays where it was
    if (el === undefined) return { deny: 'work-board keeps the ring on its anchor' }
    return el === anchor ? next(e) : next({ ...e, element: anchor })
  })
}
