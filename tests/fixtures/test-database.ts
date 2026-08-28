import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export async function createTestDatabase() {
  const directory = await mkdtemp(join(tmpdir(), 'helpo-'))
  const path = join(directory, 'test.db')
  const database = new DatabaseSync(path)
  database.exec('PRAGMA foreign_keys = ON')

  return {
    path,
    url: `file:${path}`,
    database,
    dispose: async () => {
      database.close()
      await rm(directory, { recursive: true })
    },
  }
}
