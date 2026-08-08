export const SESSION_ATTACHMENT_RAG_REQUIRES_KNOWLEDGE_BASE_ERROR = 'session_attachment_rag_requires_knowledge_base'
export const SESSION_ATTACHMENT_RAG_REQUIRES_TOOL_USE_MODEL_ERROR = 'session_attachment_rag_requires_tool_use_model'
export const SESSION_ATTACHMENT_RAG_PARSED_CONTENT_TOO_LARGE_ERROR = 'session_attachment_rag_parsed_content_too_large'
export const SESSION_ATTACHMENT_RAG_LARGE_ATTACHMENT_WARNING = 'session_attachment_rag_large_attachment_warning'

const SESSION_ATTACHMENT_RAG_AUTH_ERROR_PATTERNS = [
  'session attachment embedding model not set',
  'embedding model not set',
  'embeddingmodel not set',
]

const SESSION_ATTACHMENT_RAG_INDEXING_ERROR_PATTERNS = [
  'chatbox_session_rag_vectors.db',
  'connectionfailed("unable to open connection to local database',
  'session attachment rag vector store not initialized',
]

export function isSessionAttachmentRagAuthError(errorCode: string | undefined): boolean {
  if (!errorCode) {
    return false
  }
  const normalized = errorCode.toLowerCase()
  return SESSION_ATTACHMENT_RAG_AUTH_ERROR_PATTERNS.some((pattern) => normalized.includes(pattern))
}

export function isSessionAttachmentRagIndexingError(errorCode: string | undefined): boolean {
  if (!errorCode) {
    return false
  }
  const normalized = errorCode.toLowerCase()
  return SESSION_ATTACHMENT_RAG_INDEXING_ERROR_PATTERNS.some((pattern) => normalized.includes(pattern))
}
