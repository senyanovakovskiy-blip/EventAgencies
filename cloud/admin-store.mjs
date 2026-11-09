import { createCloudStore, digest, problem } from './store.mjs';
import { statusLabels } from '../admin/manual-model.js';
import { normalizeWorkflow, nextAction } from '../admin/workflow-model.js';

// Call only after server-side administrator authorization. Personal stores keep
// their mandatory owner scope, including when an administrator edits a request.
export function createCloudAdminStore(binding) {
  const db = binding.withSession ? binding.withSession('first-primary') : binding;
  const stmt = (sql, ...args) => db.prepare(sql).bind(...args);
  async function ensureInternalRequest(ownerId) {
    if (typeof ownerId !== 'string' || !ownerId.trim()) throw problem(401, 'authentication_required');
    const keyHash = await digest(`eventagencies-internal-generated-request-v1:${ownerId}`);
    const createdAt = new Date().toISOString();
    const note = 'Создано в админке по просьбе владельца. Параметры сгенерированы; контакта нет. Это не обращение клиента.';
    const snapshot = {
      origin: 'admin-generated',
      brief: {
        format: 'corporate', city: 'Екатеринбург', date: 'Июль 2027', dateUnknown: false,
        guests: '350', budget: '', budgetHelp: true,
        description: 'Сгенерировано по просьбе владельца сайта: семейный летний фестиваль для сотрудников и близких. Нужны открытая площадка, детские активности, фуд-зона, сцена и вечерняя программа; площадку и бюджет предстоит уточнить.',
      },
      contact: { name: 'Внутреннее обращение', method: '', value: '' },
      selection: [],
    };
    const snapshotJson = JSON.stringify(snapshot);
    const payloadHash = await digest(snapshotJson);
    const history = JSON.stringify({ changes: ['internal_request_created'], origin: 'admin-generated' });
    const results = await db.batch([
      stmt("INSERT INTO inquiries(owner_id,key_hash,payload_hash,created_at,snapshot_json,search_text,note,updated_at,status_changed_at) VALUES(?,?,?,?,?,?, ?,?,?) ON CONFLICT(owner_id,key_hash) DO NOTHING RETURNING id", ownerId, keyHash, payloadHash, createdAt, snapshotJson, `${note} ${snapshotJson}`.toLocaleLowerCase('ru'), note, createdAt, createdAt),
      stmt("INSERT INTO inquiry_history(inquiry_id,owner_id,revision,created_at,actor,status,note,details_json) SELECT id,owner_id,revision,?,'admin',status,note,? FROM inquiries WHERE owner_id=? AND key_hash=? AND revision=0 ON CONFLICT(inquiry_id,revision) DO NOTHING", createdAt, history, ownerId, keyHash),
      stmt('SELECT id,payload_hash FROM inquiries WHERE owner_id=? AND key_hash=?', ownerId, keyHash),
    ]);
    const row = results[2].results?.[0];
    if (!row || row.payload_hash !== payloadHash) throw problem(503, 'storage_unavailable');
    return { recordId: row.id, created: (results[0].results || []).length > 0 };
  }
  async function forInquiry(id) {
    if (!Number.isSafeInteger(id) || id < 1) throw problem(404, 'not_found');
    const row = await stmt('SELECT owner_id FROM inquiries WHERE id=?', id).first();
    if (!row) throw problem(404, 'not_found');
    return createCloudStore(db, row.owner_id);
  }
  return {
    ensureInternalRequest,
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
            createdAt: row.created_at, status: row.status, name: snapshot.contact.name || 'Без контакта', internal: snapshot.origin === 'admin-generated',
            format: snapshot.brief.format, city: snapshot.brief.city, date: snapshot.brief.date, dateUnknown: snapshot.brief.dateUnknown,
            budget: snapshot.brief.budget, budgetHelp: snapshot.brief.budgetHelp, guests: snapshot.brief.guests,
            agencies: snapshot.selection.map(item => item.name), test: /^\s*ТЕСТ(?:ОВАЯ ЗАЯВКА|\.)/.test(snapshot.brief.description),
          };
        }),
      };
    },
  };
}
