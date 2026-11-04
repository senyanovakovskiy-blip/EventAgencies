import { createCloudStore, problem } from './store.mjs';
import { statusLabels } from '../admin/manual-model.js';
import { normalizeWorkflow, nextAction } from '../admin/workflow-model.js';

// Call only after server-side administrator authorization. Personal stores keep
// their mandatory owner scope, including when an administrator edits a request.
export function createCloudAdminStore(binding) {
  const db = binding.withSession ? binding.withSession('first-primary') : binding;
  const stmt = (sql, ...args) => db.prepare(sql).bind(...args);
  async function forInquiry(id) {
    if (!Number.isSafeInteger(id) || id < 1) throw problem(404, 'not_found');
    const row = await stmt('SELECT owner_id FROM inquiries WHERE id=?', id).first();
    if (!row) throw problem(404, 'not_found');
    return createCloudStore(db, row.owner_id);
  }
  return {
    async detail(id) { return (await forInquiry(id)).detail(id); },
    async update(id, input) { return (await forInquiry(id)).update(id, input); },
    async list({ status = '', q = '', page = 1 } = {}) {
      if (status && !Object.hasOwn(statusLabels, status)) throw problem(400, 'invalid_status');
      if (typeof q !== 'string' || q.length > 180 || !Number.isSafeInteger(page) || page < 1) throw problem(400, 'invalid_filter');
      const clauses = [], args = [];
      if (status) { clauses.push('status=?'); args.push(status); }
      if (q.trim()) {
        const query = '%' + q.trim().toLocaleLowerCase('ru').replace(/[\\%_]/g, '\\$&') + '%';
        clauses.push("(search_text LIKE ? ESCAPE '\\' OR printf('ea-%s-%06d',substr(created_at,1,4),id) LIKE ? ESCAPE '\\')");
        args.push(query, query);
      }
      const where = clauses.length ? ' WHERE ' + clauses.join(' AND ') : '';
      const total = (await stmt('SELECT COUNT(*) AS n FROM inquiries' + where, ...args).first()).n;
      const pages = Math.max(1, Math.ceil(total / 25)); page = Math.min(page, pages);
      const result = await db.batch([
        stmt("SELECT * FROM inquiries" + where + " ORDER BY CASE WHEN status='new' THEN 0 ELSE 1 END,id DESC LIMIT 25 OFFSET ?", ...args, (page - 1) * 25),
        stmt('SELECT status,COUNT(*) AS n FROM inquiries GROUP BY status'),
      ]);
      const counts = Object.fromEntries(Object.keys(statusLabels).map(key => [key, 0]));
      for (const row of result[1].results || []) counts[row.status] = row.n;
      return {
        total, page, pages, counts, statuses: statusLabels,
        items: (result[0].results || []).map(row => {
          const snapshot = JSON.parse(row.snapshot_json);
          const workflow = normalizeWorkflow(JSON.parse(row.workflow_json || '{}'), snapshot.brief);
          return {
            nextAction: nextAction({ status: row.status, workflow, recommendations: JSON.parse(row.recommendations_json) }),
            recordId: row.id, id: `EA-${row.created_at.slice(0, 4)}-${String(row.id).padStart(6, '0')}`,
            createdAt: row.created_at, status: row.status, name: snapshot.contact.name,
            format: snapshot.brief.format, city: snapshot.brief.city, date: snapshot.brief.date, dateUnknown: snapshot.brief.dateUnknown,
            budget: snapshot.brief.budget, budgetHelp: snapshot.brief.budgetHelp, guests: snapshot.brief.guests,
            agencies: snapshot.selection.map(item => item.name), test: /^\s*ТЕСТ(?:ОВАЯ ЗАЯВКА|\.)/.test(snapshot.brief.description),
          };
        }),
      };
    },
  };
}
