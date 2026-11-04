import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

// A fresh SQLite database per test executes the real migrations and SQL. D1's
// batch is represented by one transaction, including rollback on a failure.
export function isolatedD1(t, migrationCount = Infinity) {
  const sqlite = new DatabaseSync(':memory:');
  const directory = new URL('../../drizzle/', import.meta.url);
  const migrations = fs.readdirSync(directory).filter(name => name.endsWith('.sql')).sort();
  assert(migrations.length > 0);
  for (const name of migrations.slice(0, migrationCount)) sqlite.exec(fs.readFileSync(new URL(name, directory), 'utf8'));
  const db = {
    sqlite,
    withSession(constraint) { assert.equal(constraint, 'first-primary'); return this; },
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      const bound = args => ({
        bind: (...values) => bound(values),
        first: async () => statement.get(...args) || null,
        all: async () => ({ results: statement.all(...args), success: true }),
        execute() {
          if (statement.columns().length) return { results: statement.all(...args), success: true };
          const result = statement.run(...args);
          return { results: [], success: true, meta: { changes: Number(result.changes) } };
        },
      });
      return bound([]);
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try { const result = statements.map(statement => statement.execute()); sqlite.exec('COMMIT'); return result; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  t.after(() => sqlite.close());
  return db;
}
