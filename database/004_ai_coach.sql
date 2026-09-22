BEGIN;
CREATE TABLE IF NOT EXISTS health_profile (
 user_id UUID PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
 data JSONB NOT NULL, version UUID NOT NULL, ai_consent BOOLEAN NOT NULL DEFAULT false,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS agent_run (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
 request_key UUID NOT NULL, health_version UUID NOT NULL,
 message VARCHAR(2000) NOT NULL, locale VARCHAR(5) NOT NULL CHECK(locale IN ('zh-CN','en')),
 start_date DATE NOT NULL, model VARCHAR(100) NOT NULL,
 status VARCHAR(20) NOT NULL CHECK(status IN ('queued','running','needs_input','draft','committed','failed','cancelled')),
 answer TEXT NOT NULL DEFAULT '', proposal JSONB, error_code VARCHAR(80),
 tool_log JSONB NOT NULL DEFAULT '[]', total_tokens INTEGER NOT NULL DEFAULT 0,
 created_plan_ids UUID[] NOT NULL DEFAULT '{}',
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(user_id, request_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_one_active ON agent_run(user_id) WHERE status IN ('queued','running');
CREATE INDEX IF NOT EXISTS idx_agent_owner_created ON agent_run(user_id,created_at DESC);
ALTER TABLE fitness_plan ADD COLUMN IF NOT EXISTS agent_run_id UUID REFERENCES agent_run(id) ON DELETE SET NULL;
CREATE TABLE IF NOT EXISTS plan_exercise (
 plan_id UUID NOT NULL REFERENCES fitness_plan(id) ON DELETE CASCADE,
 position SMALLINT NOT NULL CHECK(position BETWEEN 1 AND 6),
 exercise_slug VARCHAR(80) NOT NULL, sets SMALLINT NOT NULL CHECK(sets BETWEEN 1 AND 4),
 reps SMALLINT CHECK(reps BETWEEN 1 AND 20),
 duration_seconds INTEGER CHECK(duration_seconds BETWEEN 10 AND 1800),
 rest_seconds SMALLINT NOT NULL CHECK(rest_seconds BETWEEN 0 AND 120),
 CHECK((reps IS NULL) <> (duration_seconds IS NULL)),
 PRIMARY KEY(plan_id,position)
);
COMMIT;
