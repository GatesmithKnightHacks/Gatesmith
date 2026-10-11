-- 0004_github_app.sql: GitHub App installations, their repositories, and which signed-in user may
-- use which installation. Users themselves come from Neon Auth (managed Better Auth).
-- Safe to re-run: every statement is idempotent. Apply as the project owner.
-- Do not put passwords, tokens or secrets in this file.
--
-- PREREQUISITE: enable Neon Auth on the branch first (Neon Console → Auth). It creates and owns the
-- `neon_auth` schema, including `neon_auth."user"`, which this file references. Never create or
-- alter `neon_auth` tables here. Neon Auth data is per branch: enable it on `dev` and `production`.
--
-- SPEC STATUS: specs/01-mvp.md lists accounts and sign-up as out of scope, and 02-architecture says
-- "no auth system". Applying this needs a change proposal from the lead (R5).
--
-- Who writes what (all through the Vultr platform, role qscore_platform):
--   github_installations, github_repositories  ← GitHub webhooks (`installation`,
--                                                 `installation_repositories`), verified with the
--                                                 webhook secret
--   user_installations                         ← after the platform confirms, with the user's GitHub
--                                                 token, that GET /user/installations lists it
--   repo_connections                           ← the user picks a repository and a project
--   github_webhook_deliveries                  ← every webhook, keyed by X-GitHub-Delivery (dedupe)
-- No tokens are stored here. GitHub user tokens stay in Neon Auth (`neon_auth.account`); installation
-- tokens are minted on demand from the App's private key, which lives only in the Vultr env file.

-- If this fails with "permission denied for schema neon_auth" (or for table user), the owner role
-- cannot reference Neon Auth's users. Nothing is applied (one transaction); stop and report it.

-- GitHub ids (installation, account, repository, user) are 64-bit integers: bigint, never int.

begin;

create table if not exists github_installations (
  installation_id       bigint primary key,
  account_id            bigint not null,                -- the user or organisation it is installed on
  account_login         text not null,
  account_type          text not null check (account_type in ('User','Organization','Enterprise')),
  repository_selection  text not null check (repository_selection in ('all','selected')),
  suspended_at          timestamptz,
  deleted_at            timestamptz,                     -- uninstalled; the row is kept for history
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table if not exists github_repositories (
  repo_id          bigint primary key,
  installation_id  bigint not null references github_installations(installation_id),
  full_name        text not null,                        -- 'owner/name'; changes on rename, repo_id does not
  private          boolean not null,
  default_branch   text,
  removed_at       timestamptz,                          -- removed from the installation
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists github_repositories_installation_idx
  on github_repositories (installation_id);

-- A user may act on an installation only after the platform has checked it with GitHub.
create table if not exists user_installations (
  user_id          uuid not null references neon_auth."user"(id) on delete cascade,
  installation_id  bigint not null references github_installations(installation_id) on delete cascade,
  github_user_id   bigint not null,
  verified_at      timestamptz not null default now(),
  primary key (user_id, installation_id)
);
create index if not exists user_installations_installation_idx
  on user_installations (installation_id);

-- One repository scores into one project, and a project belongs to at most one repository.
create table if not exists repo_connections (
  repo_id        bigint primary key references github_repositories(repo_id),
  project_id     uuid not null unique references projects(id),
  connected_by   uuid references neon_auth."user"(id) on delete set null,
  manifest_path  text not null default 'qscore.yaml',     -- where the manifest lives in the repository
  created_at     timestamptz not null default now()
);

-- GitHub retries deliveries; insert ... on conflict (delivery_id) do nothing makes handling idempotent
-- (specs/11 §4).
create table if not exists github_webhook_deliveries (
  delivery_id      text primary key,                      -- X-GitHub-Delivery header
  event            text not null,                         -- X-GitHub-Event header
  action           text,
  installation_id  bigint,                                -- no foreign key: this event may create it
  received_at      timestamptz not null default now(),
  processed_at     timestamptz,
  error            jsonb                                  -- {type, message} when handling failed
);

-- Grants. 0003's `select on all tables` covered only the tables that existed then.
grant select on github_installations, github_repositories, user_installations, repo_connections,
                github_webhook_deliveries
  to qscore_platform;
grant insert, update on github_installations, github_repositories to qscore_platform;
grant insert, delete on user_installations, repo_connections to qscore_platform;
grant insert on github_webhook_deliveries to qscore_platform;
grant update (processed_at, error) on github_webhook_deliveries to qscore_platform;

-- Workers need none of these. qscore_readonly sees the GitHub side, not who connected what.
grant select on github_installations, github_repositories to qscore_readonly;

commit;
