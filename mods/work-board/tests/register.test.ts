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

// orch's queue: A runs its first of two steps in a worktree with a plan, B is done and has none.
// Both were started from tmux session main; C from another session, so this one never shows it
const QUEUE = '/home/jw/.claude/orch/queue'
const ORCH_TASKS = {
  'task-A.json': { id: 'A', target: '/wt/A', steps: ['s1', 's2'], cursor: 0, status: 'running', parent: 'main' },
  'task-B.json': { id: 'B', target: '/wt/B', steps: ['s1'], cursor: 0, status: 'done', parent: 'main' },
  'task-C.json': { id: 'C', target: '/wt/C', steps: ['s1'], cursor: 0, status: 'running', parent: 'other' },
}
// The tmux session this one runs in, as orch's own parent lookup reads it
function tmuxSession(on, name) {
  on('process.run', ($, e) => (e.argv[0] === 'tmux' ? ok(name + '\n') : failed(1)))
}
function orchSession(on, { tasks = ORCH_TASKS, session = 'main' } = {}) {
  mock.clock(on)
  on('session.start', () => ({ cwd: '/work' }))
  on('command.register', () => ({ value: undefined }))
  on('session.cwd', () => ({ value: '/work' }))
  on('session.id', () => ({ value: 'sid-1' }))
  on('env.get', ($, e) => ({ value: { HOME: '/home/jw', TMUX_PANE: '%1' }[e.name] }))
  tmuxSession(on, session)
  on('agent.list', () => ({ value: [] }))
  on('session.messages', () => ({ value: [] }))
  on('fs.exists', ($, e) => ({ value: e.path === QUEUE || e.path === '/wt/A/docs/plans' }))
  on('fs.list', ($, e) => {
    if (e.path === QUEUE) return { value: [...Object.keys(tasks), 'notes.txt'].map((name) => ({ name, kind: 'file', size: 1, mtimeMs: 1, isLink: false })) }
    if (e.path === '/wt/A/docs/plans') {
      return {
        value: [
          { name: '1014-plan-old.md', kind: 'file', size: 1, mtimeMs: 1, isLink: false },
          { name: '1014-plan-new.md', kind: 'file', size: 1, mtimeMs: 5, isLink: false },
        ],
      }
    }
    return { value: [] }
  })
  on('fs.read', ($, e) => {
    const name = e.path.slice(QUEUE.length + 1)
    if (e.path.startsWith(QUEUE)) return { value: JSON.stringify(tasks[name]) }
    return { value: e.path === '/wt/A/docs/plans/1014-plan-new.md' ? PLAN : '## Task 9 — wrong file\n' }
  })
}

test('the orch tab lists the queued tasks, running first, with step and plan progress', async ($, on) => {
  orchSession(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-orch' })
  const rows = (await ui.findAll({ type: 'Text', text: /^[◐●○✗] / })).map((t) => t.children.join(''))
  expect(rows).toEqual(['◐ A  running  step 1/2  plan 1/2', '● Task 1 — 뼈대', '○ Task 2 — 그리기', '● B  done  step 1/1'])
  expect(await ui.find({ type: 'Text', text: /Task 9/ })).toBeUndefined()
})

test('the orch tab says so when orch has no task', async ($, on) => {
  orchSession(on, { tasks: {} })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-orch' })
  expect(await ui.find({ type: 'Text', text: /orch 태스크가 없다/ })).toBeDefined()
})

test('an orch session sees no task: none was started from its tmux session', async ($, on) => {
  orchSession(on, { session: 'claude-orch-A' })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-orch' })
  expect(await ui.findAll({ type: 'Text', text: /^[◐●○✗] / })).toEqual([])
  expect(await ui.find({ type: 'Text', text: /orch 태스크가 없다/ })).toBeDefined()
})

// Two turns: the first reads b.js and edits a.js, the second writes new.txt (see repoSession)
const said = (text: string) => ({ role: 'user', text, toolUses: [] })
const did = (tool: string, input: object) => ({ role: 'assistant', text: '', toolUses: [{ tool_use_id: 'x', tool, input }] })
const TURNS = [
  said('fix the login bug\nwith details'),
  did('Read', { file_path: '/work/b.js' }),
  did('Edit', { file_path: '/work/a.js' }),
  said('<command-name>/board</command-name>'),
  said('add a new file'),
  did('Write', { file_path: '/work/new.txt' }),
  { role: 'assistant', text: 'Added new.txt.\n\n- new.txt: one line', toolUses: [] },
]

test('the work tab rebuilds the turns from the transcript, newest first, with their tools and edited files', async ($, on) => {
  repoSession(on, { messages: TURNS })

  const ui = await $.ui.mount(PANE)
  const rows = (await ui.findAll({ type: 'Button' })).filter((b) => b.key?.startsWith('turn-'))
  expect(rows.map((b) => [b.key, b.props.hotkey])).toEqual([['turn-1', 'a'], ['turn-0', 'b']])
  expect(await ui.find({ type: 'Text', text: /2 {2}add a new file/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /1 {2}fix the login bug/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /with details|command-name/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'Read 1 · Edit 1 · 파일 1' })).toBeDefined()
  // Each turn ends with the first line of its reply, when it has one
  expect(await ui.find({ type: 'Text', text: 'Write 1 · 파일 1 · Added new.txt.' })).toBeDefined()
})

test('the newest turn is marked running until the turn completes', async ($, on) => {
  repoSession(on, { messages: TURNS })
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))

  await $.turn.start({ turnId: 't2', text: 'add a new file' })
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: /◐ 2/ })).toBeDefined()
  await $.turn.complete({ turnId: 't2', answer: '', durationMs: 1, isAborted: false, usage: null })
  expect(await ui.find({ type: 'Text', text: /◐/ })).toBeUndefined()
})

test('a turn opens on its prompt and reply, with pin, its changes and back', async ($, on) => {
  repoSession(on, { messages: TURNS })

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'turn-1' })
  expect(await ui.find({ type: 'Text', text: /턴 2 {2}add a new file/ })).toBeDefined()
  expect((await ui.find({ type: 'Markdown' }))?.props.text).toBe('Added new.txt.\n\n- new.txt: one line')
  const keys = (await ui.findAll({ type: 'Button' })).filter((b) => b.key?.startsWith('turn-')).map((b) => [b.key, b.props.hotkey])
  expect(keys).toEqual([['turn-pin', 'p'], ['turn-changes', 'c'], ['turn-back', '0']])

  await ui.press({ key: 'turn-back' })
  expect(await ui.find({ type: 'Markdown' })).toBeUndefined()
  expect(await ui.find({ type: 'Button', key: 'turn-0' })).toBeDefined()
})

test('a turn with no reply text opens with no pin to press', async ($, on) => {
  repoSession(on, { messages: TURNS })

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'turn-0' })
  expect(await ui.find({ type: 'Button', key: 'turn-pin' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /응답 글이 없다/ })).toBeDefined()
})

test('an opened turn shows the changes tab with only the files it touched; 0 shows them all again', async ($, on) => {
  repoSession(on, { messages: TURNS })

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'turn-0' })
  await ui.press({ key: 'turn-changes' })
  expect(await ui.find({ type: 'Text', text: /턴 1만 보는 중/ })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'change-a.js' })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'change-new.txt' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'b.js' })).toBeDefined()
  expect((await ui.find({ type: 'Button', key: 'turn-filter-off' }))?.props.hotkey).toBe('0')

  await ui.press({ key: 'turn-filter-off' })
  expect(await ui.find({ type: 'Text', text: /턴 1만 보는 중/ })).toBeUndefined()
  expect(await ui.find({ type: 'Button', key: 'change-new.txt' })).toBeDefined()
})

test('with a turn picked the diff tab picks from its files and says the diff is the whole change', async ($, on) => {
  repoSession(on, { messages: TURNS })

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'turn-1' })
  await ui.press({ key: 'turn-changes' })
  await ui.press({ key: 'tab-diff' })
  expect(await ui.find({ type: 'Text', text: 'new.txt' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /그 턴만이 아니라 HEAD 대비 전체다/ })).toBeDefined()
})

// The store of a session with id sid-1, as the engine's JSON file keeps it
function pinStore(on, entries = {}, { isSaveFailing = false } = {}) {
  const stored = new Map(Object.entries(entries))
  mock.clock(on)
  on('session.start', () => ({ cwd: '/work' }))
  on('command.register', () => ({ value: undefined }))
  on('session.id', () => ({ value: 'sid-1' }))
  on('store.get', ($, e) => ({ value: stored.get(e.key) }))
  on('store.keys', () => ({ value: [...stored.keys()] }))
  on('store.delete', ($, e) => {
    stored.delete(e.key)
    return { value: undefined }
  })
  on('store.set', ($, e) => {
    if (isSaveFailing) throw new Error('store full')
    stored.set(e.key, e.value)
    return { value: undefined }
  })
  return stored
}
const PINNED = { turn: 1, prompt: 'add a new file', text: 'Added new.txt.\n\n- new.txt: one line' }

test('p pins the reply of the opened turn to the pin tab, the band and the store; p again unpins it', async ($, on) => {
  repoSession(on, { messages: TURNS })
  const stored = pinStore(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  const ui = await $.ui.mount(PANE)
  const band = await $.ui.mount(BAND)
  await ui.press({ key: 'turn-1' })
  await ui.press({ key: 'turn-pin' })
  expect(stored.get('pins:sid-1')?.pins).toEqual([PINNED])
  expect(await ui.find({ type: 'Text', text: 'pin 풀기' })).toBeDefined()
  expect(await band.find({ type: 'Text', text: /⚑ Pin 1$/ })).toBeDefined()

  await ui.press({ key: 'tab-pin' })
  expect(await ui.find({ type: 'Text', text: /⚑ 턴 2 {2}add a new file/ })).toBeDefined()
  expect((await ui.find({ type: 'Markdown' }))?.props.text).toBe(PINNED.text)

  await ui.press({ key: 'tab-work' })
  await ui.press({ key: 'turn-pin' })
  expect(stored.has('pins:sid-1')).toBe(false)
  expect(await band.find({ type: 'Text', text: /⚑ Pin/ })).toBeUndefined()
})

test('the pins of this session come back from the store at session start; a letter removes one', async ($, on) => {
  repoSession(on, { messages: TURNS })
  const stored = pinStore(on, { 'pins:sid-1': { at: 1, pins: [PINNED] }, 'pins:sid-2': { at: 1, pins: [{ ...PINNED, prompt: 'other session' }] } })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-pin' })
  expect(await ui.find({ type: 'Text', text: /other session/ })).toBeUndefined()
  const remove = await ui.find({ type: 'Button', key: 'pin-del-1' })
  expect(remove?.props.hotkey).toBe('a')
  await ui.press({ key: 'pin-del-1' })
  expect(await ui.find({ type: 'Text', text: /pin이 없다/ })).toBeDefined()
  expect(stored.has('pins:sid-1')).toBe(false)
  expect(stored.has('pins:sid-2')).toBe(true)
})

test('the store keeps the pins of the newest 20 sessions', async ($, on) => {
  repoSession(on, { messages: TURNS })
  const old = Object.fromEntries(Array.from({ length: 20 }, (_, i) => ['pins:old-' + i, { at: i, pins: [PINNED] }]))
  const stored = pinStore(on, { ...old, theme: 'dracula' })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'turn-1' })
  await ui.press({ key: 'turn-pin' })
  expect(stored.has('pins:old-0')).toBe(false)
  expect(stored.has('pins:old-1')).toBe(true)
  expect(stored.has('pins:sid-1')).toBe(true)
  expect(stored.get('theme')).toBe('dracula')
})

test('a pin the store would not take stays on screen and the pin tab says it was not saved', async ($, on) => {
  repoSession(on, { messages: TURNS })
  pinStore(on, {}, { isSaveFailing: true })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'turn-1' })
  await ui.press({ key: 'turn-pin' })
  await ui.press({ key: 'tab-pin' })
  expect(await ui.find({ type: 'Text', text: /^저장하지 못했다 \(.+\)\. 이 세션이 끝나면 사라진다$/ })).toBeDefined()
  expect(await ui.find({ type: 'Markdown' })).toBeDefined()
})

test('/board pin pins what was pasted after it, drawn as the terminal showed it, once', async ($, on) => {
  repoSession(on, { messages: TURNS })
  const stored = pinStore(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  const pasted = '  - 바뀐 동작: 턴에서 Changes로 가려면\r\n    키를 두 번 누른다'
  const answer = await $.command.run({ command: 'board', args: 'pin ' + pasted })
  expect(answer.text).toMatch(/pin했다/)
  await $.command.run({ command: 'board', args: 'pin ' + pasted })
  const [pin] = stored.get('pins:sid-1')?.pins ?? []
  expect(stored.get('pins:sid-1')?.pins).toHaveLength(1)
  expect(pin).toMatchObject({ isPasted: true, text: '- 바뀐 동작: 턴에서 Changes로 가려면\n    키를 두 번 누른다' })

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-pin' })
  expect(await ui.find({ type: 'Text', text: /⚑ 붙여 넣음/ })).toBeDefined()
  expect(await ui.find({ type: 'Markdown' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: pin.text })).toBeDefined()
  await ui.press({ key: 'pin-del-paste-' + pin.at })
  expect(stored.has('pins:sid-1')).toBe(false)
})

test('/board pin with nothing pasted says how to use it', async ($, on) => {
  repoSession(on, { messages: TURNS })
  const stored = pinStore(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  const answer = await $.command.run({ command: 'board', args: 'pin   ' })
  expect(answer.text).toMatch(/붙여 넣는다/)
  expect(stored.has('pins:sid-1')).toBe(false)
})

test('an empty session says nothing has happened yet', async ($, on) => {
  on('agent.list', () => ({ value: [] }))
  on('session.messages', () => ({ value: [] }))
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: /아직 턴이 없다/ })).toBeDefined()
})

test('classic keeps the colors the board drew before themes: green added, red removed, yellow running', async ($, on) => {
  on('agent.list', () => ({
    value: [
      { id: 'a', description: 'one', type: 'Explore', status: 'running' },
      { id: 'b', description: 'two', type: 'Explore', status: 'completed' },
      { id: 'c', description: 'three', type: 'Explore', status: 'failed' },
    ],
  }))
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-agents' })
  const colorOf = async (text: string) => (await ui.find({ type: 'Text', text }))?.props.color
  expect([await colorOf('running'), await colorOf('completed'), await colorOf('failed')]).toEqual(['yellow', 'green', 'red'])
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
function repoSession(on, { isRepo = true, numstat = '3\t1\ta.js\0', git = null, messages = null, bigDiff = null, unreadable = null, cwd = '/work' } = {}) {
  on('session.cwd', () => ({ value: cwd }))
  on('env.get', ($, e) => ({ value: e.name === 'HOME' ? '/home/jw' : undefined }))
  on('fs.exists', () => ({ value: false }))
  on('agent.list', () => ({ value: [] }))
  on('fs.read', ($, e) => {
    if (e.path === unreadable) throw new Error('file is over 4 MiB')
    return { value: 'one\ntwo\n' }
  })
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

test('the changes tab lists edited files git still reports with +/-, and a committed one apart, without +/-', async ($, on) => {
  repoSession(on)

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-changes' })
  expect(await ui.find({ type: 'Text', text: '변경 2 · 커밋했거나 repo 밖 1 · 읽은 파일 1' })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'change-a.js' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '+3' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '−1' })).toBeDefined()
  // An untracked file counts its lines
  expect(await ui.find({ type: 'Button', key: 'change-new.txt' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '+2' })).toBeDefined()
  // The band counts it, so the tab lists it, apart and with no +/-
  expect(await ui.find({ type: 'Button', key: 'change-committed.js' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: '커밋했거나 이 repo 밖 1' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'committed.js' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'hooks/model.js' })).toBeDefined()
})

test('classic draws +N green and −M red on the changes tab', async ($, on) => {
  repoSession(on)
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-changes' })
  expect((await ui.find({ type: 'Text', text: '+3' }))?.props.color).toBe('green')
  expect((await ui.find({ type: 'Text', text: '−1' }))?.props.color).toBe('red')
})

test('the changes tab keeps the other +/- when one untracked file cannot be read', async ($, on) => {
  repoSession(on, { unreadable: '/work/new.txt' })

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-changes' })
  expect(await ui.find({ type: 'Text', text: '+3' })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'change-new.txt' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '+2' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /git이 실패해서/ })).toBeUndefined()
})

test('the diff tab says why there is no diff when git cannot be used', async ($, on) => {
  repoSession(on, { isRepo: false })

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-diff' })
  expect(await ui.find({ type: 'Text', text: /git 없이는 diff를 못 만든다 — git repo가 아니라 \+\/−를 못 센다 \(fatal: not a git repository\)/ })).toBeDefined()
  expect(await diffOf(ui)).toBeUndefined()
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

test('the changes tab gives git\'s own reason when status or diff exits nonzero', async ($, on) => {
  // A repo with no commit yet: git diff HEAD cannot name HEAD
  repoSession(on, {
    git: (e) => {
      if (e.argv[1] === 'rev-parse') return ok('/work\n')
      return e.argv[1] === 'diff' ? failed(128, "fatal: ambiguous argument 'HEAD': unknown revision\nUse '--' to separate paths") : ok('')
    },
  })
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-changes' })
  expect(await ui.find({ type: 'Text', text: /git이 실패해서 \+\/−를 못 센다 \(fatal: ambiguous argument 'HEAD': unknown revision\)/ })).toBeDefined()
})

test('the changes tab gives the reason when git cannot name the repo', async ($, on) => {
  repoSession(on, { isRepo: false })
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-changes' })
  expect(await ui.find({ type: 'Text', text: /git repo가 아니라 \+\/−를 못 센다 \(fatal: not a git repository\)/ })).toBeDefined()
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
  expect((await ui.find({ type: 'Text', text: '[새로 생김]' }))?.props.color).toBe('green')
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
function bandSession(on, opened, { hasOrch = true, beneath = true, orch = [{ id: 'A', target: '/wt/A', steps: ['s1'], cursor: 0, status: 'running', parent: 'main' }] } = {}) {
  on('session.start', () => ({ cwd: '/work' }))
  mock.clock(on)
  on('session.cwd', () => ({ value: '/work' }))
  on('session.id', () => ({ value: 'sid-1' }))
  on('env.get', ($, e) => ({ value: { HOME: '/home/jw', TMUX_PANE: '%1' }[e.name] }))
  tmuxSession(on, 'main')
  on('command.register', () => ({ value: undefined }))
  on('ui.open', ($, e) => {
    opened.push(e)
    return { value: { isPlaced: true } }
  })
  const queue = '/home/jw/.claude/orch/queue'
  on('fs.exists', ($, e) => ({ value: hasOrch && e.path === queue }))
  on('fs.list', ($, e) => ({ value: e.path === queue ? orch.map((t) => ({ name: 'task-' + t.id + '.json', kind: 'file', size: 1, mtimeMs: 5, isLink: false })) : [] }))
  on('fs.read', ($, e) => ({ value: JSON.stringify(orch.find((t) => e.path === queue + '/task-' + t.id + '.json')) }))
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
  expect(await ui.find({ type: 'Text', text: '⚙ Orch 1 running · ✎ Changes 1 · ✢ Agents 1 running' })).toBeDefined()
})

test('the band draws no button, so ctrl+x tab goes straight to an open pane; /board opens it with the keyboard', async ($, on) => {
  const opened = []
  bandSession(on, opened)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  expect(opened).toEqual([])

  const ui = await $.ui.mount(BAND)
  expect(await ui.findAll({ type: 'Button' })).toEqual([])
  await $.command.run({ command: 'board', args: '' })
  expect(opened.map((e) => [e.id, e.focus, e.closeOnEscape])).toEqual([['work-board', true, true]])
})

test('the band counts the orch tasks of this session by status, done ones too', async ($, on) => {
  const opened = []
  const task = (id, status, parent = 'main') => ({ id, target: '/wt/' + id, steps: ['s1'], cursor: 0, status, parent })
  bandSession(on, opened, { orch: [task('A', 'done'), task('B', 'running'), task('C', 'done'), task('D', 'running', 'other')] })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Text', text: '⚙ Orch 1 running, 2 done · ✎ Changes 1 · ✢ Agents 1 running' })).toBeDefined()
})

test('the band leaves out the orch part when no orch task runs', async ($, on) => {
  const opened = []
  bandSession(on, opened, { hasOrch: false })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Text', text: '✎ Changes 1 · ✢ Agents 1 running' })).toBeDefined()
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
  expect(await ui.find({ type: 'Text', text: /✎ Changes 1/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'prompt rail' })).toBeUndefined()
})

test('the tabs are plain buttons with their own brackets, the open one in the accent', async ($, on) => {
  on('session.cwd', () => ({ value: '/work' }))
  on('session.id', () => ({ value: 'sid-1' }))
  on('fs.exists', () => ({ value: false }))
  on('agent.list', () => ({ value: [] }))

  const ui = await $.ui.mount(PANE)
  const tabs = (await ui.findAll({ type: 'Button' })).filter((b) => b.key?.startsWith('tab-'))
  expect(tabs.map((b) => [b.key, b.props.plain, b.props.variant, b.props.hotkey])).toEqual(
    ['work', 'orch', 'agents', 'changes', 'diff', 'flow', 'pin'].map((n) => ['tab-' + n, true, undefined, undefined]),
  )
  expect((await ui.find({ type: 'Text', text: '[Work]' }))?.props).toMatchObject({ color: 'cyan', bold: true })
  expect((await ui.find({ type: 'Text', text: '[Flow]' }))?.props.dimColor).toBe(true)

  await ui.press({ key: 'tab-flow' })
  expect((await ui.find({ type: 'Text', text: '[Flow]' }))?.props).toMatchObject({ color: 'cyan', bold: true })
  expect((await ui.find({ type: 'Text', text: '[Work]' }))?.props.dimColor).toBe(true)
})

test('the seven tabs come in order', async ($, on) => {
  on('session.cwd', () => ({ value: '/work' }))
  on('session.id', () => ({ value: 'sid-1' }))
  on('fs.exists', () => ({ value: false }))
  on('agent.list', () => ({ value: [] }))

  const ui = await $.ui.mount(PANE)
  const tabs = (await ui.findAll({ type: 'Button' })).filter((b) => b.key?.startsWith('tab-'))
  expect(tabs.map((b) => b.key)).toEqual(['tab-work', 'tab-orch', 'tab-agents', 'tab-changes', 'tab-diff', 'tab-flow', 'tab-pin'])
  for (const label of ['Work', 'Orch', 'Agents', 'Changes', 'Diff', 'Flow', 'Pin']) expect(await ui.find({ type: 'Text', text: '[' + label + ']' })).toBeDefined()
})

test('the person\'s moves cycle the tabs while the ring stays on its anchor', async ($, on) => {
  on('session.cwd', () => ({ value: '/work' }))
  on('session.id', () => ({ value: 'sid-1' }))
  on('fs.exists', () => ({ value: false }))
  on('agent.list', () => ({ value: [] }))
  on('ui.focus', () => ({}))

  const ui = await $.ui.mount(PANE)
  const selected = async () => {
    for (const label of ['Work', 'Orch', 'Agents', 'Changes', 'Diff', 'Flow', 'Pin']) {
      if ((await ui.find({ type: 'Text', text: '[' + label + ']' }))?.props.bold) return label
    }
  }
  // element absent = the engine aims at its close mark on the border
  const move = (element?: string) =>
    $.ui.focus({ component: 'Pane', requestId: 'work-board', ...(element ? { plugin: 'work-board', element } : {}), origin: { kind: 'person' } })

  expect(await selected()).toBe('Work')
  // From nothing, next aims at the anchor; from the anchor, at tab-work
  await move('ring')
  expect(await selected()).toBe('Orch')
  await move('tab-work')
  expect(await selected()).toBe('Agents')
  // Previous aims at the close mark, which is kept off and is no stop: Work wraps to Pin
  expect((await move()).deny).toBeDefined()
  await move()
  expect(await selected()).toBe('Work')
  await move()
  expect(await selected()).toBe('Pin')
  await move('tab-work')
  expect(await selected()).toBe('Work')
  // A click aims at what it hit and leaves the tab to its press
  await move('tab-diff')
  expect(await selected()).toBe('Work')
  // No close mark of the plugin's own
  expect(await ui.find({ type: 'Button', key: 'close' })).toBeUndefined()
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

test('the changes tab maps git paths to the transcript when the session runs in a subdirectory of the repo', async ($, on) => {
  // Repo root /work, session in /work/mods/x: git answers with paths from the root, the transcript's go by the session's
  repoSession(on, {
    cwd: '/work/mods/x',
    git: (e) => {
      if (e.argv[1] === 'rev-parse') return ok('/work\nmods/x/\n')
      return e.argv[1] === 'status' ? ok(' M mods/x/a.js\0') : ok('5\t2\tmods/x/a.js\0')
    },
    messages: [{ role: 'assistant', text: '', toolUses: [{ tool_use_id: 'b', tool: 'Edit', input: { file_path: '/work/mods/x/a.js' } }] }],
  })
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-changes' })
  expect(await ui.find({ type: 'Button', key: 'change-a.js' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '+5' })).toBeDefined()
})

test('the changes tab maps git paths to the transcript when a symlinked session sits in a subdirectory', async ($, on) => {
  // The session runs in /link/mods/x; git names the root by its real path /private/real
  repoSession(on, {
    cwd: '/link/mods/x',
    git: (e) => {
      if (e.argv[1] === 'rev-parse') return ok('/private/real\nmods/x/\n')
      return e.argv[1] === 'status' ? ok(' M mods/x/a.js\0') : ok('5\t2\tmods/x/a.js\0')
    },
    messages: [{ role: 'assistant', text: '', toolUses: [{ tool_use_id: 'b', tool: 'Edit', input: { file_path: '/link/mods/x/a.js' } }] }],
  })
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-changes' })
  expect(await ui.find({ type: 'Button', key: 'change-a.js' })).toBeDefined()
})

test('the diff tab says so when git diff exits nonzero or prints nothing', async ($, on) => {
  let out: unknown = failed(128, 'fatal: bad revision')
  repoSession(on, { git: (e) => (e.argv[1] === 'rev-parse' ? ok('/work\n') : e.argv[1] === 'status' ? ok(' M a.js\0') : e.argv.includes('--numstat') ? ok('3\t1\ta.js\0') : out) })
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-diff' })
  expect(await ui.find({ type: 'Text', text: 'git diff가 실패했다' })).toBeDefined()
  expect(await diffOf(ui)).toBeUndefined()

  out = ok('')
  await ui.press({ key: 'tab-changes' })
  await ui.press({ key: 'tab-diff' })
  expect(await ui.find({ type: 'Text', text: 'diff가 비어 있다' })).toBeDefined()
  expect(await diffOf(ui)).toBeUndefined()
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

test('every theme defines each token, as a color name or #rrggbb, on its own background', () => {
  expect(Object.keys(THEMES)).toEqual(['classic', 'glowup', 'aurora', 'dusk', 'cyberpunk', 'vaporwave', 'high-contrast'])
  for (const [name, theme] of Object.entries(THEMES)) {
    expect([name, Object.keys(theme)]).toEqual([name, ['bg', 'accent', 'add', 'del', 'warn', 'muted']])
    for (const [token, value] of Object.entries(theme)) {
      if (value !== undefined) expect([name, token, /^(#[0-9a-f]{6}|[a-z]+)$/.test(value)]).toEqual([name, token, true])
    }
  }
  expect(new Set(Object.values(THEMES).map((t) => t.bg)).size).toBe(Object.keys(THEMES).length)
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
  const summary = async () => (await ui.find({ type: 'Text', text: /✎ Changes 1/ }))?.props
  expect((await summary()).dimColor).toBe(true)
  await $.command.run({ command: 'board', args: 'theme dusk' })
  expect((await summary()).color).toBe(THEMES.dusk.muted)
})
