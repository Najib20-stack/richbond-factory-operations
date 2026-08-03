CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
);

CREATE TABLE weekly_production (
  position INTEGER PRIMARY KEY,
  day TEXT NOT NULL,
  value NUMERIC(12, 3) NOT NULL
);

CREATE TABLE departments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  capacity INTEGER NOT NULL DEFAULT 0 CHECK (capacity BETWEEN 0 AND 100),
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX departments_name_unique ON departments (LOWER(name));

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('Superviseur', 'Employé')),
  department_id TEXT NOT NULL REFERENCES departments(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  phone TEXT NOT NULL DEFAULT '',
  avatar TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  load INTEGER NOT NULL DEFAULT 0 CHECK (load BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ,
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  password_updated_at TIMESTAMPTZ,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX users_email_unique ON users (LOWER(email));
CREATE INDEX users_department_idx ON users (department_id);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  task_type TEXT NOT NULL DEFAULT 'normal' CHECK (task_type IN ('normal', 'consolidation')),
  consolidation_type TEXT NOT NULL DEFAULT '',
  product_type TEXT NOT NULL DEFAULT '',
  batch_number TEXT NOT NULL DEFAULT '',
  quantity NUMERIC(14, 3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  production_line TEXT NOT NULL DEFAULT '',
  department_id TEXT NOT NULL REFERENCES departments(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  assigned_employee_id TEXT REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  verifier_id TEXT REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  supervisor_id TEXT REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  priority TEXT NOT NULL DEFAULT '' CHECK (priority IN ('', 'Low', 'Medium', 'High', 'Critical')),
  status TEXT NOT NULL CHECK (status IN ('Pending', 'Ready', 'In Progress', 'On Hold', 'Waiting for Review', 'Completed', 'Blocked', 'Cancelled', 'Rejected')),
  estimated_duration TEXT NOT NULL DEFAULT '1h',
  due_date DATE,
  due_date_change_request TEXT NOT NULL DEFAULT '',
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by TEXT REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  refusal_count INTEGER NOT NULL DEFAULT 0 CHECK (refusal_count >= 0),
  client_request_id TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX tasks_department_idx ON tasks (department_id);
CREATE INDEX tasks_status_idx ON tasks (status);
CREATE INDEX tasks_verifier_idx ON tasks (verifier_id);
CREATE INDEX tasks_due_date_idx ON tasks (due_date);
CREATE UNIQUE INDEX tasks_creator_request_unique
  ON tasks (created_by, client_request_id)
  WHERE client_request_id <> '';

CREATE TABLE task_responsibles (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON UPDATE CASCADE ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (task_id, user_id)
);

CREATE INDEX task_responsibles_user_idx ON task_responsibles (user_id);

CREATE TABLE task_notes (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON UPDATE CASCADE ON DELETE CASCADE,
  id TEXT NOT NULL,
  message TEXT NOT NULL,
  created_by TEXT REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (task_id, id)
);

CREATE TABLE activities (
  id TEXT PRIMARY KEY,
  message TEXT NOT NULL,
  time_label TEXT NOT NULL DEFAULT '',
  actor_id TEXT REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  created_at TIMESTAMPTZ,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX activities_created_at_idx ON activities (created_at DESC);

CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Ready',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  task_id TEXT,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX notifications_user_idx ON notifications (user_id, is_read, created_at DESC);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  user_agent TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expiry_idx ON sessions (expires_at);

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  actor_id TEXT REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX audit_log_created_at_idx ON audit_log (created_at DESC);
CREATE INDEX audit_log_actor_idx ON audit_log (actor_id);
