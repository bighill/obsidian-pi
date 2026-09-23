/**
 * Side-effect entry point for the Pi SDK runtime environment.
 *
 * This module is imported first from `main.ts` so the bundled Pi SDK sees the
 * correct `process.env` values before any SDK modules evaluate.
 */

import { applySdkRuntimeEnv, computeSdkRuntimeEnv } from './sdk-runtime'

applySdkRuntimeEnv(computeSdkRuntimeEnv())
