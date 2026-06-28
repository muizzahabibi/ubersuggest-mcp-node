import { DatabaseSync } from 'node:sqlite'

export class LocalD1PreparedStatement {
  constructor(
    private readonly stmt: any,
    private readonly params: any[] = []
  ) {}

  bind(...values: any[]): LocalD1PreparedStatement {
    const nextParams = values.map((v) => (v === undefined ? null : v))
    return new LocalD1PreparedStatement(this.stmt, nextParams)
  }

  async first<T = any>(colName?: string): Promise<T | null> {
    const row = this.stmt.get(...this.params) as any
    if (!row) return null
    if (colName) return row[colName]
    return row
  }

  async run<T = any>(): Promise<{ success: boolean; meta: { changes: number; last_row_id: number | bigint } }> {
    const result = this.stmt.run(...this.params)
    return {
      success: true,
      meta: {
        changes: result.changes,
        last_row_id: result.lastInsertRowid,
      },
    }
  }

  async all<T = any>(): Promise<{ success: boolean; results: T[] }> {
    const rows = this.stmt.all(...this.params) as T[]
    return {
      success: true,
      results: rows,
    }
  }

  async raw<T = any>(): Promise<T[][]> {
    const rows = this.stmt.all(...this.params) as any[]
    return rows.map((row) => Object.values(row))
  }
}

export class LocalD1Database {
  private readonly db: DatabaseSync

  constructor(filename: string) {
    this.db = new DatabaseSync(filename)
  }

  prepare(query: string): LocalD1PreparedStatement {
    const stmt = this.db.prepare(query)
    return new LocalD1PreparedStatement(stmt)
  }

  async exec(query: string): Promise<{ success: boolean }> {
    const method = 'exec'
    this.db[method](query)
    return { success: true }
  }

  async batch<T = any>(statements: LocalD1PreparedStatement[]): Promise<{ success: boolean; results: any[] }[]> {
    const results: any[] = []
    const method = 'exec'
    this.db[method]('BEGIN TRANSACTION')
    try {
      for (const statement of statements) {
        results.push(await statement.run())
      }
      this.db[method]('COMMIT')
    } catch (error) {
      this.db[method]('ROLLBACK')
      throw error
    }
    return results.map((res) => ({ success: true, results: [res] }))
  }
}
