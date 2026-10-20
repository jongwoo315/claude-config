import { expect, test } from 'claude-code/testing'
import { addTool, agentRows, bashTargets, changeRows, countLines, displayWidth, endTurn, fileRows, flowRows, mergeAgents, parseNumstat, parsePlanTasks, parseStatus, startTurn } from '../hooks/model.js'

const PLAN = `# plan

## jw 기준

something

## Task 1 — 뼈대

- [x] **Step 1:** manifest
- [x] **Step 2:** hooks.json

## Task 2 — 상태 계산

- [x] write test
- [ ] make it pass

## Task 3 — 그리기

- [ ] draw

## Task 4 — 체크박스 없음

just prose

## 확인

- [ ] not a task
`

test('parsePlanTasks reads each Task heading with a status from its checkboxes', async () => {
  expect(parsePlanTasks(PLAN).map((t) => [t.text, t.status])).toEqual([
    ['Task 1 — 뼈대', 'completed'],
    ['Task 2 — 상태 계산', 'in_progress'],
    ['Task 3 — 그리기', 'pending'],
    ['Task 4 — 체크박스 없음', 'unknown'],
  ])
})

test('parsePlanTasks of a file with no Task headings is empty', async () => {
  expect(parsePlanTasks('# notes\n\n- [ ] a\n')).toEqual([])
})

test('a turn counts the tools called during it and ends with its duration', async () => {
  let turns = startTurn([], 't1', 'fix the bug\nmore detail')
  turns = addTool(turns, 'Read')
  turns = addTool(turns, 'Read')
  turns = addTool(turns, 'Edit')
  turns = endTurn(turns, 't1', 12000)
  expect(turns).toEqual([
    { id: 't1', prompt: 'fix the bug', tools: { Read: 2, Edit: 1 }, durationMs: 12000, isRunning: false },
  ])
})

test('startTurn keeps only the newest turns', async () => {
  let turns = []
  for (let i = 0; i < 25; i++) turns = startTurn(turns, 't' + i, 'p' + i)
  expect(turns.length).toBe(20)
  expect(turns[0].id).toBe('t5')
})

test('addTool with no running turn changes nothing', async () => {
  expect(addTool([], 'Read')).toEqual([])
})

test('mergeAgents keeps agents the live list dropped and takes live status over stored', async () => {
  const seen = [
    { id: 'a', description: 'done one', type: 'Explore', status: 'completed' },
    { id: 'b', description: 'live one', type: 'Explore', status: 'running' },
  ]
  const live = [{ id: 'b', description: 'live one', type: 'Explore', status: 'failed' }]
  expect(mergeAgents(seen, live).map((a) => [a.id, a.status])).toEqual([
    ['a', 'completed'],
    ['b', 'failed'],
  ])
})

test('mergeAgents adds a live agent it has not seen', async () => {
  const live = [{ id: 'c', description: 'new', type: 'Explore', status: 'running' }]
  expect(mergeAgents([], live).map((a) => a.id)).toEqual(['c'])
})

test('agentRows nests children under their parent', async () => {
  const rows = agentRows([
    { id: 'a', description: 'explore', type: 'Explore', status: 'completed' },
    { id: 'b', description: 'child of a', type: 'general-purpose', status: 'running', parentId: 'a' },
    { id: 'c', description: 'review', type: 'code-reviewer', status: 'failed' },
  ])
  expect(rows.map((r) => [r.depth, r.label, r.status])).toEqual([
    [0, 'explore', 'completed'],
    [1, 'child of a', 'running'],
    [0, 'review', 'failed'],
  ])
})

test('agentRows puts an agent whose parent is missing at the top level', async () => {
  const rows = agentRows([{ id: 'x', description: 'orphan', type: 'Explore', status: 'running', parentId: 'gone' }])
  expect(rows.map((r) => [r.depth, r.label])).toEqual([[0, 'orphan']])
})

test('agentRows of an empty list is empty', async () => {
  expect(agentRows([])).toEqual([])
})

// One assistant message per tool use, in transcript order
const used = (...uses) => uses.map(([tool, input, isError]) => ({
  role: 'assistant',
  text: '',
  toolUses: [{ tool_use_id: 'u', tool, input, ...(isError ? { isError: true } : {}) }],
}))

test('fileRows splits edited and read files and counts calls', async () => {
  const rows = fileRows(
    used(
      ['Read', { file_path: '/work/a.js' }],
      ['Read', { file_path: '/work/b.js' }],
      ['Edit', { file_path: '/work/a.js' }],
      ['Write', { file_path: '/work/c.md' }],
      ['Read', { file_path: '/work/b.js' }],
      ['NotebookEdit', { notebook_path: '/work/n.ipynb' }],
    ),
    '/work',
    '/home/jw',
  )
  // a.js was read and edited: it counts once, under edited, with both calls
  expect(rows.edited).toEqual([
    { path: 'a.js', count: 2 },
    { path: 'c.md', count: 1 },
    { path: 'n.ipynb', count: 1 },
  ])
  expect(rows.read).toEqual([{ path: 'b.js', count: 2 }])
})

test('fileRows lists files by directory, then name', async () => {
  const rows = fileRows(
    used(
      ['Read', { file_path: '/work/tests/z.ts' }],
      ['Read', { file_path: '/work/hooks/sub/y.js' }],
      ['Read', { file_path: '/work/README.md' }],
      ['Read', { file_path: '/work/hooks/b.js' }],
      ['Read', { file_path: '/work/hooks/a.js' }],
    ),
    '/work',
    '/home/jw',
  )
  expect(rows.read.map((r) => r.path)).toEqual(['README.md', 'hooks/a.js', 'hooks/b.js', 'hooks/sub/y.js', 'tests/z.ts'])
})

test('fileRows counts files a Bash command wrote as edited', async () => {
  const rows = fileRows(
    used(
      ['Read', { file_path: '/work/hooks/r.js' }],
      ['Bash', { command: "cd /work/hooks && sed -i '' -e 's/a/b/' r.js" }],
      ['Bash', { command: 'ls /work' }],
    ),
    '/work',
    '/home/jw',
  )
  expect(rows.edited).toEqual([{ path: 'hooks/r.js', count: 2 }])
  expect(rows.read).toEqual([])
})

test('fileRows skips failed calls and tools that do not touch a file', async () => {
  const rows = fileRows(
    used(
      ['Edit', { file_path: '/work/a.js' }, true],
      ['Bash', { command: 'sed -i s/a/b/ /work/z.js' }, true],
      ['Grep', { pattern: 'x', path: '/work' }],
      ['Read', { file_path: '/work/a.js' }],
    ),
    '/work',
    '/home/jw',
  )
  expect(rows.edited).toEqual([])
  expect(rows.read).toEqual([{ path: 'a.js', count: 1 }])
})

test('fileRows shortens paths outside the working directory with ~ and lists them after the cwd', async () => {
  const rows = fileRows(
    used(
      ['Read', { file_path: '/home/jw/notes/x.md' }],
      ['Read', { file_path: '/workshop/y.js' }],
      ['Read', { file_path: '/etc/hosts' }],
      ['Read', { file_path: '/work/a.js' }],
    ),
    '/work',
    '/home/jw',
  )
  // /workshop is not inside /work, so it stays absolute
  expect(rows.read.map((r) => r.path)).toEqual(['a.js', '~/notes/x.md', '/etc/hosts', '/workshop/y.js'])
})

test('bashTargets finds the files sed -i, > and tee write', async () => {
  const at = (command) => bashTargets(command, '/w', '/home/jw').paths
  expect(at("cd /w/mod && sed -i '' -e 's/a/b/' -e 's/c/d/' hooks/r.js tests/t.ts")).toEqual(['/w/mod/hooks/r.js', '/w/mod/tests/t.ts'])
  expect(at("sed -i 's/x/y/' a.txt")).toEqual(['/w/a.txt'])
  expect(at('sed -i.bak -E "s/x/y/" ./b.txt')).toEqual(['/w/b.txt'])
  expect(at("cd docs/plans && sed -i '' 's/a/b/' p.md; cd ../.. && echo hi > out.log")).toEqual(['/w/docs/plans/p.md', '/w/out.log'])
  expect(at('echo x | tee -a ~/notes.md other.md')).toEqual(['/home/jw/notes.md', '/w/other.md'])
})

test('bashTargets ignores heredoc bodies, reads, devices, stderr and paths it cannot resolve', async () => {
  const at = (command) => bashTargets(command, '/w', '/home/jw').paths
  expect(at("cat >> hooks/m.js <<'EOF'\nconst a = b > c\necho no > body.txt\nEOF\necho done > out.log")).toEqual(['/w/hooks/m.js', '/w/out.log'])
  expect(at('ls > /dev/null 2>&1; grep a b 2> err.txt; sort < in.txt')).toEqual([])
  expect(at('echo $X >> "$ex"; echo a > *.txt; echo b > "$(pwd)/x"')).toEqual([])
  expect(at('sed s/a/b/ in.txt > out.txt')).toEqual(['/w/out.txt'])
  expect(at('echo "a > b" && echo \'c > d\'')).toEqual([])
})

test('fileRows of messages with no tool uses is empty', async () => {
  expect(fileRows([{ role: 'user', text: 'hi', toolUses: [] }], '/work', '/home/jw')).toEqual({ edited: [], read: [] })
})

const FLOW = {
  diagram_type: 'workflow',
  meta: { title: '파일 탭 흐름', output: 'flow.html' },
  lanes: [{ id: 'host' }, { id: 'mod' }, { id: 'gone', variant: 'exception' }],
  nodes: [
    { id: 'draw', lane: 'mod', col: 2, label: '패널 그리기' },
    { id: 'count', lane: 'mod', col: 1, label: '파일 집계', sublabel: 'fileRows', tag: '새로 생김' },
    { id: 'msgs', lane: 'host', col: 1, label: '대화 기록', tag: '그대로' },
    { id: 'old', lane: 'gone', col: 3, label: '모듈 변수에 쌓기', tag: '없어짐' },
  ],
  edges: [
    { id: 'e1', from: 'msgs', to: 'count', label: '그릴 때마다' },
    { id: 'e2', from: 'count', to: 'draw', variant: 'emphasis' },
    { id: 'e3', from: 'old', to: 'msgs', label: '이걸로 바뀜', variant: 'dashed', role: 'branch' },
  ],
}

test('flowRows lists nodes by column then lane, each with its outgoing arrows', async () => {
  const flow = flowRows(FLOW)
  expect(flow.title).toBe('파일 탭 흐름')
  expect(flow.nodes.map((n) => n.label)).toEqual(['대화 기록', '파일 집계', '패널 그리기', '모듈 변수에 쌓기'])
  expect(flow.nodes[0]).toEqual({
    id: 'msgs',
    label: '대화 기록',
    sublabel: null,
    tag: '그대로',
    isRemoved: false,
    edges: [{ toId: 'count', to: '파일 집계', label: '그릴 때마다', isMain: true, direction: 'down' }],
  })
  expect(flow.nodes[1].edges).toEqual([{ toId: 'draw', to: '패널 그리기', label: null, isMain: true, direction: 'next' }])
  expect(flow.nodes[3]).toMatchObject({ isRemoved: true, edges: [{ to: '대화 기록', label: '이걸로 바뀜', isMain: false, direction: 'up' }] })
})

test('flowRows counts every node and arrow of the candidate', async () => {
  const flow = flowRows(FLOW)
  expect(flow.nodes.length).toBe(FLOW.nodes.length)
  expect(flow.nodes.flatMap((n) => n.edges).length).toBe(FLOW.edges.length)
})

test('flowRows reports a diagram type it cannot draw', async () => {
  expect(flowRows({ diagram_type: 'sequence', meta: { title: 't' } })).toEqual({ title: 't', unsupported: 'sequence' })
})

const DATAFLOW = {
  diagram_type: 'dataflow',
  meta: { title: '구조', legend: { entries: { dashed: { label: '아직 없는 연결' } } } },
  stages: [{ label: '외부 출처' }, { label: '파일' }],
  nodes: [
    { id: 'law', stage: 0, row: 1, label: '법제처 API', sublabel: 'LAW_OC 필요' },
    { id: 'pdf', stage: 0, row: 0, label: 'FAQ PDF' },
    { id: 'jsonl', stage: 1, row: 0, label: 'faq.jsonl' },
  ],
  flows: [
    { from: 'pdf', to: 'jsonl', label: '질문·답 쌍' },
    { from: 'law', to: 'jsonl', label: '조문', variant: 'dashed' },
  ],
}

test('flowRows puts a dataflow into its stages, nodes by row, with outgoing flows', async () => {
  const flow = flowRows(DATAFLOW)
  expect(flow.title).toBe('구조')
  expect(flow.stages.map((s) => s.label)).toEqual(['외부 출처', '파일'])
  expect(flow.stages[0].nodes.map((n) => n.label)).toEqual(['FAQ PDF', '법제처 API'])
  expect(flow.stages[0].nodes[1].sublabel).toBe('LAW_OC 필요')
  expect(flow.stages[0].nodes[0].edges).toEqual([{ to: 'faq.jsonl', label: '질문·답 쌍', isDashed: false }])
  expect(flow.stages[0].nodes[1].edges).toEqual([{ to: 'faq.jsonl', label: '조문', isDashed: true }])
  expect(flow.dashedLabel).toBe('아직 없는 연결')
})

test('flowRows follows mainPath when nodes share a column', async () => {
  const flow = flowRows({
    diagram_type: 'workflow',
    lanes: [{ id: 'host' }, { id: 'mod' }],
    mainPath: ['tab', 'msgs'],
    nodes: [
      { id: 'msgs', lane: 'host', col: 3, label: '대화 기록' },
      { id: 'tab', lane: 'mod', col: 3, label: '파일 탭' },
      { id: 'side', lane: 'host', col: 1, label: '기타' },
    ],
    edges: [],
  })
  // mainPath first, then the rest by column
  expect(flow.nodes.map((n) => n.label)).toEqual(['파일 탭', '대화 기록', '기타'])
})

// A retry loop and a failure path, the shape of a PR diagram with an exception lane that holds
// no removed step
const RETRY = {
  diagram_type: 'workflow',
  lanes: [
    { id: 'run', label: '정기 실행' },
    { id: 'retry', label: '다시 시도' },
    { id: 'fail', label: '끝내 실패', variant: 'exception' },
  ],
  mainPath: ['start', 'get', 'send'],
  nodes: [
    { id: 'start', lane: 'run', col: 0, label: '실행' },
    { id: 'get', lane: 'run', col: 1, label: '요청' },
    { id: 'send', lane: 'run', col: 3, label: '전송' },
    { id: 'wait', lane: 'retry', col: 1, label: '대기' },
    { id: 'alarm', lane: 'fail', col: 3, label: '알람', tag: '그대로' },
  ],
  edges: [
    { id: 'e1', from: 'start', to: 'get' },
    { id: 'e2', from: 'get', to: 'send', label: '200' },
    { id: 'e3', from: 'get', to: 'wait', label: '429', role: 'branch' },
    { id: 'e4', from: 'wait', to: 'get', label: '다시 요청', role: 'return' },
    { id: 'e5', from: 'wait', to: 'alarm', role: 'error' },
  ],
}

test('flowRows lays a workflow out as archify does: a row per lane, a cell per column', async () => {
  const flow = flowRows(RETRY)
  expect(flow.lanes.map((l) => [l.label, l.isException])).toEqual([
    ['정기 실행', false],
    ['다시 시도', false],
    ['끝내 실패', true],
  ])
  // Columns 0, 1 and 3: column 2 holds nothing, so it takes no cell
  expect(flow.lanes.map((l) => l.cells.map((cell) => cell.map((n) => n.label).join()))).toEqual([
    ['실행', '요청', '전송'],
    ['', '대기', ''],
    ['', '', '알람'],
  ])
  const edges = (id) => flow.nodes.find((n) => n.id === id).edges.map((e) => e.direction)
  expect(edges('start')).toEqual(['next'])
  // get → send skips the empty column 2, so it is the next cell
  expect(edges('get')).toEqual(['next', 'down'])
  expect(edges('wait')).toEqual(['up', 'down'])
})

test('flowRows takes a step as removed by its tag, not by an exception lane', async () => {
  const flow = flowRows(RETRY)
  expect(flow.nodes.find((n) => n.id === 'alarm').isRemoved).toBe(false)
})

test('displayWidth counts Hangul as two cells', async () => {
  expect(displayWidth('─ 200 ─▶')).toBe(8)
  expect(displayWidth('다시 요청')).toBe(9)
})

test('bashTargets joins lines continued with a backslash and reports where the shell ends up', async () => {
  const out = bashTargets("cd sub && sed -i '' \\\n  -e 's/a/b/' \\\n  f.js", '/w', '/home/jw')
  expect(out).toEqual({ paths: ['/w/sub/f.js'], cwd: '/w/sub' })
})

test('fileRows carries the shell directory from one Bash call to the next until Claude Code resets it', async () => {
  const bash = (command, text) => ({ role: 'assistant', text: '', toolUses: [{ tool_use_id: 'u', tool: 'Bash', input: { command }, ...(text ? { text } : {}) }] })
  const rows = fileRows(
    [
      bash('cd /work/hooks'),
      bash("sed -i '' s/a/b/ r.js"),
      bash('ls', 'ok\nShell cwd was reset to /work'),
      bash('echo x > top.txt'),
    ],
    '/work',
    '/home/jw',
  )
  expect(rows.edited.map((r) => r.path)).toEqual(['top.txt', 'hooks/r.js'])
})

test('parseStatus reads porcelain -z entries, a rename carrying its old name', () => {
  expect(parseStatus(' M a.js\0?? new dir/b.txt\0R  moved.js\0old.js\0A  c.js\0')).toEqual([
    { path: 'a.js', isUntracked: false },
    { path: 'new dir/b.txt', isUntracked: true },
    { path: 'moved.js', isUntracked: false },
    { path: 'c.js', isUntracked: false },
  ])
  expect(parseStatus('')).toEqual([])
})

test('parseNumstat reads numstat -z lines, a rename under its new name and a binary file as such', () => {
  expect(parseNumstat('3\t1\ta.js\0-\t-\timg.png\x002\t0\t\0old.js\0new.js\0')).toEqual([
    { path: 'a.js', add: 3, del: 1, isBinary: false },
    { path: 'img.png', add: 0, del: 0, isBinary: true },
    { path: 'new.js', add: 2, del: 0, isBinary: false },
  ])
})

test('countLines counts the last line even without a trailing newline', () => {
  expect([countLines(''), countLines('a\n'), countLines('a\nb'), countLines('a\nb\n')]).toEqual([0, 1, 2, 2])
})

const FILES = {
  edited: [
    { path: 'a.js', count: 2 },
    { path: 'committed.js', count: 1 },
    { path: 'new.txt', count: 1 },
    { path: '~/notes.md', count: 1 },
  ],
  read: [{ path: 'r.js', count: 3 }],
}

test('changeRows keeps the edited files git still reports, with their +/- counts', () => {
  const rows = changeRows({
    files: FILES,
    status: [
      { path: 'a.js', isUntracked: false },
      { path: 'new.txt', isUntracked: true },
    ],
    stats: [{ path: 'a.js', add: 3, del: 1, isBinary: false }],
    lines: { 'new.txt': 7 },
    root: '/work',
    cwd: '/work',
    home: '/home/jw',
  })
  // committed.js is not in git's status, so it is gone; ~/notes.md is outside the repo
  expect(rows.changed).toEqual([
    { path: 'a.js', rel: 'a.js', count: 2, add: 3, del: 1, isBinary: false, isUntracked: false },
    { path: 'new.txt', rel: 'new.txt', count: 1, add: 7, del: 0, isBinary: false, isUntracked: true },
  ])
  expect(rows.read).toEqual([{ path: 'r.js', count: 3 }])
})

test('changeRows shows a path under the cwd relative to it when the repo root is above', () => {
  const rows = changeRows({
    files: { edited: [{ path: 'mods/x.js', count: 1 }], read: [] },
    status: [{ path: 'mods/x.js', isUntracked: false }],
    stats: [{ path: 'mods/x.js', add: 1, del: 0, isBinary: false }],
    lines: {},
    root: '/work',
    cwd: '/work',
    home: '/home/jw',
  })
  expect(rows.changed.map((r) => r.path)).toEqual(['mods/x.js'])
})
