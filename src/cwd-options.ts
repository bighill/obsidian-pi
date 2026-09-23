import { readdirSync } from 'fs'
import { basename, dirname, join } from 'path'
import { collapseHome, expandHome } from './path-utils'

export interface CwdOption {
  label: string
  value: string
}

/** List navigation options for the directory at `currentCwd`. */
export function listCwdOptions(currentCwd: string): CwdOption[] {
  const expanded = expandHome(currentCwd) || process.cwd()
  const options: CwdOption[] = []

  const parent = dirname(expanded)
  if (parent !== expanded) {
    options.push({ label: '..', value: parent })
  }

  try {
    const entries = readdirSync(expanded, { withFileTypes: true })
    const dirs = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b))

    for (const dir of dirs) {
      options.push({ label: dir, value: join(expanded, dir) })
    }
  } catch {
    // Directory may not be readable; just show the parent option.
  }

  return options
}

/** A compact label for the current directory itself. */
export function currentCwdLabel(currentCwd: string): string {
  const expanded = expandHome(currentCwd) || process.cwd()
  return collapseHome(expanded)
}

export { basename }
