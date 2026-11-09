import catalogData from '../content/catalog.json' with { type: 'json' };
import caseDetails from '../content/case-details.json' with { type: 'json' };
import clientPresentation from '../content/client-presentation.json' with { type: 'json' };
import {operatorCatalog} from '../operator-catalog.mjs';
import {preparationContentKey} from '../admin/preparation-model.js';
import { submissionPayload, validPayload } from '../public/custom/inquiry-model.js';
import { statusLabels, recommendationKey, replyKey } from '../admin/manual-model.js';
import { normalizeWorkflow, validateWorkflow, nextAction } from '../admin/workflow-model.js';

export const problem = (status, code) => Object.assign(new Error(code), { status, code });
export async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}
const receipt = row => ({
  id: `EA-${row.created_at.slice(0, 4)}-${String(row.id).padStart(6, '0')}`,
  createdAt: row.created_at, recipient: 'EventAgencies', localServer: false,
  ...JSON.parse(row.snapshot_json),
});
const rows = result => result.results || [];

// Only the built-in catalogue receives the built-in editorial sources. Callers
// supplying another catalogue may explicitly supply matching sources as arg 4.
export function createCloudStore(binding, ownerId, catalog = catalogData, operatorSources = catalog === catalogData ? {details:caseDetails,presentation:clientPresentation} : {}) {
  if (typeof ownerId !== 'string' || !ownerId.trim()) throw problem(401, 'authentication_required');
  // D1 Sessions keep subsequent reads consistent when read replication is enabled.
  const db = binding.withSession ? binding.withSession('first-primary') : binding;
  const stmt = (sql, ...args) => db.prepare(sql).bind(...args);
  const historyFor = id => stmt('SELECT created_at AS createdAt,actor,status,note,details_json FROM inquiry_history WHERE owner_id=? AND inquiry_id=? ORDER BY id DESC', ownerId, id);
  const detailFrom = async (row, history) => {
    if (!row) throw problem(404, 'not_found');
    const recommendations = JSON.parse(row.recommendations_json);
    const workflow = normalizeWorkflow(JSON.parse(row.workflow_json || '{}'), receipt(row).brief);
    return {
      workflow, recordId: row.id, receipt: receipt(row), status: row.status, note: row.note,
      revision: row.revision, updatedAt: row.updated_at, statusChangedAt: row.status_changed_at,
      closureReason: row.closure_reason, recommendations, replyText: row.reply_text, replyBasis: row.reply_basis,
      replyStale: Boolean(row.reply_text && row.reply_basis !== await digest(replyKey(recommendations, workflow.brief, workflow.teams))),
      history: history.map(({ details_json, ...item }) => ({ ...item, details: JSON.parse(details_json) })),
    };
  };
  async function detail(id) {
    if (!Number.isSafeInteger(id) || id < 1) throw problem(404, 'not_found');
    const result = await db.batch([stmt('SELECT * FROM inquiries WHERE owner_id=? AND id=?', ownerId, id), historyFor(id)]);
    return detailFrom(rows(result[0])[0], rows(result[1]));
  }
  function workFor(agencySlug, workSlug) {
    return workSlug ? catalog.projects.find(p => p.slug === workSlug && (p.agencySlug === agencySlug || p.agencySlugs?.includes(agencySlug))) : null;
  }
  function resolveRecommendations(value) {
    if (!Array.isArray(value) || value.length > 3) throw problem(400, 'invalid_recommendations');
    const seen = new Set();
    return value.map(r => {
      if (!r || typeof r.agencySlug !== 'string' || seen.has(r.agencySlug) || typeof r.reason !== 'string' || r.reason.length > 1200 || typeof r.questions !== 'string' || r.questions.length > 1200) throw problem(400, 'invalid_recommendations');
      seen.add(r.agencySlug);
      const agency = catalog.agencies.find(a => a.slug === r.agencySlug), work = workFor(r.agencySlug, r.workSlug);
      if (!agency || (r.workSlug !== null && typeof r.workSlug !== 'string') || (r.workSlug && !work)) throw problem(400, 'invalid_recommendations');
      return { agencySlug: agency.slug, name: agency.name, workSlug: work?.slug || null, work: work ? { slug: work.slug, title: work.fullTitle, source: work.source || '' } : null, reason: r.reason, questions: r.questions };
    });
  }
  function changesBetween(current, values, ignoreWorkflowTimes = false) {
    const changes = ['status', 'note', 'closureReason', 'replyText', 'replyBasis'].filter(key => current[key] !== values[key]);
    if (recommendationKey(current.recommendations) !== recommendationKey(values.recommendations)) changes.push('recommendations');
    // Simultaneous identical saves may generate different server timestamps.
    const workflowKey = value => JSON.stringify(value, ignoreWorkflowTimes ? (key, item) => ['confirmedAt', 'updatedAt', 'sharedAt', 'conversationAt'].includes(key) ? undefined : item : undefined);
    if (workflowKey(current.workflow) !== workflowKey(values.workflow)) changes.push('workflow');
    return changes;
  }
  return {
    detail,
    async customerHistory({ page = 1, q = '', status = '' } = {}) {
      if (!Number.isSafeInteger(page) || page < 1) throw problem(400, 'invalid_page');
      if (typeof q !== 'string' || q.length > 180 || typeof status !== 'string' || (status && status !== 'done' && !Object.hasOwn(statusLabels, status))) throw problem(400, 'invalid_filter');
      const clauses = ["owner_id=?", "COALESCE(json_extract(snapshot_json,'$.origin'),'')<>'admin-generated'"], args = [ownerId];
      if (status) { clauses.push('status=?'); args.push(status); }
      if (q.trim()) {
        const query = '%' + q.trim().toLocaleLowerCase('ru').replace(/[\\%_]/g, '\\$&') + '%';
        clauses.push("(search_text LIKE ? ESCAPE '\\' OR printf('ea-%s-%06d',substr(created_at,1,4),id) LIKE ? ESCAPE '\\')");
        args.push(query, query);
      }
      const where = ' WHERE ' + clauses.join(' AND ');
      const total = (await stmt('SELECT COUNT(*) AS n FROM inquiries' + where, ...args).first()).n;
      const pages = Math.max(1, Math.ceil(total / 10)); page = Math.min(page, pages);
      const result = await stmt('SELECT id,created_at,status,updated_at,snapshot_json FROM inquiries' + where + ' ORDER BY id DESC LIMIT 10 OFFSET ?', ...args, (page - 1) * 10).all();
      return {
        total, page, pages,
        items: rows(result).map(row => {
          const r = receipt(row);
          return { recordId: row.id, id: r.id, createdAt: r.createdAt, updatedAt: row.updated_at, status: row.status, statusLabel: statusLabels[row.status] || (row.status === 'done' ? 'Завершена' : 'Статус уточняется'), format: r.brief.format, city: r.brief.city, date: r.brief.date, dateUnknown: r.brief.dateUnknown, agencies: r.selection.map(item => item.name) };
        }),
      };
    },
    async customerReceipt(id) {
      if (!Number.isSafeInteger(id) || id < 1) throw problem(404, 'not_found');
      const row = await stmt("SELECT id,created_at,status,updated_at,snapshot_json FROM inquiries WHERE owner_id=? AND id=? AND COALESCE(json_extract(snapshot_json,'$.origin'),'')<>'admin-generated'", ownerId, id).first();
      if (!row) throw problem(404, 'not_found');
      return { recordId: row.id, receipt: receipt(row), status: row.status, statusLabel: statusLabels[row.status] || (row.status === 'done' ? 'Завершена' : 'Статус уточняется'), updatedAt: row.updated_at };
    },
    catalog() {
      return operatorCatalog(catalog,operatorSources.details,operatorSources.presentation);
    },
    async save(key, input) {
      let valid = false;
      try { valid = validPayload(input); } catch { /* Malformed JSON objects are invalid input, not storage errors. */ }
      if (typeof key !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(key) || !valid) throw problem(400, 'invalid_request');
      const payload = submissionPayload(input), keyHash = await digest(key.toLowerCase()), payloadHash = await digest(JSON.stringify(payload));
      // Preserve retry receipts even if a previously valid catalog entry was later removed.
      const existing = await stmt('SELECT * FROM inquiries WHERE owner_id=? AND key_hash=?', ownerId, keyHash).first();
      if (existing) {
        if (existing.payload_hash !== payloadHash) throw problem(409, 'request_changed');
        return { receipt: receipt(existing), duplicate: true };
      }
      const selection = payload.selection.map(s => {
        const agency = catalog.agencies.find(a => a.slug === s.agencySlug), work = workFor(s.agencySlug, s.workSlug);
        if (!agency || (s.workSlug && !work)) throw problem(400, 'invalid_selection');
        return { ...s, name: agency.name, work: work ? { slug: work.slug, title: work.fullTitle } : null };
      });
      const createdAt = new Date().toISOString(), snapshot = JSON.stringify({ ...payload, selection });
      const result = await db.batch([
        stmt('INSERT INTO inquiries(owner_id,key_hash,payload_hash,created_at,snapshot_json,search_text,updated_at,status_changed_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(owner_id,key_hash) DO NOTHING RETURNING id', ownerId, keyHash, payloadHash, createdAt, snapshot, snapshot.toLocaleLowerCase('ru'), createdAt, createdAt),
        stmt('SELECT * FROM inquiries WHERE owner_id=? AND key_hash=?', ownerId, keyHash),
      ]);
      const saved = rows(result[1])[0];
      if (!saved) throw problem(503, 'storage_unavailable');
      if (saved.payload_hash !== payloadHash) throw problem(409, 'request_changed');
      return { receipt: receipt(saved), duplicate: rows(result[0]).length === 0 };
    },
    async list({ status = '', q = '', page = 1 } = {}) {
      if (status && !Object.hasOwn(statusLabels, status)) throw problem(400, 'invalid_status');
      if (typeof q !== 'string' || q.length > 180 || !Number.isSafeInteger(page) || page < 1) throw problem(400, 'invalid_filter');
      const clauses = ['owner_id=?'], args = [ownerId];
      if (status) { clauses.push('status=?'); args.push(status); }
      if (q.trim()) {
        const query = '%' + q.trim().toLocaleLowerCase('ru').replace(/[\\%_]/g, '\\$&') + '%';
        clauses.push("(search_text LIKE ? ESCAPE '\\' OR printf('ea-%s-%06d',substr(created_at,1,4),id) LIKE ? ESCAPE '\\')");
        args.push(query, query);
      }
      const where = ' WHERE ' + clauses.join(' AND ');
      const total = (await stmt('SELECT COUNT(*) AS n FROM inquiries' + where, ...args).first()).n;
      const pages = Math.max(1, Math.ceil(total / 25)); page = Math.min(page, pages);
      const result = await db.batch([
        stmt("SELECT * FROM inquiries" + where + " ORDER BY CASE WHEN status='new' THEN 0 ELSE 1 END,id DESC LIMIT 25 OFFSET ?", ...args, (page - 1) * 25),
        stmt('SELECT status,COUNT(*) AS n FROM inquiries WHERE owner_id=? GROUP BY status', ownerId),
      ]);
      const counts = Object.fromEntries(Object.keys(statusLabels).map(key => [key, 0]));
      for (const row of rows(result[1])) counts[row.status] = row.n;
      return {
        total, page, pages, counts, statuses: statusLabels,
        items: rows(result[0]).map(row => {
          const r = receipt(row);
          const workflow = normalizeWorkflow(JSON.parse(row.workflow_json || '{}'), r.brief);
          const next = nextAction({ status: row.status, workflow, recommendations: JSON.parse(row.recommendations_json) });
          return { nextAction: next, recordId: row.id, id: r.id, createdAt: r.createdAt, status: row.status, name: r.contact.name, format: r.brief.format, city: r.brief.city, date: r.brief.date, dateUnknown: r.brief.dateUnknown, budget: r.brief.budget, budgetHelp: r.brief.budgetHelp, guests: r.brief.guests, agencies: r.selection.map(s => s.name), test: /^\s*ТЕСТ(?:ОВАЯ ЗАЯВКА|\.)/.test(r.brief.description) };
        }),
      };
    },
    async update(id, input) {
      if (!input || typeof input !== 'object') throw problem(400, 'invalid_update');
      const { status, note, revision } = input;
      if (typeof status !== 'string' || !Object.hasOwn(statusLabels, status) || typeof note !== 'string' || note.length > 5000 || !Number.isSafeInteger(revision) || revision < 0) throw problem(400, 'invalid_update');
      const current = await detail(id);
      if (current.revision !== revision && input.workflow?.preparation !== undefined && preparationContentKey(input.workflow.preparation, current.workflow.preparation) !== preparationContentKey(current.workflow.preparation)) throw problem(409, 'revision_conflict');
      const closureReason = input.closureReason ?? current.closureReason, replyText = input.replyText ?? current.replyText, replyBasis = input.replyBasis ?? current.replyBasis;
      if (typeof closureReason !== 'string' || closureReason.length > 1500 || typeof replyText !== 'string' || replyText.length > 16000 || typeof replyBasis !== 'string' || (replyBasis !== '' && !/^[a-f0-9]{64}$/.test(replyBasis))) throw problem(400, 'invalid_update');
      const recommendations = input.recommendations === undefined ? current.recommendations : resolveRecommendations(input.recommendations);
      if (status === 'prepared' && (!recommendations.length || recommendations.some(r => !r.reason.trim() || !r.questions.trim()))) throw problem(400, 'shortlist_incomplete');
      const now = new Date().toISOString();
      const workflow = input.workflow === undefined ? current.workflow : validateWorkflow(input.workflow, current.workflow, catalog, now, current.receipt.selection);
      const values = { status, note, closureReason, replyText, replyBasis, recommendations, workflow }, changes = changesBetween(current, values);
      if (!changes.length) return current;
      if (current.revision !== revision) throw problem(409, 'revision_conflict');
      const mutation = crypto.randomUUID();
      const statusChangedAt = status === current.status ? current.statusChangedAt : now;
      const details = JSON.stringify({ changes, closureReason, recommendations, replyText, replyBasis, workflow });
      // D1 executes the batch atomically. The random marker makes history insertion
      // conditional on THIS revision-guarded update, even under concurrent writers.
      const result = await db.batch([
        stmt('UPDATE inquiries SET status=?,note=?,revision=revision+1,updated_at=?,status_changed_at=?,closure_reason=?,recommendations_json=?,reply_text=?,reply_basis=?,workflow_json=?,last_mutation=? WHERE owner_id=? AND id=? AND revision=? RETURNING id', status, note, now, statusChangedAt, closureReason, JSON.stringify(recommendations), replyText, replyBasis, JSON.stringify(workflow), mutation, ownerId, id, revision),
        stmt("INSERT INTO inquiry_history(inquiry_id,owner_id,revision,created_at,actor,status,note,details_json) SELECT id,owner_id,revision,?,'admin',status,note,? FROM inquiries WHERE owner_id=? AND id=? AND last_mutation=?", now, details, ownerId, id, mutation),
        stmt('SELECT * FROM inquiries WHERE owner_id=? AND id=?', ownerId, id),
        historyFor(id),
      ]);
      const latest = await detailFrom(rows(result[2])[0], rows(result[3]));
      if (!rows(result[0]).length && changesBetween(latest, values, true).length) throw problem(409, 'revision_conflict');
      return latest;
    },
  };
}
