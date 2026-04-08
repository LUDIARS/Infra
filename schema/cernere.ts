/**
 * Cernere DB schema — read-only mirror for Drizzle Studio.
 * Source of truth: Cernere Rust (sqlx) migrations.
 */

import {
  pgTable, uuid, text, bigint, boolean, integer, timestamp, jsonb,
  primaryKey, uniqueIndex, index,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  githubId: bigint('github_id', { mode: 'number' }),
  googleId: text('google_id'),
  login: text('login').notNull(),
  displayName: text('display_name').notNull(),
  avatarUrl: text('avatar_url'),
  email: text('email'),
  passwordHash: text('password_hash'),
  role: text('role').notNull().default('general'),
  googleAccessToken: text('google_access_token'),
  googleRefreshToken: text('google_refresh_token'),
  googleTokenExpiresAt: bigint('google_token_expires_at', { mode: 'number' }),
  googleScopes: jsonb('google_scopes'),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  totpSecret: text('totp_secret'),
  totpEnabled: boolean('totp_enabled').notNull().default(false),
  phoneNumber: text('phone_number'),
  phoneVerified: boolean('phone_verified').notNull().default(false),
  mfaEnabled: boolean('mfa_enabled').notNull().default(false),
  mfaMethods: jsonb('mfa_methods').notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const refreshSessions = pgTable('refresh_sessions', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull(),
  refreshToken: text('refresh_token').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const verificationCodes = pgTable('verification_codes', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull(),
  code: text('code').notNull(),
  method: text('method').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  used: boolean('used').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description').notNull().default(''),
  createdBy: uuid('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const organizationMembers = pgTable('organization_members', {
  organizationId: uuid('organization_id').notNull(),
  userId: uuid('user_id').notNull(),
  role: text('role').notNull().default('member'),
  joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.organizationId, t.userId] })]);

export const projectDefinitions = pgTable('project_definitions', {
  id: uuid('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  dataSchema: jsonb('data_schema').notNull().default({}),
  commands: jsonb('commands').notNull().default([]),
  pluginRepository: text('plugin_repository').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const projectDefinitionHistory = pgTable('project_definition_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectKey: text('project_key').notNull(),
  definition: jsonb('definition').notNull(),
  version: integer('version').notNull().default(1),
  appliedBy: uuid('applied_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const organizationProjects = pgTable('organization_projects', {
  organizationId: uuid('organization_id').notNull(),
  projectDefinitionId: uuid('project_definition_id').notNull(),
  enabledAt: timestamp('enabled_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.organizationId, t.projectDefinitionId] })]);

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull(),
  name: text('name').notNull(),
  data: jsonb('data').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const projectSettings = pgTable('project_settings', {
  projectId: uuid('project_id').notNull(),
  settingKey: text('setting_key').notNull(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.projectId, t.settingKey] })]);

export const operationLogs = pgTable('operation_logs', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull(),
  sessionId: text('session_id').notNull(),
  method: text('method').notNull(),
  params: jsonb('params').notNull().default({}),
  status: text('status').notNull(),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const toolClients = pgTable('tool_clients', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  clientId: text('client_id').notNull(),
  clientSecretHash: text('client_secret_hash').notNull(),
  ownerUserId: uuid('owner_user_id').notNull(),
  scopes: jsonb('scopes').notNull().default([]),
  isActive: boolean('is_active').notNull().default(true),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const serviceRegistry = pgTable('service_registry', {
  id: uuid('id').primaryKey(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  serviceSecretHash: text('service_secret_hash').notNull(),
  endpointUrl: text('endpoint_url').notNull(),
  scopes: jsonb('scopes').notNull().default([]),
  isActive: boolean('is_active').notNull().default(true),
  lastConnectedAt: timestamp('last_connected_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const serviceTickets = pgTable('service_tickets', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull(),
  serviceId: uuid('service_id').notNull(),
  ticketCode: text('ticket_code').notNull(),
  userData: jsonb('user_data').notNull(),
  organizationId: uuid('organization_id'),
  scopes: jsonb('scopes').notNull().default([]),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumed: boolean('consumed').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const userProfiles = pgTable('user_profiles', {
  userId: uuid('user_id').primaryKey(),
  roleTitle: text('role_title').notNull().default(''),
  bio: text('bio').notNull().default(''),
  expertise: jsonb('expertise').notNull().default([]),
  hobbies: jsonb('hobbies').notNull().default([]),
  extra: jsonb('extra').notNull().default({}),
  privacy: jsonb('privacy').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const userDataOptouts = pgTable('user_data_optouts', {
  userId: uuid('user_id').notNull(),
  serviceId: text('service_id').notNull(),
  categoryKey: text('category_key').notNull(),
  optedOutAt: timestamp('opted_out_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.serviceId, t.categoryKey] })]);

export const managedProjects = pgTable('managed_projects', {
  key: text('key').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  clientId: text('client_id').notNull().unique(),
  clientSecretHash: text('client_secret_hash').notNull(),
  schemaDefinition: jsonb('schema_definition').notNull().default({}),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
