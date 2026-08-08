export interface MigrationErrorContext {
  configVersion: number
  targetConfigVersion: number
}

const migrationErrorContexts = new WeakMap<Error, MigrationErrorContext>()

export async function withMigrationErrorContext<T>(
  context: MigrationErrorContext,
  operation: () => Promise<T>
): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error(String(error))
    migrationErrorContexts.set(normalizedError, context)
    throw normalizedError
  }
}

export function getMigrationErrorContext(error: unknown): MigrationErrorContext | undefined {
  return error instanceof Error ? migrationErrorContexts.get(error) : undefined
}
