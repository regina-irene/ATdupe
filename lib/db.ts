import { neon } from "@neondatabase/serverless";

let client: any = null;

export function dbUrl(): string | null {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL_UNPOOLED || null;
}

// neon() is callable as a tagged template OR as (sql, params). No .query().
export function db() {
  const url = dbUrl();
  if (!url) throw new Error("DATABASE_URL is not set");
  if (!client) client = neon(url);
  return client;
}

export async function q(text: string, params: any[] = []): Promise<any[]> {
  return (await db()(text, params)) as any[];
}

// DATE columns arrive as JS Date over this driver; never String().slice() them.
export function ymd(v: any): string {
  if (!v) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

export async function getState(key: string): Promise<string | null> {
  const r = await q("select value from sync_state where key = $1", [key]);
  return r[0]?.value ?? null;
}

export async function setState(key: string, value: string | null) {
  if (value === null) { await q("delete from sync_state where key = $1", [key]); return; }
  await q("insert into sync_state (key,value,updated_at) values ($1,$2,now()) on conflict (key) do update set value=excluded.value, updated_at=now()", [key, value]);
}

let ready = false;

const STATEMENTS = [
  `create table if not exists cases (id text primary key, name text not null, closed boolean not null default false, source text not null default 'airtable', updated_at timestamptz not null default now())`,
  `create index if not exists cases_name_idx on cases (lower(name))`,
  `create table if not exists time_entries (
     id bigserial primary key, entry_date date not null,
     case_name text, case_id text, time_entry text, duration numeric(10,2),
     user_name text, user_email text, firm text, kind text, url text, content text,
     email_from text, email_to text,
     billed boolean not null default false, done boolean not null default false,
     source text not null default 'web',
     external_id text not null default gen_random_uuid()::text,
     created_at timestamptz not null default now(), updated_at timestamptz not null default now())`,
  `alter table time_entries add column if not exists airtable_id text`,
  `alter table time_entries add column if not exists synced_at timestamptz`,
  `alter table time_entries add column if not exists marked_for_deletion boolean not null default false`,
  `create unique index if not exists te_external_idx on time_entries (external_id)`,
  `create unique index if not exists te_airtable_idx on time_entries (airtable_id)`,
  `create index if not exists te_date_idx on time_entries (entry_date desc, id desc)`,
  `create index if not exists te_user_idx on time_entries (lower(user_name))`,
  `create index if not exists te_case_idx on time_entries (lower(case_name))`,
  `create index if not exists te_source_idx on time_entries (source)`,
  `create table if not exists tasks (
     id bigserial primary key,
     airtable_id text,
     client_name text, case_name text, case_id text,
     task text, status text, priority text, who text,
     ord numeric, closed boolean not null default false,
     due_date date, link text, duration numeric(10,2),
     source text not null default 'airtable',
     synced_at timestamptz,
     created_at timestamptz not null default now(),
     updated_at timestamptz not null default now())`,
  `alter table tasks add column if not exists at_modified timestamptz`,
  `alter table tasks add column if not exists data jsonb`,
  `create unique index if not exists tk_airtable_idx on tasks (airtable_id)`,
  `create index if not exists tk_open_idx on tasks (closed, ord nulls last, id)`,
  `create index if not exists tk_who_idx on tasks (who)`,
  `create index if not exists tk_case_idx on tasks (lower(case_name))`,
  `create index if not exists tk_dirty_idx on tasks (updated_at, synced_at)`,
  `create table if not exists saved_views (
     id bigserial primary key,
     page text not null default 'tasks',
     name text not null,
     params text not null,
     owner_email text,
     pos numeric,
     created_at timestamptz not null default now(),
     updated_at timestamptz not null default now())`,
  `create unique index if not exists sv_name_idx on saved_views (page, lower(name))`,
  `create index if not exists sv_page_idx on saved_views (page, pos nulls last, id)`,
  `create table if not exists payments (
     id bigserial primary key,
     airtable_id text,
     case_name text, case_id text,
     pay_date date, amount numeric(12,2),
     kind text, method text, case_type text, cleared text,
     notes text, end_date date,
     year int, year_mm text,
     profit numeric(12,2), owner_pay numeric(12,2), tax numeric(12,2), operating numeric(12,2),
     at_modified timestamptz,
     source text not null default 'airtable',
     synced_at timestamptz,
     created_at timestamptz not null default now(),
     updated_at timestamptz not null default now())`,
  `create unique index if not exists pay_airtable_idx on payments (airtable_id)`,
  `create index if not exists pay_date_idx on payments (pay_date desc, id desc)`,
  `create index if not exists pay_case_idx on payments (lower(case_name))`,
  `create index if not exists pay_dirty_idx on payments (updated_at, synced_at)`,
  `create table if not exists mirror_rows (
     id bigserial primary key,
     table_key text not null,
     airtable_id text,
     data jsonb not null default '{}'::jsonb,
     at_modified timestamptz,
     source text not null default 'airtable',
     synced_at timestamptz,
     created_at timestamptz not null default now(),
     updated_at timestamptz not null default now())`,
  `create unique index if not exists mr_key_at_idx on mirror_rows (table_key, airtable_id)`,
  `create index if not exists mr_key_idx on mirror_rows (table_key, id)`,
  `create index if not exists mr_dirty_idx on mirror_rows (table_key, updated_at, synced_at)`,
  `create index if not exists mr_data_idx on mirror_rows using gin (data)`,
  `create table if not exists client_boards (
     id bigserial primary key,
     base_id text not null unique,
     label text not null,
     case_name text,
     note text,
     added_at timestamptz not null default now(),
     last_sync timestamptz,
     last_result text)`,
  `create index if not exists cb_case_idx on client_boards (lower(case_name))`,
  `create table if not exists gal_bills (
     id bigserial primary key,
     case_name text not null,
     bill_date date not null,
     subtotal numeric(12,2),
     data jsonb not null default '{}'::jsonb,
     note text,
     updated_by text,
     created_at timestamptz not null default now(),
     updated_at timestamptz not null default now())`,
  `create unique index if not exists gal_case_date_idx on gal_bills (lower(case_name), bill_date)`,
  `create index if not exists gal_case_idx on gal_bills (lower(case_name), bill_date desc)`,
  `create table if not exists gal_payments (
     id bigserial primary key,
     case_name text not null,
     party text not null,
     paid_on date not null,
     amount numeric(12,2) not null,
     method text,
     note text,
     created_by text,
     created_at timestamptz not null default now())`,
  `create index if not exists galp_case_idx on gal_payments (lower(case_name), paid_on desc)`,
  `create table if not exists sync_log (id bigserial primary key, ran_at timestamptz not null default now(), kind text default 'time', pulled int default 0, pushed_new int default 0, pushed_upd int default 0, fixed_dates int default 0, ms int default 0, error text)`,
  `alter table sync_log add column if not exists kind text default 'time'`,
  `create table if not exists sync_state (key text primary key, value text, updated_at timestamptz not null default now())`,
];

export async function ensureSchema() {
  if (ready) return;
  for (const s of STATEMENTS) await db()(s);
  ready = true;
}
