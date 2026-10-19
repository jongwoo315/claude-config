import { addTool, agentRows, endTurn, fileRows, flowRows, mergeAgents, parsePlanTasks, startTurn } from './model.js'

const PANE = 'work-board'
const PLANS_DIR = 'docs/plans'
const TMP = '/private/tmp'
// Pane background. Claude Code draws in 256 colors here, so a hex is rounded to the nearest
// palette entry; #262626 (palette 235) is exact and matches the dock's own top and bottom rows.
const PANE_BG = '#262626'

// What the pane shows. Module variables: a reload of this file (a save during development) empties them.
let tab = 'work'
let plan = null // { name, tasks } of the newest *-plan-*.md in docs/plans, or null
let turns = []
let seenAgents = []
let hasRunningAgent = false
let flowAt = null // mtime of the newest archify candidate, or null

const MARK = { in_progress: '◐', pending: '○', completed: '●', unknown: '·' }
const ORDER = { in_progress: 0, pending: 1, unknown: 1, completed: 2 }
// The tags rules/after-pr.md puts on a changed-flow diagram
const tagColor = (tag) => (tag === '새로 생김' ? 'green' : /바뀜|좁아짐/.test(tag) ? 'yellow' : undefined)
const AGENT_COLOR = { running: 'yellow', waiting: 'yellow', completed: 'green', failed: 'red', killed: 'red' }

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
// session's scratchpad (rules/after-pr.md keeps company diagrams there). Another session's is not this work.
async function loadFlow($) {
  const sid = await $.session.id()
  const roots = [(await $.session.cwd()) + '/.archify']
  try {
    for (const tmp of await $.fs.list(TMP)) {
      if (tmp.kind !== 'dir' || !tmp.name.startsWith('claude-')) continue
      for (const project of await $.fs.list(TMP + '/' + tmp.name)) {
        if (project.kind === 'dir') roots.push([TMP, tmp.name, project.name, sid, 'scratchpad/.archify'].join('/'))
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

const openPane = ($) => $.ui.open({ id: PANE, title: 'Work', focus: true, closeOnEscape: true })

function seconds(ms) {
  if (ms === null || ms === undefined) return '…'
  return ms < 60000 ? Math.round(ms / 1000) + 's' : Math.round(ms / 60000) + 'm'
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'board', description: 'Open the work board', immediate: true })
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

  on('command.run', { command: 'board' }, async ($) => {
    await openPane($)
    return {}
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

  // One line above the prompt summing up the four tabs, and a button to open them
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const parts = []
    if (plan) parts.push('작업 ' + plan.tasks.filter((t) => t.status === 'completed').length + '/' + plan.tasks.length)
    const { edited } = fileRows(await $.session.messages(), await $.session.cwd(), await $.env.get('HOME'))
    if (edited.length > 0) parts.push('고친 파일 ' + edited.length)
    const running = mergeAgents(seenAgents, await $.agent.list()).filter((a) => a.status === 'running').length
    if (running > 0) parts.push('에이전트 ' + running + ' 실행 중')
    if (flowAt !== null) parts.push('흐름 ' + Math.max(0, Math.round(((await $.clock.now()) - flowAt) / 60000)) + '분 전')
    return Box({
      flexDirection: 'row',
      columnGap: 2,
      width: e.props.bodyColumns,
      children: [
        Box({ flexShrink: 1, children: [Text({ dimColor: true, wrap: 'truncate-end', children: [parts.join(' · ') || '작업 기록 없음'] })] }),
        Button({ key: 'open-pane', label: '열기', plain: true, onPress: () => openPane($) }),
      ],
    })
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const redraw = () => $.ui.invalidate('ui.render')

    const tabButton = (name, label, hotkey) =>
      Button({
        key: 'tab-' + name,
        label,
        hotkey,
        plain: true,
        dimColor: tab !== name,
        onPress: () => {
          tab = name
          redraw()
        },
      })

    const line = (text, style = {}) => Text({ wrap: 'truncate-end', ...style, children: [text] })

    let body
    if (tab === 'work' && plan) {
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
    } else if (tab === 'files') {
      const { edited, read } = fileRows(await $.session.messages(), await $.session.cwd(), await $.env.get('HOME'))
      // Path truncates at its start so the file name at the end stays visible
      const fileLine = (mark, f) =>
        Box({
          key: 'file-' + mark + f.path,
          flexDirection: 'row',
          columnGap: 1,
          children: [
            line(mark, { dimColor: mark !== '✎' }),
            Box({ flexGrow: 1, flexShrink: 1, children: [line(f.path, { wrap: 'truncate-start', dimColor: mark !== '✎' })] }),
            line('×' + f.count, { dimColor: true }),
          ],
        })
      body =
        edited.length + read.length === 0
          ? [line('아직 건드린 파일이 없다', { dimColor: true })]
          : [
              line('고친 파일 ' + edited.length + ' · 읽은 파일 ' + read.length, { bold: true }),
              Text({ children: [' '] }),
              ...edited.map((f) => fileLine('✎', f)),
              ...(edited.length > 0 && read.length > 0 ? [Text({ children: [' '] })] : []),
              ...read.map((f) => fileLine('·', f)),
              Text({ children: [' '] }),
              line('Bash는 sed -i · > · tee 로 쓴 파일만 센다. python 등이 쓴 파일은 빠진다', { dimColor: true }),
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
      } else {
        // A flowchart left to right: each node a box, the main arrow to the next box a connector
        // between them; boxes past the pane's width wrap to the next row. Any other arrow has no
        // room of its own, so it is a ⇢ line in the box it leaves.
        const boxWidth = Math.min(e.props.bodyColumns, 26)
        body = [
          line((flow.title ?? '흐름') + ' · ' + minutes + '분 전', { bold: true }),
          Text({ children: [' '] }),
          Box({
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            rowGap: 1,
            width: e.props.bodyColumns,
            children: flow.nodes.flatMap((n, i) => {
              const following = flow.nodes[i + 1]
              const connector = following && n.edges.find((edge) => edge.isMain && edge.toId === following.id)
              const others = n.edges.filter((edge) => edge !== connector)
              return [
                Box({
                  key: 'node-' + n.id,
                  flexDirection: 'column',
                  width: boxWidth,
                  flexShrink: 0,
                  borderStyle: 'round',
                  borderColor: n.isRemoved ? 'red' : tagColor(n.tag),
                  borderDimColor: !n.isRemoved && !tagColor(n.tag),
                  paddingX: 1,
                  children: [
                    line(n.label, { bold: true, wrap: 'wrap', color: n.isRemoved ? 'red' : undefined }),
                    ...(n.tag ? [line('[' + n.tag + ']', { color: tagColor(n.tag), dimColor: n.tag === '그대로' })] : []),
                    ...(n.sublabel ? [line(n.sublabel, { dimColor: true })] : []),
                    ...others.map((edge) => line('⇢ ' + edge.to + (edge.label ? ' (' + edge.label + ')' : ''), { dimColor: !edge.isMain })),
                  ],
                }),
                ...(connector
                  ? [Text({ key: 'arrow-' + n.id, dimColor: true, children: [connector.label ? '─ ' + connector.label + ' ─▶' : '──▶'] })]
                  : []),
              ]
            }),
          }),
          ...footer,
        ]
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
                  line(r.status, { color: AGENT_COLOR[r.status], dimColor: !AGENT_COLOR[r.status] }),
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
      backgroundColor: PANE_BG,
      children: [
        Box({ flexDirection: 'row', columnGap: 3, children: [tabButton('work', '작업', '1'), tabButton('agents', '에이전트', '2'), tabButton('files', '파일', '3'), tabButton('flow', '흐름', '4')] }),
        Text({ children: [' '] }),
        ...body,
      ],
    })
  })
}
