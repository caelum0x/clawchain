export interface FileInfo {
  filePath: string
  content: string
  oldContent?: string
}

/**
 * Extract file path and content from ACP tool_call/tool_update content.
 *
 * ACP content formats observed:
 * - Diff block: [{ type: "diff", path: "...", oldText: "...", newText: "..." }]
 * - Content wrapper: [{ type: "content", content: { type: "text", text: "..." } }]
 * - Text block: { type: "text", text: "..." }
 * - rawInput: { file_path: "...", content: "..." }
 */
export function extractFileInfo(
  name: string,
  kind: string | undefined,
  content: unknown,
  rawInput?: unknown,
  meta?: unknown,
): FileInfo | null {
  // Only process file-related tool kinds
  if (kind && !['read', 'edit', 'write'].includes(kind)) return null

  let info: Partial<FileInfo> | null = null

  // 1. Try agent-specific _meta extensions (e.g. _meta.claudeCode.toolResponse)
  //    This is the highest-fidelity source — raw file content without formatting.
  //    Falls through to generic paths 2-3 for agents that don't use this namespace.
  if (meta) {
    const m = meta as Record<string, unknown>
    const toolResponse = resolveToolResponse(m)

    if (toolResponse) {
      // Read: toolResponse.file.filePath + file.content
      const file = toolResponse.file as Record<string, unknown> | undefined
      if (typeof file?.filePath === 'string' && typeof file?.content === 'string') {
        info = { filePath: file.filePath, content: file.content }
      }
      // Edit: toolResponse.originalFile (full before-edit content) + oldString/newString
      if (!info && typeof toolResponse.filePath === 'string' && typeof toolResponse.originalFile === 'string') {
        const originalFile = toolResponse.originalFile as string
        const oldString = typeof toolResponse.oldString === 'string' ? toolResponse.oldString : undefined
        const newString = typeof toolResponse.newString === 'string' ? toolResponse.newString : undefined
        const newContent = oldString && newString
          ? originalFile.replace(oldString, newString)
          : originalFile
        info = { filePath: toolResponse.filePath as string, content: newContent, oldContent: originalFile }
      }
      // Write: toolResponse.filePath + toolResponse.content
      if (!info && typeof toolResponse.filePath === 'string' && typeof toolResponse.content === 'string') {
        info = { filePath: toolResponse.filePath, content: toolResponse.content }
      }
    }
  }

  // 2. Try rawInput for file path + content
  if (!info && rawInput && typeof rawInput === 'object') {
    const ri = rawInput as Record<string, unknown>
    const filePath = ri?.file_path || ri?.filePath || ri?.path
    if (typeof filePath === 'string') {
      const parsed = content ? parseContent(content) : null
      const riContent = typeof ri?.content === 'string' ? ri.content : undefined

      if (kind === 'edit') {
        // Edit tool: use old_string/new_string from rawInput for diff viewer
        const oldStr = typeof ri.old_string === 'string' ? ri.old_string : typeof ri.oldText === 'string' ? ri.oldText : undefined
        const newStr = typeof ri.new_string === 'string' ? ri.new_string : typeof ri.newText === 'string' ? ri.newText : undefined
        if (newStr) {
          info = { filePath, content: newStr, oldContent: oldStr }
        } else {
          // Fallback to riContent, then parsed content (e.g. ACP diff blocks)
          info = { filePath, content: riContent || parsed?.content, oldContent: parsed?.oldContent }
        }
      } else if (kind === 'write') {
        // Write tool: prefer rawInput.content (the actual file content) over tool result message
        info = { filePath, content: riContent || parsed?.content, oldContent: parsed?.oldContent }
      } else {
        // Read and other kinds: tool_update content IS the file content
        info = { filePath, content: parsed?.content || riContent, oldContent: parsed?.oldContent }
      }
    }
  }

  // 3. Try to extract from known ACP content patterns
  if (!info && content) {
    info = parseContent(content)
  }

  if (!info) return null

  // Infer file path from tool name if not in content
  if (!info.filePath) {
    const pathMatch = name.match(/(?:Read|Edit|Write|View)\s+(.+)/i)
    if (pathMatch) info.filePath = pathMatch[1].trim()
  }

  if (!info.filePath || !info.content) return null
  return info as FileInfo
}

/**
 * Resolve toolResponse from agent-specific _meta namespaces.
 * Supports: _meta.claudeCode.toolResponse (Claude Code)
 * Add new agents here as they adopt the pattern.
 */
function resolveToolResponse(meta: Record<string, unknown>): Record<string, unknown> | undefined {
  // Claude Code namespace
  const claudeCode = meta.claudeCode as Record<string, unknown> | undefined
  if (claudeCode?.toolResponse && typeof claudeCode.toolResponse === 'object') {
    return claudeCode.toolResponse as Record<string, unknown>
  }
  // Generic: _meta.toolResponse (for agents that put it directly)
  if (meta.toolResponse && typeof meta.toolResponse === 'object') {
    return meta.toolResponse as Record<string, unknown>
  }
  return undefined
}

function parseContent(content: unknown): Partial<FileInfo> | null {
  if (typeof content === 'string') {
    return { content }
  }

  if (Array.isArray(content)) {
    // Array of content blocks — try each
    for (const block of content) {
      const result = parseContent(block)
      if (result?.content || result?.filePath) return result
    }
    return null
  }

  if (typeof content === 'object' && content !== null) {
    const c = content as Record<string, unknown>

    // ACP diff block: { type: 'diff', path: '...', oldText: '...', newText: '...' }
    if (c.type === 'diff' && typeof c.path === 'string') {
      const newText = c.newText as string | null | undefined
      const oldText = c.oldText as string | null | undefined
      if (newText) {
        return {
          filePath: c.path as string,
          content: newText,
          oldContent: oldText ?? undefined,
        }
      }
    }

    // ACP content wrapper: { type: 'content', content: { type: 'text', text: '...' } }
    if (c.type === 'content' && c.content) {
      return parseContent(c.content)
    }

    // ACP text block: { type: 'text', text: '...' }
    if (c.type === 'text' && typeof c.text === 'string') {
      return { content: c.text, filePath: c.filePath as string | undefined }
    }

    // Direct fields
    if (typeof c.text === 'string') {
      return { content: c.text, filePath: c.filePath as string | undefined }
    }

    // Tool input with file path: { file_path: '...', content: '...' }
    if (typeof c.file_path === 'string' || typeof c.filePath === 'string' || typeof c.path === 'string') {
      const filePath = (c.file_path || c.filePath || c.path) as string
      const fileContent = (c.content || c.text || c.output || c.newText) as string | undefined
      if (typeof fileContent === 'string') {
        return {
          filePath,
          content: fileContent,
          oldContent: (c.old_content || c.oldText) as string | undefined,
        }
      }
    }

    // Nested input/output
    if (c.input) {
      const result = parseContent(c.input)
      if (result) return result
    }
    if (c.output) {
      const result = parseContent(c.output)
      if (result) return result
    }
  }

  return null
}
