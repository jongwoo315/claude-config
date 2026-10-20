import { expect, mock, test } from 'claude-code/testing'
import { THEMES } from '../hooks/themes.js'

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

const ok = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
const failed = (exitCode: number, stderr = '') => ({ value: { exitCode, stdout: '', stderr, isStdoutTruncated: false, isStderrTruncated: false } })

const DIFF_A = '--- a/a.js\n+++ b/a.js\n@@ -1,2 +1,4 @@\n keep\n-old\n+new\n+more\n+most\n'
const DIFF_NEW = '--- /dev/null\n+++ b/new.txt\n@@ -0,0 +1,2 @@\n+one\n+two\n'

// A repo at /work: a.js modified (+3 -1), new.txt untracked (2 lines), committed.js already committed
function repoSession(on, { isRepo = true, numstat = '3\t1\ta.js\0', git = null, messages = null, bigDiff = null } = {}) {
  on('session.cwd', () => ({ value: '/work' }))
  on('env.get', ($, e) => ({ value: e.name === 'HOME' ? '/home/jw' : undefined }))
  on('fs.exists', () => ({ value: false }))
  on('agent.list', () => ({ value: [] }))
  on('fs.read', () => ({ value: 'one\ntwo\n' }))
  on('process.run', ($, e) => {
    if (git) return git(e)
    const [, sub] = e.argv
    if (!isRepo) return failed(128, 'fatal: not a git repository')
    if (sub === 'rev-parse') return ok('/work\n')
    if (sub === 'status') return ok(' M a.js\0?? new.txt\0')
    if (sub === 'diff' && e.argv.includes('--numstat')) return ok(numstat)
    // git diff --no-index exits 1 when the files differ
    if (sub === 'diff' && e.argv.includes('--no-index')) return { value: { ...ok(DIFF_NEW).value, exitCode: 1 } }
    if (sub === 'diff') return ok(bigDiff ?? DIFF_A)
    return failed(1)
  })
  on('session.messages', () => ({
    value: messages ?? [
      { role: 'assistant', text: '', toolUses: [{ tool_use_id: 'a', tool: 'Read', input: { file_path: '/work/hooks/model.js' } }] },
      { role: 'assistant', text: '', toolUses: [{ tool_use_id: 'b', tool: 'Edit', input: { file_path: '/work/a.js' } }] },
      { role: 'assistant', text: '', toolUses: [{ tool_use_id: 'c', tool: 'Write', input: { file_path: '/work/new.txt' } }] },
      { role: 'assistant', text: '', toolUses: [{ tool_use_id: 'd', tool: 'Edit', input: { file_path: '/work/committed.js' } }] },
    ],
  }))
}

test('the changes tab lists edited files git still reports with +/-, and leaves out a committed one', async ($, on) => {
  repoSession(on)

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-changes' })
  expect(await ui.find({ type: 'Text', text: '변경 2 · 읽은 파일 1' })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'change-a.js' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '+3' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '−1' })).toBeDefined()
  // An untracked file counts its lines
  expect(await ui.find({ type: 'Button', key: 'change-new.txt' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '+2' })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'change-committed.js' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'hooks/model.js' })).toBeDefined()
})

test('the changes tab runs git from the repo root, not the session directory', async ($, on) => {
  const seen: string[][] = []
  repoSession(on, {
    git: (e) => {
      seen.push([...e.argv, String(e.init?.cwd)])
      return e.argv[1] === 'rev-parse' ? ok('/work\n') : ok('')
    },
  })
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-changes' })
  expect(seen.find((a) => a[1] === 'status')).toEqual(['git', 'status', '--porcelain', '-z', '--untracked-files=all', '/work'])
  expect(seen.find((a) => a[1] === 'diff')).toEqual(['git', 'diff', '--numstat', '-z', 'HEAD', '/work'])
})

test('the changes tab draws from the transcript alone and says so when it is not a git repo', async ($, on) => {
  repoSession(on, { isRepo: false })

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-changes' })
  expect(await ui.find({ type: 'Text', text: /git repo가 아니라 \+\/−를 못 센다/ })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'change-a.js' })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'change-committed.js' })).toBeDefined()
})

test('the changes tab says git failed when git cannot run', async ($, on) => {
  repoSession(on, {
    git: () => {
      throw new Error('spawn git ENOENT')
    },
  })
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-changes' })
  expect(await ui.find({ type: 'Text', text: /git이 실패해서 \+\/−를 못 센다/ })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'change-a.js' })).toBeDefined()
})

test('the changes tab says so when nothing was touched', async ($, on) => {
  repoSession(on, { messages: [] })

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-changes' })
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
    'tab-changes': [undefined, undefined],
    'tab-diff': [undefined, undefined],
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

const diffOf = async (ui) => (await ui.find({ type: 'Code' }))?.props

test('pressing a changes row opens the diff tab on that file, drawn as a diff', async ($, on) => {
  repoSession(on)
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-changes' })
  await ui.press({ key: 'change-a.js' })
  expect(await diffOf(ui)).toMatchObject({ source: DIFF_A, format: 'diff', path: 'a.js' })
  expect(await ui.find({ type: 'Text', text: 'a.js' })).toBeDefined()
})

test('the diff tab shows the first changed file when none was picked', async ($, on) => {
  repoSession(on)
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-diff' })
  expect(await diffOf(ui)).toMatchObject({ source: DIFF_A, path: 'a.js' })
})

test('the diff tab shows an untracked file as all added, git diff --no-index exiting 1', async ($, on) => {
  repoSession(on)
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-changes' })
  await ui.press({ key: 'change-new.txt' })
  expect(await diffOf(ui)).toMatchObject({ source: DIFF_NEW, format: 'diff', path: 'new.txt' })
})

test('the diff tab says so when nothing is changed', async ($, on) => {
  repoSession(on, { messages: [] })
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-diff' })
  expect(await ui.find({ type: 'Text', text: /보여 줄 변경이 없다/ })).toBeDefined()
  expect(await diffOf(ui)).toBeUndefined()
})

test('the diff tab cuts a long diff at a hunk and says how long it was', async ($, on) => {
  const text = ['--- a/a.js', '+++ b/a.js', ...Array.from({ length: 10 }, (_, h) => ['@@ -1 +1 @@', ...Array.from({ length: 99 }, (_, i) => '+h' + h + 'l' + i)]).flat()].join('\n') + '\n'
  repoSession(on, { bigDiff: text })
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-diff' })
  expect((await diffOf(ui)).source.split('\n')).toHaveLength(302)
  expect(await ui.find({ type: 'Text', text: '1002줄 중 302줄' })).toBeDefined()
})

test('the diff tab cuts a first hunk that alone is over the limit', async ($, on) => {
  const text = ['--- a/a.js', '+++ b/a.js', '@@ -1 +1 @@', ...Array.from({ length: 997 }, (_, i) => '+line ' + i)].join('\n') + '\n'
  repoSession(on, { bigDiff: text })
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-diff' })
  expect(await ui.find({ type: 'Text', text: /1000줄 중 400줄/ })).toBeDefined()
  expect((await diffOf(ui)).source).toContain('@@ -1,0 +1,397 @@')
})

test('the changes tab matches the transcript when git names the repo by its real path', async ($, on) => {
  // The session runs in /work, a symlink; git answers with the real /private/work
  repoSession(on, {
    git: (e) => {
      if (e.argv[1] === 'rev-parse') return ok('/private/work\n\n')
      return e.argv[1] === 'status' ? ok(' M a.js\0') : ok('3\t1\ta.js\0')
    },
  })
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-changes' })
  expect(await ui.find({ type: 'Button', key: 'change-a.js' })).toBeDefined()
})

test('the diff tab passes a renamed file\'s old path to git as well', async ($, on) => {
  const seen: string[][] = []
  repoSession(on, {
    git: (e) => {
      seen.push([...e.argv])
      if (e.argv[1] === 'rev-parse') return ok('/work\n\n')
      if (e.argv[1] === 'status') return ok('R  b.js\0a.js\0')
      return e.argv.includes('--numstat') ? ok('1\t0\tb.js\0') : ok(DIFF_A)
    },
    messages: [{ role: 'assistant', text: '', toolUses: [{ tool_use_id: 'b', tool: 'Write', input: { file_path: '/work/b.js' } }] }],
  })
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-diff' })
  expect(seen.find((a) => a[1] === 'diff' && !a.includes('--numstat'))).toEqual(['git', 'diff', 'HEAD', '--', 'b.js', 'a.js'])
})

test('/board theme still repaints and says so when the choice cannot be saved', async ($, on) => {
  themeSession(on, {}, { isSaveFailing: true })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const ui = await $.ui.mount(PANE)
  const answer = await $.command.run({ command: 'board', args: 'theme dusk' })
  expect(answer.text).toMatch(/저장하지 못했다/)
  expect(await background(ui)).toBe(THEMES.dusk.bg)
})

// Where a hex sits in the xterm 256-color palette, or -1 when it is not exactly one entry
function paletteIndex(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  const cube = [0x00, 0x5f, 0x87, 0xaf, 0xd7, 0xff]
  if ([r, g, b].every((c) => cube.includes(c))) return 16 + 36 * cube.indexOf(r) + 6 * cube.indexOf(g) + cube.indexOf(b)
  return r === g && g === b && r >= 0x08 && r <= 0xee && (r - 0x08) % 10 === 0 ? 232 + (r - 0x08) / 10 : -1
}

test('every theme color is exactly one entry of the 256-color palette', () => {
  expect(Object.keys(THEMES)).toEqual(['classic', 'dusk', 'aurora', 'high-contrast'])
  for (const [name, theme] of Object.entries(THEMES)) {
    for (const [token, value] of Object.entries(theme)) {
      if (typeof value === 'string' && value.startsWith('#')) expect([name, token, paletteIndex(value) >= 0]).toEqual([name, token, true])
    }
  }
  // The four themes paint the pane in four different backgrounds
  expect(new Set(Object.values(THEMES).map((t) => t.bg)).size).toBe(4)
})

// A session with the board registered; the pane's outermost Box carries the background
function themeSession(on, entries = {}, { isSaveFailing = false } = {}) {
  const stored = new Map(Object.entries(entries))
  on('store.get', ($, e) => ({ value: stored.get(e.key) }))
  on('store.set', ($, e) => {
    if (isSaveFailing) throw new Error('store full')
    stored.set(e.key, e.value)
    return { value: undefined }
  })
  themeStore = stored
  mock.clock(on)
  on('session.start', () => ({ cwd: '/work' }))
  on('command.register', () => ({ value: undefined }))
  on('session.cwd', () => ({ value: '/work' }))
  on('fs.exists', () => ({ value: false }))
  on('agent.list', () => ({ value: [] }))
}
let themeStore: Map<string, unknown>
const background = async (ui) => (await ui.find({ type: 'Box' }))?.props.backgroundColor

test('/board theme <name> repaints the pane and keeps the choice for the next session', async ($, on) => {
  themeSession(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  const ui = await $.ui.mount(PANE)
  expect(await background(ui)).toBe(THEMES.classic.bg)
  const answer = await $.command.run({ command: 'board', args: 'theme dusk' })
  expect(answer.text).toMatch(/dusk/)
  expect(await background(ui)).toBe(THEMES.dusk.bg)
  expect(themeStore.get('theme')).toBe('dusk')
})

test('a saved theme is the one the next session draws', async ($, on) => {
  themeSession(on, { theme: 'aurora' })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  const ui = await $.ui.mount(PANE)
  expect(await background(ui)).toBe(THEMES.aurora.bg)
})

test('a saved name that is no theme falls back to classic', async ($, on) => {
  themeSession(on, { theme: 'gone' })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  const ui = await $.ui.mount(PANE)
  expect(await background(ui)).toBe(THEMES.classic.bg)
})

test('/board theme alone lists the themes and the current one', async ($, on) => {
  themeSession(on, { theme: 'dusk' })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  const answer = await $.command.run({ command: 'board', args: 'theme' })
  expect(answer.text).toMatch(/classic/)
  expect(answer.text).toMatch(/high-contrast/)
  expect(answer.text).toMatch(/현재.*dusk/)
})

test('/board theme with a name that is no theme refuses and lists the themes', async ($, on) => {
  themeSession(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  const ui = await $.ui.mount(PANE)
  const answer = await $.command.run({ command: 'board', args: 'theme nope' })
  expect(answer.text).toMatch(/nope/)
  expect(answer.text).toMatch(/aurora/)
  expect(await background(ui)).toBe(THEMES.classic.bg)
  expect(themeStore.get('theme')).toBeUndefined()
})

test('a theme changes the accent of the flow tab headings too', async ($, on) => {
  archifyFs(on, { '/work/.archify/workflow-retry/candidate.json': { text: RETRY, mtimeMs: 99 * MINUTE } })
  on('store.get', () => ({ value: 'high-contrast' }))
  on('session.start', () => ({ cwd: '/work' }))
  on('command.register', () => ({ value: undefined }))
  on('clock.every', () => ({ value: undefined }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  const ui = await $.ui.mount(wide(120))
  await ui.press({ key: 'tab-flow' })
  expect((await ui.find({ type: 'Text', text: '정기 실행' }))?.props.color).toBe(THEMES['high-contrast'].accent)
})

test('/board theme repaints the band above the prompt as well', async ($, on) => {
  const opened = []
  bandSession(on, opened, { beneath: false })
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  const ui = await $.ui.mount(BAND)
  const summary = async () => (await ui.find({ type: 'Text', text: /✎ 고친 파일 1/ }))?.props
  expect((await summary()).dimColor).toBe(true)
  await $.command.run({ command: 'board', args: 'theme dusk' })
  expect((await summary()).color).toBe(THEMES.dusk.muted)
})
