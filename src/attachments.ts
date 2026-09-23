import { Notice, TFile, Vault, arrayBufferToBase64 } from 'obsidian'
import {
  classifyFile,
  formatTextAttachment,
  imageMimeFromExt,
} from './at-mention'

/** Maximum bytes read for a single attachment (2 MB). Larger files are attached by name only. */
export const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024

/** Image payload suitable for vision-capable models. */
export interface ImageContent {
  type: 'image'
  data: string
  mimeType: string
}

/** Metadata stored with a chat message so attachments render without regex parsing. */
export interface ChatAttachment {
  name: string
  token?: string
  content?: string
  body?: string
  image?: ImageContent
  tooLarge?: boolean
}

/** A file attachment waiting to be sent with the next user message. */
export interface PendingAttachment extends ChatAttachment {
  inline?: boolean
}

/**
 * Read a vault file and build a `PendingAttachment`. Images are base64-encoded,
 * text files are inlined as fenced blocks, and other files are mentioned by
 * name only.
 */
export async function createAttachmentFromFile(
  vault: Vault,
  file: TFile,
): Promise<PendingAttachment> {
  const base: PendingAttachment = {
    name: file.name,
    inline: true,
    token: `@${file.path}`,
  }

  if (file.stat.size > MAX_ATTACHMENT_BYTES) {
    new Notice(
      `Attachment ${file.name} exceeds ${(MAX_ATTACHMENT_BYTES / 1024 / 1024).toFixed(0)} MB limit; attached by name only.`,
    )
    return { ...base, content: `[Attached file: ${file.name}]`, tooLarge: true }
  }

  try {
    const kind = classifyFile(file.name)
    if (kind === 'image') {
      const data = arrayBufferToBase64(await vault.readBinary(file))
      const mimeType = imageMimeFromExt(file.extension)
      return { ...base, image: { type: 'image', data, mimeType } }
    }

    if (kind === 'text') {
      const body = await vault.read(file)
      return {
        ...base,
        body,
        content: formatTextAttachment(file.path, body),
      }
    }

    return { ...base, content: `[Attached file: ${file.name}]` }
  } catch (e) {
    new Notice(`Failed to attach ${file.name}: ${e}`)
    throw e
  }
}
