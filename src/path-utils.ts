import { homedir } from 'os'

/** Expand a leading `~` to the user's home directory. */
export function expandHome(path: string): string {
  if (path === '~' || path.startsWith('~/')) {
    return path.replace('~', homedir())
  }
  return path
}

/** Collapse the user's home directory prefix to `~` for display. */
export function collapseHome(path: string): string {
  const home = homedir()
  if (path === home) return '~'
  if (path.startsWith(home + '/')) return '~' + path.slice(home.length)
  return path
}
