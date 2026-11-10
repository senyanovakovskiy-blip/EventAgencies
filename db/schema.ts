import { integer, sqliteTable, text, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

// Cloud-only database. Local SQLite data and credentials are never imported.
export const inquiries = sqliteTable('inquiries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ownerId: text('owner_id').notNull(),
  keyHash: text('key_hash').notNull(),
  payloadHash: text('payload_hash').notNull(),
  createdAt: text('created_at').notNull(),
  snapshotJson: text('snapshot_json').notNull(),
  searchText: text('search_text').notNull(),
  status: text('status').notNull().default('new'),
  note: text('note').notNull().default(''),
  revision: integer('revision').notNull().default(0),
  updatedAt: text('updated_at').notNull(),
  statusChangedAt: text('status_changed_at').notNull(),
  closureReason: text('closure_reason').notNull().default(''),
  recommendationsJson: text('recommendations_json').notNull().default('[]'),
  replyText: text('reply_text').notNull().default(''),
  replyBasis: text('reply_basis').notNull().default(''),
  workflowJson: text('workflow_json').notNull().default('{}'),
  lastMutation: text('last_mutation').notNull().default(''),
}, table => [
  uniqueIndex('inquiries_owner_key').on(table.ownerId, table.keyHash),
  index('inquiries_owner_status_id').on(table.ownerId, table.status, table.id),
]);

export const inquiryHistory = sqliteTable('inquiry_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  inquiryId: integer('inquiry_id').notNull().references(() => inquiries.id),
  ownerId: text('owner_id').notNull(),
  revision: integer('revision').notNull(),
  createdAt: text('created_at').notNull(),
  actor: text('actor').notNull(),
  status: text('status').notNull(),
  note: text('note').notNull(),
  detailsJson: text('details_json').notNull(),
}, table => [
  uniqueIndex('inquiry_history_revision').on(table.inquiryId, table.revision),
  index('inquiry_history_owner_item').on(table.ownerId, table.inquiryId, table.id),
]);

export const projectCopies = sqliteTable('project_copies', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ownerId: text('owner_id').notNull(),
  keyHash: text('key_hash').notNull(),
  payloadHash: text('payload_hash').notNull(),
  name: text('name').notNull(),
  createdAt: text('created_at').notNull(),
  snapshotJson: text('snapshot_json').notNull(),
}, table => [
  uniqueIndex('project_copies_owner_key').on(table.ownerId, table.keyHash),
  index('project_copies_owner_id').on(table.ownerId, table.id),
]);

export const projectCopyTombstones = sqliteTable('project_copy_tombstones', {
  ownerId: text('owner_id').notNull(),
  keyHash: text('key_hash').notNull(),
  deletedAt: text('deleted_at').notNull(),
}, table => [
  uniqueIndex('project_copy_tombstones_owner_key').on(table.ownerId, table.keyHash),
]);

// Only one active invitation exists for the owner's admin workspace. The
// original bearer token is never stored; its hash is checked on every request.
export const adminInvitations = sqliteTable('admin_invitations', {
  id: integer('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  tokenHash: text('token_hash').notNull(),
  createdAt: integer('created_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
  revokedAt: integer('revoked_at'),
}, table => [
  uniqueIndex('admin_invitations_token_hash').on(table.tokenHash),
  index('admin_invitations_owner_expiry').on(table.ownerId, table.expiresAt),
]);
