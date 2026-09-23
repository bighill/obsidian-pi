import {
  createAgentSession,
  DefaultResourceLoader,
  AuthStorage,
  ModelRegistry,
  type AgentSession,
  type AgentSessionEvent,
  type CreateAgentSessionOptions,
} from '@mariozechner/pi-coding-agent'
import { join } from 'path'

export interface SessionStartOptions {
  /** Working directory for the agent. */
  cwd: string
  /** Directory containing Pi agent configuration. */
  agentDir: string
  /** Optional thinking-level override. */
  thinkingLevel?: CreateAgentSessionOptions['thinkingLevel']
  /** Optional model in "provider:modelId" format. */
  model?: string
}

/**
 * Wraps Pi SDK session creation and lifecycle.
 *
 * This service keeps `PiChatView` free of SDK bootstrapping details such as
 * resource loading, model registry lookup, and event subscription.
 */
export class PiSessionService {
  private session: AgentSession | null = null
  private unsubscribe: (() => void) | null = null

  async start(
    options: SessionStartOptions,
    onEvent: (event: AgentSessionEvent) => void,
  ): Promise<AgentSession> {
    this.stop()

    const resourceLoader = new DefaultResourceLoader({
      cwd: options.cwd,
      agentDir: options.agentDir,
      appendSystemPrompt: [
        `Current timestamp: ${new Date().toISOString()}`,
      ],
    })
    await resourceLoader.reload()

    const createOptions: CreateAgentSessionOptions = {
      cwd: options.cwd,
      agentDir: options.agentDir,
      resourceLoader,
    }

    if (options.thinkingLevel) {
      createOptions.thinkingLevel = options.thinkingLevel
    }

    if (options.model) {
      const modelSetting = options.model
      const colonIndex = modelSetting.indexOf(':')
      if (colonIndex > 0 && colonIndex < modelSetting.length - 1) {
        const provider = modelSetting.slice(0, colonIndex)
        const modelId = modelSetting.slice(colonIndex + 1)
        const authStorage = AuthStorage.create(
          join(options.agentDir, 'auth.json'),
        )
        const modelRegistry = ModelRegistry.create(
          authStorage,
          join(options.agentDir, 'models.json'),
        )
        const model = modelRegistry.find(provider, modelId)
        if (model) {
          createOptions.model = model
        } else {
          throw new Error(`Model not found: ${modelSetting}`)
        }
      } else {
        throw new Error(
          `Model must be in "provider:modelId" format: ${modelSetting}`,
        )
      }
    }

    const result = await createAgentSession(createOptions)
    this.session = result.session
    this.unsubscribe = this.session.subscribe(onEvent)
    return this.session
  }

  /** Return the active session, or null if not started / after stop(). */
  getSession(): AgentSession | null {
    return this.session
  }

  /** Unsubscribe from events and release the session reference. */
  stop(): void {
    this.unsubscribe?.()
    this.unsubscribe = null
    this.session = null
  }
}
