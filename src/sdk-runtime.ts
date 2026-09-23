/**
 * Runtime environment setup for the bundled Pi SDK.
 *
 * The Pi SDK reads `process.env` at module load time (`PI_PACKAGE_DIR`,
 * `PI_OFFLINE`, `PATH`). This module centralises those tweaks in one place,
 * keeps platform logic testable, and is imported first from `main.ts` so the
 * environment is configured before any SDK code evaluates.
 */

import { homedir, platform } from 'os'

export interface SdkRuntimeEnv {
  /** Directory the SDK should treat as its package root. */
  piPackageDir?: string
  /** PATH value to use for any SDK child processes. */
  path: string
  /** Offline flag for the SDK. */
  piOffline: string
}

/**
 * Return the Obsidian plugin directory so the SDK can locate its own
 * package.json. Uses the vault adapter when available, falling back to a
 * relative path based on the current working directory.
 *
 * Duck-typing is used instead of importing `FileSystemAdapter` so this module
 * stays usable in non-Obsidian environments (tests, Node scripts).
 */
export function inferPiPackageDir(): string | undefined {
  try {
    const globalApp = (globalThis as unknown as { app?: { vault?: { adapter?: unknown } } }).app
    const adapter = globalApp?.vault?.adapter
    if (
      adapter &&
      typeof adapter === 'object' &&
      typeof (adapter as { getBasePath?: () => string }).getBasePath ===
        'function'
    ) {
      return `${(adapter as { getBasePath: () => string }).getBasePath()}/.obsidian/plugins/obsidian-pi`
    }
  } catch {
    // ignore — global `app` may not exist in all runtimes
  }

  // Fallback: when running outside Obsidian (dev smoke tests, etc.) the CWD
  // is usually the vault root or the plugin directory itself.
  try {
    return `${process.cwd()}/.obsidian/plugins/obsidian-pi`
  } catch {
    return undefined
  }
}

/**
 * Build a PATH that includes common Node/npm locations. The separator and
 * candidate directories are chosen per platform so this works on macOS,
 * Windows, and Linux.
 */
export function buildPath(): string {
  const p = platform()
  const separator = p === 'win32' ? ';' : ':'
  const current = process.env.PATH ?? ''
  const currentParts = current ? current.split(separator) : []
  const home = homedir()

  const candidates: string[] = []

  if (p === 'darwin') {
    candidates.push('/opt/homebrew/bin', '/usr/local/bin')
    if (home) candidates.push(`${home}/.nvm/versions/node`)
  } else if (p === 'win32') {
    if (process.env.LOCALAPPDATA) {
      candidates.push(`${process.env.LOCALAPPDATA}/npm`)
    }
    if (process.env.ProgramFiles) {
      candidates.push(`${process.env.ProgramFiles}/nodejs`)
    }
    if (home) candidates.push(`${home}/AppData/Roaming/npm`)
  } else {
    // Linux and other Unix-like systems
    candidates.push('/usr/local/bin', '/usr/bin', '/opt/bin', '/bin')
    if (home) candidates.push(`${home}/.nvm/versions/node`)
    if (process.env.HOME) candidates.push(`${process.env.HOME}/.local/bin`)
  }

  const additions = candidates.filter((c) => !currentParts.includes(c))
  return [...additions, ...currentParts].join(separator)
}

/** Compute the environment values without mutating `process.env`. */
export function computeSdkRuntimeEnv(): SdkRuntimeEnv {
  return {
    piPackageDir: inferPiPackageDir(),
    path: buildPath(),
    piOffline: '1',
  }
}

/** Apply the computed environment to the current process. */
export function applySdkRuntimeEnv(env: SdkRuntimeEnv): void {
  if (env.piPackageDir) {
    process.env.PI_PACKAGE_DIR = env.piPackageDir
  }
  process.env.PATH = env.path
  process.env.PI_OFFLINE = env.piOffline
}
