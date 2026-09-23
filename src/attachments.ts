import { Notice, TFile, Vault, arrayBufferToBase64 } from 'obsidian'
import {
  classifyFile,
  formatTextAttachment,
  imageMimeFromExt,
} from './at-mention'

/** Image payload suitable for vision-capable models. */
export interface ImageContent {
  type: 'image'
  data: string
  mimeType: string
}

/** A file attachment waiting to be sent with the next user message. */
export interface PendingAttachment {
  name: string
  content?: string
  token?: string
  inline?: boolean
  image?: ImageContent
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

  try {
    const kind = classifyFile(file.name)
    if (kind === 'image') {
      const data = arrayBufferToBase64(await vault.readBinary(file))
      const mimeType = imageMimeFromExt(file.extension)
      return { ...base, image: { type: 'image', data, mimeType } }
    }

    if (kind === 'text') {
      const content = await vault.read(file)
      return { ...base, content: formatTextAttachment(file.path, content) }
    }

    return { ...base, content: `[Attached file: ${file.name}]` }
  } catch (e) {
    new Notice(`Failed to attach ${file.name}: ${e}`)
    throw e
  }
}
