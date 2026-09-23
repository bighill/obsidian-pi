import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  buildPath,
  computeSdkRuntimeEnv,
  inferPiPackageDir,
} from './sdk-runtime'

describe('sdk-runtime', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    // reset env to a known baseline for each test
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('inferPiPackageDir', () => {
    it('falls back to cwd-based path when no Obsidian app global is present', () => {
      expect(inferPiPackageDir()).toBe(
        `${process.cwd()}/.obsidian/plugins/obsidian-pi`,
      )
    })

    it('uses global app.vault.adapter.getBasePath when available', () => {
      const appMock = {
        vault: {
          adapter: {
            getBasePath: () => '/my/vault',
          },
        },
      }
      const original = (globalThis as { app?: typeof appMock }).app
      ;(globalThis as { app?: typeof appMock }).app = appMock
      try {
        expect(inferPiPackageDir()).toBe(
          '/my/vault/.obsidian/plugins/obsidian-pi',
        )
      } finally {
        ;(globalThis as { app?: typeof appMock }).app = original
      }
    })
  })

  describe('buildPath', () => {
    it('prepends platform-specific candidate directories', () => {
      process.env.PATH = '/usr/bin:/bin'
      const path = buildPath()
      // Should keep original entries and add candidates without duplicates.
      expect(path).toContain('/usr/bin')
      expect(path).toContain('/bin')
      expect(path.split(/[:;]/).length).toBeGreaterThanOrEqual(2)
    })

    it('does not duplicate existing entries', () => {
      process.env.PATH = '/usr/local/bin:/usr/bin:/bin'
      const path = buildPath()
      const parts = path.split(/[:;]/)
      expect(parts.filter((p) => p === '/usr/local/bin').length).toBe(1)
      expect(parts.filter((p) => p === '/usr/bin').length).toBe(1)
    })
  })

  describe('computeSdkRuntimeEnv', () => {
    it('includes package dir, path, and offline flag', () => {
      const env = computeSdkRuntimeEnv()
      expect(env.piPackageDir).toBeDefined()
      expect(env.path).toBeDefined()
      expect(env.piOffline).toBe('1')
    })
  })
})
