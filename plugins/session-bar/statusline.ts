// session-bar's status line, run by bun: Claude Code pipes its statusLine JSON in, and one row comes out.
// The row's rules live in hooks/statusline.ts and hooks/bar.ts, with their tests.
import { folderName, parseGit } from './hooks/bar'
import { type StatusJson, render, statusInput } from './hooks/statusline'
import { parseShared, sharedPath } from './hooks/usage'

// bun's globals, as far as this script uses them: the plugin's types carry no runtime's
type Spawned = { stdout: ReadableStream<Uint8Array>; exited: Promise<number> }
type SpawnOptions = { stdout: 'pipe'; stderr: 'ignore'; timeout: number }
declare const Bun: { spawn(argv: string[], options: SpawnOptions): Spawned; file(path: string): { text(): Promise<string> }; stdin: { text(): Promise<string> } }
declare const process: { env: Record<string, string | undefined>; cwd(): string; stdout: { write(text: string): void } }

// git in the session's root, stopped after 2 seconds; a failed or slow run reads as nothing
const git = async (root: string, ...args: string[]): Promise<string | null> => {
  const run = Bun.spawn(['git', '--no-optional-locks', '-C', root, ...args], { stdout: 'pipe', stderr: 'ignore', timeout: 2000 })
  const [out, code] = await Promise.all([new Response(run.stdout).text(), run.exited])
  return code === 0 ? out : null
}

// the model windows come from session-bar's last fetch; a missing or stale file gives none
const readShared = async (now: number) => {
  const path = sharedPath(process.env.XDG_CACHE_HOME, process.env.HOME)
  if (!path) return []
  try {
    return parseShared(await Bun.file(path).text(), now)
  } catch {
    return []
  }
}

const draw = async () => {
  const json = JSON.parse(await Bun.stdin.text()) as StatusJson
  // project_dir moves with /cd, not with a Bash call's cd, like the band's session root did
  const root = typeof json.workspace?.project_dir === 'string' ? json.workspace.project_dir : process.cwd()
  const now = Date.now()
  const [status, worktrees, shared] = await Promise.all([
    git(root, 'status', '--porcelain=v2', '--branch'),
    git(root, 'worktree', 'list', '--porcelain'),
    readShared(now),
  ])
  // the list starts with the main working tree, so a worktree shows the repo's own name
  const mainTree = worktrees ? /^worktree (.+)$/m.exec(worktrees)?.[1] : undefined
  const local = { where: folderName(mainTree ?? root), git: status ? parseGit(status) : null, shared, now }
  process.stdout.write(render(statusInput(json, local), Number(process.env.COLUMNS) || 80))
}

// input that is not JSON draws no row
draw().catch(() => {})
