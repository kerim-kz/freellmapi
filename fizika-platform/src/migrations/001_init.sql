CREATE TABLE schools (
  id serial PRIMARY KEY,
  name text NOT NULL,
  region text NOT NULL,
  locality text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id serial PRIMARY KEY,
  role text NOT NULL CHECK (role IN ('admin', 'teacher', 'student')),
  login text NOT NULL,
  password_hash text NOT NULL,
  full_name text NOT NULL,
  school_id int REFERENCES schools(id) ON DELETE SET NULL,
  class_id int,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'blocked')),
  is_owner boolean NOT NULL DEFAULT false,
  must_change_password boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);
CREATE UNIQUE INDEX users_login_key ON users (lower(login));
CREATE UNIQUE INDEX users_one_owner ON users (is_owner) WHERE is_owner;

CREATE TABLE classes (
  id serial PRIMARY KEY,
  teacher_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  school_id int REFERENCES schools(id) ON DELETE SET NULL,
  grade int NOT NULL CHECK (grade BETWEEN 7 AND 11),
  letter text NOT NULL DEFAULT '',
  join_code text NOT NULL UNIQUE,
  is_open boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE users ADD CONSTRAINT users_class_fk FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL;

CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions(user_id);

CREATE TABLE materials (
  id serial PRIMARY KEY,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  type text NOT NULL,
  grade int NOT NULL DEFAULT 0,
  section text NOT NULL DEFAULT '',
  exams text[] NOT NULL DEFAULT '{}',
  price int NOT NULL DEFAULT 0 CHECK (price >= 0),
  file_key text,
  file_name text,
  file_size bigint,
  file_mime text,
  external_url text,
  author_id int REFERENCES users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'rejected')),
  reject_reason text NOT NULL DEFAULT '',
  downloads int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX materials_status_idx ON materials(status, created_at DESC);

CREATE TABLE orders (
  id serial PRIMARY KEY,
  material_id int NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount int NOT NULL,
  note text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  decided_by int REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX orders_open_once ON orders(material_id, user_id) WHERE status <> 'rejected';

CREATE TABLE game_scores (
  id serial PRIMARY KEY,
  user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game text NOT NULL,
  section text NOT NULL DEFAULT '',
  score int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX game_scores_game_idx ON game_scores(game, created_at DESC);
CREATE INDEX game_scores_user_idx ON game_scores(user_id);

CREATE TABLE exam_units (
  id serial PRIMARY KEY,
  exam text NOT NULL CHECK (exam IN ('pisa', 'bbzhm', 'ubt')),
  title text NOT NULL DEFAULT '',
  grade int NOT NULL DEFAULT 0,
  section text NOT NULL DEFAULT '',
  context text NOT NULL DEFAULT '',
  seed_key text UNIQUE,
  author_id int REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE exam_questions (
  id serial PRIMARY KEY,
  unit_id int NOT NULL REFERENCES exam_units(id) ON DELETE CASCADE,
  ord int NOT NULL DEFAULT 0,
  kind text NOT NULL CHECK (kind IN ('single', 'multi')),
  stem text NOT NULL,
  options jsonb NOT NULL,
  correct jsonb NOT NULL,
  explanation text NOT NULL DEFAULT '',
  points int NOT NULL DEFAULT 1
);
CREATE INDEX exam_questions_unit_idx ON exam_questions(unit_id, ord);

CREATE TABLE exam_attempts (
  id serial PRIMARY KEY,
  user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exam text NOT NULL,
  mode text NOT NULL,
  section text NOT NULL DEFAULT '',
  score int NOT NULL,
  max_score int NOT NULL,
  total int NOT NULL,
  correct_count int NOT NULL,
  duration_s int,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX exam_attempts_user_idx ON exam_attempts(user_id, created_at DESC);

CREATE TABLE lab_results (
  id serial PRIMARY KEY,
  teacher_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lab_key text NOT NULL,
  student_name text NOT NULL,
  class_label text NOT NULL DEFAULT '',
  variant text NOT NULL DEFAULT '',
  score numeric NOT NULL,
  crit text NOT NULL DEFAULT '',
  done_at text NOT NULL DEFAULT '',
  code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (teacher_id, lab_key, student_name, class_label)
);

CREATE TABLE settings (
  key text PRIMARY KEY,
  value text NOT NULL DEFAULT ''
);
