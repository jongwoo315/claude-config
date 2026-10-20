import { expect, mock, test } from 'claude-code/testing'

// What Claude Code passes to a ui.render hook for this pane
const PANE = {
  plugin: 'work-board',
  component: 'Pane',
  requestId: 'work-board',
  surface: 'terminal',
  viewport: { columns: 187, rows: 80, isFullscreen: true },
  props: {
    title: 'Work',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const PLAN = `# plan

## Task 1 — 뼈대

- [x] manifest

## Task 2 — 그리기

- [ ] draw
`

test('a plan in docs/plans shows its Task list on the plan tab', async ($, on) => {
  mock.clock(on)
  on('session.start', () => ({ cwd: '/work' }))
  on('command.register', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.cwd', () => ({ value: '/work' }))
  on('fs.exists', ($, e) => ({ value: e.path === '/work/docs/plans' }))
  on('fs.list', () => ({
    value: [
      { name: '1013-design-x.md', kind: 'file', size: 1, mtimeMs: 9, isLink: false },
      { name: '1014-plan-old.md', kind: 'file', size: 1, mtimeMs: 1, isLink: false },
      { name: '1014-plan-new.md', kind: 'file', size: 1, mtimeMs: 5, isLink: false },
    ],
  }))
  on('fs.read', ($, e) => ({ value: e.path === '/work/docs/plans/1014-plan-new.md' ? PLAN : '## Task 9 — wrong file\n' }))
  on('agent.list', () => ({ value: [] }))

  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-plan' })
  expect(await ui.find({ type: 'Text', text: /1014-plan-new\.md/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /● Task 1 — 뼈대/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /○ Task 2 — 그리기/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Task 9/ })).toBeUndefined()
})

test('the work tab shows the turn log even when the session has a plan', async ($, on) => {
  mock.clock(on)
  on('session.start', () => ({ cwd: '/work' }))
  on('command.register', () => ({ value: undefined }))
  on('session.cwd', () => ({ value: '/work' }))
  on('fs.exists', ($, e) => ({ value: e.path === '/work/docs/plans' }))
  on('fs.list', () => ({ value: [{ name: '1014-plan-new.md', kind: 'file', size: 1, mtimeMs: 5, isLink: false }] }))
  on('fs.read', () => ({ value: PLAN }))
  on('agent.list', () => ({ value: [] }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))

  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.turn.start({ turnId: 't1', text: 'fix the login bug' })

  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: /fix the login bug/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Task 1/ })).toBeUndefined()
})

test('the plan tab says so when docs/plans has no plan', async ($, on) => {
  on('session.cwd', () => ({ value: '/work' }))
  on('fs.exists', () => ({ value: false }))
  on('agent.list', () => ({ value: [] }))

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-plan' })
  expect(await ui.find({ type: 'Text', text: /docs\/plans에 \*-plan-\*\.md가 없다/ })).toBeDefined()
})

test('without a plan the work tab shows a timeline of turns and their tools', async ($, on) => {
  on('session.cwd', () => ({ value: '/work' }))
  on('fs.exists', () => ({ value: false }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('tool.call', () => ({ result: 'ok' }))
  on('turn.complete', () => ({ text: '' }))
  on('agent.list', () => ({ value: [] }))

  await $.turn.start({ turnId: 't1', text: 'fix the login bug\nwith details' })
  await $.tool.call({ tool: 'Read', file_path: 'a.py' })
  await $.tool.call({ tool: 'Read', file_path: 'b.py' })
  await $.tool.call({ tool: 'Edit', file_path: 'a.py', old_string: 'x', new_string: 'y' })
  await $.turn.complete({ turnId: 't1', answer: 'done', durationMs: 12000, isAborted: false, usage: null })

  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: /fix the login bug/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Read 2 · Edit 1/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /12s/ })).toBeDefined()
})

test('a subagent tool call is not counted in the main timeline', async ($, on) => {
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('tool.call', () => ({ result: 'ok' }))
  on('agent.list', () => ({ value: [] }))

  await $.turn.start({ turnId: 't1', text: 'look around' })
  await $.tool.call({ tool: 'Grep', pattern: 'x', agentId: 'sub-1' })
  await $.tool.call({ tool: 'Bash', command: 'ls' })

  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: /Bash 1/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Grep/ })).toBeUndefined()
})

test('an empty session says nothing has happened yet', async ($, on) => {
  on('agent.list', () => ({ value: [] }))
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: /아직 턴이 없다/ })).toBeDefined()
})

test('the agents tab shows subagents nested under their parent', async ($, on) => {
  on('agent.list', () => ({
    value: [
      { id: 'a', description: 'explore repo', type: 'Explore', status: 'completed' },
      { id: 'b', description: 'deep dive', type: 'general-purpose', status: 'running', parentId: 'a' },
    ],
  }))

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-agents' })
  expect(await ui.find({ type: 'Text', text: /^└ explore repo/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^ {2}└ deep dive/ })).toBeDefined()
})

test('a spawned subagent stays on the agents tab after it finishes', async ($, on) => {
  on('agent.spawn', () => ({ model: 'claude-test', agentId: 'a1' }))
  on('classic.SubagentStop', () => ({}))
  // A finished background agent is no longer in the live list
  on('agent.list', () => ({ value: [] }))

  await $.agent.spawn({
    tool_use_id: 't1',
    prompt: 'count files',
    description: 'count files',
    subagentType: 'Explore',
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'claude-test',
    background: true,
    fork: false,
  })
  await $.classic.SubagentStop({ agent_id: 'a1', agent_type: 'Explore' })

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-agents' })
  expect(await ui.find({ type: 'Text', text: /^└ count files/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'completed' })).toBeDefined()
})

test('a pane with another id is left to other mods', async ($, on) => {
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['someone else'] }))

  const ui = await $.ui.mount({ ...PANE, requestId: 'other-pane' })
  expect(await ui.find({ type: 'Text', text: 'someone else' })).toBeDefined()
})

test('the files tab lists edited files above read ones, straight from the transcript', async ($, on) => {
  on('session.cwd', () => ({ value: '/work' }))
  on('env.get', ($, e) => ({ value: e.name === 'HOME' ? '/home/jw' : undefined }))
  on('fs.exists', () => ({ value: false }))
  on('agent.list', () => ({ value: [] }))
  // No tool.call ran in this module: the list must come from the transcript alone,
  // which is what keeps it after the mod reloads
  on('session.messages', () => ({
    value: [
      { role: 'assistant', text: '', toolUses: [{ tool_use_id: 'a', tool: 'Read', input: { file_path: '/work/hooks/model.js' } }] },
      { role: 'assistant', text: '', toolUses: [{ tool_use_id: 'b', tool: 'Edit', input: { file_path: '/work/hooks/register.js' } }] },
      { role: 'assistant', text: '', toolUses: [{ tool_use_id: 'c', tool: 'Write', input: { file_path: '/home/jw/notes.md' } }] },
    ],
  }))

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-files' })
  expect(await ui.find({ type: 'Text', text: '고친 파일 2 · 읽은 파일 1' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '~/notes.md' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'hooks/register.js' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'hooks/model.js' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Bash는 sed -i · > · tee 로 쓴 파일만 센다/ })).toBeDefined()
})

test('the files tab says so when nothing was touched', async ($, on) => {
  on('agent.list', () => ({ value: [] }))
  on('session.cwd', () => ({ value: '/work' }))
  on('env.get', () => ({ value: '/home/jw' }))
  on('session.messages', () => ({ value: [] }))

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-files' })
  expect(await ui.find({ type: 'Text', text: /아직 건드린 파일이 없다/ })).toBeDefined()
})

const CANDIDATE = JSON.stringify({
  diagram_type: 'workflow',
  meta: { title: '파일 탭 흐름' },
  lanes: [{ id: 'mod' }],
  nodes: [
    { id: 'msgs', lane: 'mod', col: 0, label: '대화 기록 읽기', tag: '새로 생김' },
    { id: 'draw', lane: 'mod', col: 1, label: '패널 그리기' },
  ],
  edges: [{ id: 'e', from: 'msgs', to: 'draw', label: '그릴 때마다' }],
})
const OLD = JSON.stringify({ diagram_type: 'workflow', meta: { title: '옛 그림' }, nodes: [], edges: [] })
const OTHER_SESSION = JSON.stringify({ diagram_type: 'workflow', meta: { title: '남의 세션' }, nodes: [], edges: [] })
const MINUTE = 60000

// A file system with an old diagram in the cwd and a newer one in this session's scratchpad
function archifyFs(on, files) {
  on('session.cwd', () => ({ value: '/work' }))
  on('session.id', () => ({ value: 'sid-1' }))
  on('clock.now', () => ({ value: 100 * MINUTE }))
  on('agent.list', () => ({ value: [] }))
  const dirs = new Map()
  for (const [path, { mtimeMs }] of Object.entries(files)) {
    const parts = path.split('/')
    for (let i = 1; i < parts.length; i++) {
      const dir = parts.slice(0, i).join('/') || '/'
      const name = parts[i]
      const kind = i === parts.length - 1 ? 'file' : 'dir'
      if (!dirs.has(dir)) dirs.set(dir, new Map())
      dirs.get(dir).set(name, { name, kind, size: 1, mtimeMs: kind === 'file' ? mtimeMs : 0, isLink: false })
    }
  }
  on('fs.exists', ($, e) => ({ value: dirs.has(e.path) || e.path in files }))
  on('fs.list', ($, e) => ({ value: [...(dirs.get(e.path)?.values() ?? [])] }))
  on('fs.read', ($, e) => ({ value: files[e.path].text }))
}

test('the flow tab draws the newest archify diagram of this session', async ($, on) => {
  const scratch = '/private/tmp/claude-501/-work/sid-1/scratchpad/.archify/workflow-files-1'
  archifyFs(on, {
    '/work/.archify/workflow-old-1/candidate.json': { text: OLD, mtimeMs: 10 * MINUTE },
    [scratch + '/candidate.json']: { text: CANDIDATE, mtimeMs: 88 * MINUTE },
    [scratch + '/files-flow.html']: { text: '', mtimeMs: 88 * MINUTE },
    '/private/tmp/claude-501/-work/sid-2/scratchpad/.archify/workflow-x/candidate.json': { text: OTHER_SESSION, mtimeMs: 99 * MINUTE },
  })

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-flow' })
  expect(await ui.find({ type: 'Text', text: /파일 탭 흐름 · 12분 전/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /대화 기록 읽기/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '[새로 생김]' })).toBeDefined()
  // Left to right: the main arrow to the next box is a connector between them
  expect(await ui.find({ type: 'Text', text: '─ 그릴 때마다 ─▶' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /▼/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /→ 패널 그리기/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'HTML: ' + scratch + '/files-flow.html' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /남의 세션|옛 그림/ })).toBeUndefined()
})

test('the flow tab finds a diagram written straight under the scratchpad', async ($, on) => {
  // archify's -o pointed at <scratchpad>/<dir>, not <scratchpad>/.archify/<dir> (2026-10-19)
  const scratch = '/private/tmp/claude-501/-work/sid-1/scratchpad/archify-structure'
  archifyFs(on, {
    [scratch + '/candidate.json']: { text: CANDIDATE, mtimeMs: 88 * MINUTE },
  })
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-flow' })
  expect(await ui.find({ type: 'Text', text: /파일 탭 흐름 · 12분 전/ })).toBeDefined()
})

test('the flow tab says how to get a diagram when there is none', async ($, on) => {
  archifyFs(on, {})
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-flow' })
  expect(await ui.find({ type: 'Text', text: /archify 그림이 없다/ })).toBeDefined()
})

test('the flow tab draws a dataflow as one column per stage', async ($, on) => {
  archifyFs(on, {
    '/work/.archify/dataflow-x/candidate.json': {
      text: JSON.stringify({
        diagram_type: 'dataflow',
        meta: { title: '구조' },
        stages: [{ label: '외부 출처' }, { label: '파일' }],
        nodes: [
          { id: 'pdf', stage: 0, row: 0, label: 'FAQ PDF' },
          { id: 'jsonl', stage: 1, row: 0, label: 'faq.jsonl' },
        ],
        flows: [{ from: 'pdf', to: 'jsonl', label: '질문·답 쌍', variant: 'dashed' }],
      }),
      mtimeMs: 99 * MINUTE,
    },
  })
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-flow' })
  expect(await ui.find({ type: 'Text', text: /구조 · 1분 전/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '외부 출처' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'faq.jsonl' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '⇢ faq.jsonl (질문·답 쌍)' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /아직 못 그린다/ })).toBeUndefined()
})

const RETRY = JSON.stringify({
  diagram_type: 'workflow',
  meta: { title: '재시도' },
  lanes: [
    { id: 'run', label: '정기 실행' },
    { id: 'retry', label: '다시 시도' },
  ],
  mainPath: ['get', 'send'],
  nodes: [
    { id: 'get', lane: 'run', col: 0, label: '요청' },
    { id: 'send', lane: 'run', col: 1, label: '전송' },
    { id: 'wait', lane: 'retry', col: 0, label: '대기' },
  ],
  edges: [
    { id: 'e1', from: 'get', to: 'send', label: '200' },
    { id: 'e2', from: 'get', to: 'wait', label: '429', role: 'branch' },
    { id: 'e3', from: 'wait', to: 'get', label: '다시 요청', role: 'return' },
  ],
})

const wide = (bodyColumns) => ({ ...PANE, props: { ...PANE.props, bodyColumns } })

test('the flow tab draws a workflow as archify does, one row per lane', async ($, on) => {
  archifyFs(on, { '/work/.archify/workflow-retry/candidate.json': { text: RETRY, mtimeMs: 99 * MINUTE } })
  const ui = await $.ui.mount(wide(120))
  await ui.press({ key: 'tab-flow' })
  expect(await ui.find({ type: 'Text', text: '정기 실행' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '다시 시도' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '─ 200 ─▶' })).toBeDefined()
  // Arrows between lanes say which way they go
  expect(await ui.find({ type: 'Text', text: '↓ 대기 (429)' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '↑ 요청 (다시 요청)' })).toBeDefined()
})

test('the flow tab falls back to one wrapping row when the pane is too narrow for the lanes', async ($, on) => {
  archifyFs(on, { '/work/.archify/workflow-retry/candidate.json': { text: RETRY, mtimeMs: 99 * MINUTE } })
  const ui = await $.ui.mount(wide(30))
  await ui.press({ key: 'tab-flow' })
  expect(await ui.find({ type: 'Text', text: '정기 실행' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: '⇢ 대기 (429)' })).toBeDefined()
})

test('the flow tab names a diagram type it cannot draw', async ($, on) => {
  archifyFs(on, {
    '/work/.archify/sequence-x/candidate.json': { text: JSON.stringify({ diagram_type: 'sequence', meta: { title: '순서' } }), mtimeMs: 99 * MINUTE },
  })
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-flow' })
  expect(await ui.find({ type: 'Text', text: /sequence 그림은 아직 못 그린다/ })).toBeDefined()
})

const BAND = {
  plugin: 'work-board',
  component: 'AbovePrompt',
  surface: 'terminal',
  viewport: { columns: 120, rows: 40, isFullscreen: false },
  props: { hasSurvey: false, isWorking: false, maxRows: 3, bodyColumns: 115, scroll: { offset: 0, bodyRows: 3 }, view: {} },
} as const

// A session with a plan of two Tasks (one done), one edited file and one running subagent
function bandSession(on, opened, { hasPlan = true, beneath = true } = {}) {
  on('session.start', () => ({ cwd: '/work' }))
  mock.clock(on)
  on('session.cwd', () => ({ value: '/work' }))
  on('session.id', () => ({ value: 'sid-1' }))
  on('env.get', () => ({ value: '/home/jw' }))
  on('command.register', () => ({ value: undefined }))
  on('ui.open', ($, e) => {
    opened.push(e)
    return { value: { isPlaced: true } }
  })
  on('fs.exists', ($, e) => ({ value: hasPlan && e.path === '/work/docs/plans' }))
  on('fs.list', ($, e) =>
    ({ value: e.path === '/work/docs/plans' ? [{ name: '1014-plan-new.md', kind: 'file', size: 1, mtimeMs: 5, isLink: false }] : [] }))
  on('fs.read', () => ({ value: PLAN }))
  on('agent.list', () => ({ value: [{ id: 'a', description: 'explore', type: 'Explore', status: 'running' }] }))
  on('session.messages', () => ({
    value: [{ role: 'assistant', text: '', toolUses: [{ tool_use_id: 'b', tool: 'Edit', input: { file_path: '/work/x.js' } }] }],
  }))
  // Another mod's band beneath (prompt-rail)
  if (beneath) on('ui.render', () => ({ type: 'Text', props: {}, children: ['prompt rail'] }))
}

test('the band sums up the four tabs in one line', async ($, on) => {
  const opened = []
  bandSession(on, opened)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  const ui = await $.ui.mount(BAND)
  // No archify diagram in this session, so the flow part is left out
  expect(await ui.find({ type: 'Text', text: '✓ 계획 1/2 · ✎ 고친 파일 1 · ✢ 에이전트 1 실행 중' })).toBeDefined()
})

test('the band opens the pane with the keyboard, and the session start does not', async ($, on) => {
  const opened = []
  bandSession(on, opened)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  expect(opened).toEqual([])

  const ui = await $.ui.mount(BAND)
  await ui.press({ key: 'open-pane' })
  expect(opened.map((e) => [e.id, e.focus, e.closeOnEscape])).toEqual([['work-board', true, true]])
})

test('the band leaves out the work part when the session has no plan', async ($, on) => {
  const opened = []
  bandSession(on, opened, { hasPlan: false })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Text', text: '✎ 고친 파일 1 · ✢ 에이전트 1 실행 중' })).toBeDefined()
})

test('the band keeps what another mod draws beneath it', async ($, on) => {
  const opened = []
  bandSession(on, opened)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Text', text: 'prompt rail' })).toBeDefined()
})

test('the band draws its line alone when nothing is drawn beneath it', async ($, on) => {
  const opened = []
  bandSession(on, opened, { beneath: false })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Text', text: /✎ 고친 파일 1/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'prompt rail' })).toBeUndefined()
})

test('the tabs are bracketed buttons and only the open one is marked primary', async ($, on) => {
  on('session.cwd', () => ({ value: '/work' }))
  on('session.id', () => ({ value: 'sid-1' }))
  on('fs.exists', () => ({ value: false }))
  on('agent.list', () => ({ value: [] }))

  const ui = await $.ui.mount(PANE)
  const marks = async () =>
    Object.fromEntries((await ui.findAll({ type: 'Button' })).filter((b) => b.key?.startsWith('tab-')).map((b) => [b.key, [b.props.plain, b.props.variant]]))
  expect(await marks()).toEqual({
    'tab-work': [undefined, 'primary'],
    'tab-plan': [undefined, undefined],
    'tab-agents': [undefined, undefined],
    'tab-files': [undefined, undefined],
    'tab-flow': [undefined, undefined],
  })

  await ui.press({ key: 'tab-flow' })
  expect((await marks())['tab-work']).toEqual([undefined, undefined])
  expect((await marks())['tab-flow']).toEqual([undefined, 'primary'])
})

test('moving the focus onto a tab opens it, with no Enter', async ($, on) => {
  on('session.cwd', () => ({ value: '/work' }))
  on('session.id', () => ({ value: 'sid-1' }))
  on('fs.exists', () => ({ value: false }))
  on('agent.list', () => ({ value: [] }))
  on('ui.focus', () => ({}))

  const ui = await $.ui.mount(PANE)
  await $.ui.focus({ component: 'Pane', requestId: 'work-board', plugin: 'work-board', element: 'tab-flow', origin: { kind: 'person' } })
  const flow = Object.fromEntries((await ui.findAll({ type: 'Button' })).filter((b) => b.key?.startsWith('tab-')).map((b) => [b.key, b.props.variant]))
  expect(flow['tab-flow']).toBe('primary')
})
