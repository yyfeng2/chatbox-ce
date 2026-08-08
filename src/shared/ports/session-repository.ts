import type { Session, SessionMetaPage, SessionMetaRecord } from '../types/session'

export interface SessionDataRepositoryPort {
  getSession(id: string): Promise<Session | null>
  setSession(session: Session): Promise<void>
  deleteSession(id: string): Promise<void>
  getAllSessionIds(): Promise<string[]>
}

export interface SessionMetaRepositoryPort {
  initialize(): Promise<void>
  create(record: SessionMetaRecord): Promise<void>
  createMany(records: SessionMetaRecord[]): Promise<void>
  update(id: string, updates: Partial<SessionMetaRecord>): Promise<SessionMetaRecord | null>
  getById(id: string): Promise<SessionMetaRecord | null>
  delete(id: string): Promise<void>
  deleteMany(ids: string[]): Promise<void>
  getAll(): Promise<SessionMetaRecord[]>
  getAllIncludingHidden(): Promise<SessionMetaRecord[]>
  getArchived(): Promise<SessionMetaRecord[]>
  getArchivedPage(cursor: number, limit?: number): Promise<SessionMetaPage>
  getPage(cursor: number, limit?: number): Promise<SessionMetaPage>
  getTotal(): Promise<number>
  getAllTotal(): Promise<number>
  getArchivedTotal(): Promise<number>
  clear(): Promise<void>
}

export interface SessionRepositoryPort extends SessionDataRepositoryPort {
  meta: SessionMetaRepositoryPort
}
