BEGIN;
CREATE TABLE IF NOT EXISTS nutrition_profile (
 user_id UUID PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
 data JSONB NOT NULL, version UUID NOT NULL,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS nutrition_job (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
 kind VARCHAR(16) NOT NULL CHECK(kind IN ('analysis','plan')),
 request_key UUID NOT NULL, profile_version UUID,
 status VARCHAR(16) NOT NULL CHECK(status IN ('queued','running','ready','draft','active','archived','failed')),
 model VARCHAR(100) NOT NULL, locale VARCHAR(5) NOT NULL CHECK(locale IN ('zh-CN','en')),
 input JSONB NOT NULL DEFAULT '{}', image_data TEXT,
 foods JSONB, summary TEXT NOT NULL DEFAULT '', warnings JSONB NOT NULL DEFAULT '[]',
 proposal JSONB, error_code VARCHAR(80),
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(user_id,request_key), UNIQUE(id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_nutrition_job_owner_time ON nutrition_job(user_id,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_nutrition_job_running ON nutrition_job(user_id) WHERE status IN ('queued','running');
CREATE UNIQUE INDEX IF NOT EXISTS idx_nutrition_plan_active ON nutrition_job(user_id) WHERE kind='plan' AND status='active';
CREATE TABLE IF NOT EXISTS nutrition_day (
 user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
 local_date DATE NOT NULL, bmr_kcal INTEGER NOT NULL,
 weight_kg NUMERIC(6,2) NOT NULL, target_kcal INTEGER NOT NULL,
 profile_version UUID NOT NULL,
 PRIMARY KEY(user_id,local_date)
);
CREATE TABLE IF NOT EXISTS nutrition_meal (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
 request_key UUID NOT NULL, local_date DATE NOT NULL,
 meal_type VARCHAR(16) NOT NULL CHECK(meal_type IN ('breakfast','lunch','dinner','snack')),
 foods JSONB NOT NULL, note VARCHAR(1000) NOT NULL DEFAULT '',
 analysis_id UUID, plan_id UUID, plan_slot VARCHAR(16),
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(analysis_id,user_id) REFERENCES nutrition_job(id,user_id),
 FOREIGN KEY(plan_id,user_id) REFERENCES nutrition_job(id,user_id),
 UNIQUE(user_id,request_key), UNIQUE(user_id,plan_id,local_date,plan_slot),
 CHECK((plan_id IS NULL AND plan_slot IS NULL) OR (plan_id IS NOT NULL AND plan_slot IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_nutrition_meal_owner_date ON nutrition_meal(user_id,local_date);
COMMIT;
