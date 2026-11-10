const tokenPattern = /^[a-f0-9]{64}$/;
export const adminInvitationTtlMs = 30 * 24 * 60 * 60 * 1000;

export async function invitationDigest(token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

export async function invitationTokenMatches(token, hash) {
  if (typeof token !== 'string' || !tokenPattern.test(token) || !tokenPattern.test(hash || '')) return false;
  const actual = await invitationDigest(token);
  let difference = 0;
  for (let index = 0; index < actual.length; index++) difference |= actual.charCodeAt(index) ^ hash.charCodeAt(index);
  return difference === 0;
}

function legacyInvitation(env, now) {
  const hash = env?.EA_INVITATION_HASH;
  const expires = Date.parse(env?.EA_INVITATION_EXPIRES || '');
  return tokenPattern.test(hash || '') && Number.isFinite(expires) && expires > now ? { hash, expires } : null;
}

async function storedInvitation(db) {
  return db.prepare('SELECT id, owner_id, token_hash, created_at, expires_at, revoked_at FROM admin_invitations WHERE id = 1').first();
}

function ownerMismatch(row, ownerId) {
  return row && row.owner_id !== ownerId;
}

async function migrateLegacyInvitation(db, ownerId, env, now, row) {
  if (row) return row;
  const legacy = legacyInvitation(env, now);
  if (!legacy) return null;
  await db.prepare(`INSERT INTO admin_invitations (id, owner_id, token_hash, created_at, expires_at, revoked_at)
    VALUES (1, ?, ?, ?, ?, NULL) ON CONFLICT(id) DO NOTHING`)
    .bind(ownerId, legacy.hash, now, legacy.expires).run();
  return storedInvitation(db);
}

export async function activeAdminInvitation(db, env, now = Date.now()) {
  if (!db?.prepare) return null;
  const row = await storedInvitation(db);
  if (row) {
    if (row.revoked_at !== null && row.revoked_at !== undefined || Number(row.expires_at) <= now) return null;
    return { hash: row.token_hash, ownerId: row.owner_id, expires: Number(row.expires_at), managed: true };
  }
  const legacy = legacyInvitation(env, now);
  return legacy ? { hash: legacy.hash, ownerId: env?.EA_INVITATION_OWNER_ID || `invitation:${legacy.hash}`, expires: legacy.expires, managed: false } : null;
}

export async function adminInvitationStatus(db, ownerId, env, now = Date.now()) {
  if (!ownerId?.trim()) throw Object.assign(new Error('owner_required'), { status: 403 });
  let row = await storedInvitation(db);
  if (ownerMismatch(row, ownerId)) throw Object.assign(new Error('owner_required'), { status: 403 });
  const migrated = !row && Boolean(legacyInvitation(env, now));
  row = await migrateLegacyInvitation(db, ownerId, env, now, row);
  if (ownerMismatch(row, ownerId)) throw Object.assign(new Error('owner_required'), { status: 403 });
  const active = Boolean(row && (row.revoked_at === null || row.revoked_at === undefined) && Number(row.expires_at) > now);
  return {
    active,
    expiresAt: active ? new Date(Number(row.expires_at)).toISOString() : null,
    source: migrated ? 'existing' : row ? 'managed' : 'none',
  };
}

export async function issueAdminInvitation(db, ownerId, origin, now = Date.now()) {
  if (!ownerId?.trim()) throw Object.assign(new Error('owner_required'), { status: 403 });
  const row = await storedInvitation(db);
  if (ownerMismatch(row, ownerId)) throw Object.assign(new Error('owner_required'), { status: 403 });
  const token = [...crypto.getRandomValues(new Uint8Array(32))].map(value => value.toString(16).padStart(2, '0')).join('');
  const hash = await invitationDigest(token), expires = now + adminInvitationTtlMs;
  await db.prepare(`INSERT INTO admin_invitations (id, owner_id, token_hash, created_at, expires_at, revoked_at)
    VALUES (1, ?, ?, ?, ?, NULL)
    ON CONFLICT(id) DO UPDATE SET owner_id=excluded.owner_id, token_hash=excluded.token_hash,
      created_at=excluded.created_at, expires_at=excluded.expires_at, revoked_at=NULL`)
    .bind(ownerId, hash, now, expires).run();
  return { url: new URL('/invite#' + token, origin).href, expiresAt: new Date(expires).toISOString() };
}

export async function revokeAdminInvitation(db, ownerId, env, now = Date.now()) {
  const row = await storedInvitation(db);
  if (ownerMismatch(row, ownerId)) throw Object.assign(new Error('owner_required'), { status: 403 });
  const active = row || await migrateLegacyInvitation(db, ownerId, env, now, null);
  if (ownerMismatch(active, ownerId)) throw Object.assign(new Error('owner_required'), { status: 403 });
  if (active) await db.prepare('UPDATE admin_invitations SET revoked_at = ? WHERE id = 1 AND owner_id = ?').bind(now, ownerId).run();
  return { active: false, expiresAt: null };
}
