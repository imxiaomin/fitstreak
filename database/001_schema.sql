BEGIN;
CREATE TABLE IF NOT EXISTS app_user (
 id UUID PRIMARY KEY, open_id VARCHAR(128) UNIQUE NOT NULL,
 nickname VARCHAR(40) NOT NULL DEFAULT 'FitStreak',
 locale VARCHAR(5) NOT NULL DEFAULT 'zh-CN' CHECK(locale IN ('zh-CN','en')),
 timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Shanghai',
 weekly_goal SMALLINT NOT NULL DEFAULT 4 CHECK(weekly_goal BETWEEN 1 AND 7),
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS fitness_plan (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES app_user(id),
 title VARCHAR(80) NOT NULL CHECK(length(trim(title)) > 0),
 activity VARCHAR(16) NOT NULL CHECK(activity IN ('run','strength','yoga','walk','cycle')),
 target_minutes SMALLINT NOT NULL CHECK(target_minutes BETWEEN 1 AND 600),
 weekdays SMALLINT[] NOT NULL CHECK(cardinality(weekdays) BETWEEN 1 AND 7 AND weekdays <@ ARRAY[1,2,3,4,5,6,7]::SMALLINT[]),
 start_date DATE NOT NULL, end_date DATE,
 archived_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(end_date IS NULL OR end_date >= start_date), UNIQUE(id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_plan_owner ON fitness_plan(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS checkin (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES app_user(id), plan_id UUID NOT NULL,
 local_date DATE NOT NULL, duration_minutes SMALLINT NOT NULL CHECK(duration_minutes BETWEEN 1 AND 600),
 note VARCHAR(500) NOT NULL DEFAULT '',
 plan_title VARCHAR(80) NOT NULL, activity VARCHAR(16) NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(plan_id,user_id) REFERENCES fitness_plan(id,user_id),
 UNIQUE(user_id,plan_id,local_date)
);
CREATE INDEX IF NOT EXISTS idx_checkin_owner_date ON checkin(user_id,local_date DESC);
CREATE TABLE IF NOT EXISTS article (
 id UUID PRIMARY KEY, category VARCHAR(16) NOT NULL CHECK(category IN ('training','recovery','habits')),
 reading_minutes SMALLINT NOT NULL CHECK(reading_minutes > 0),
 published_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS article_translation (
 article_id UUID NOT NULL REFERENCES article(id) ON DELETE CASCADE,
 locale VARCHAR(5) NOT NULL CHECK(locale IN ('zh-CN','en')),
 title VARCHAR(120) NOT NULL, summary VARCHAR(300) NOT NULL, body TEXT NOT NULL,
 PRIMARY KEY(article_id,locale)
);
COMMIT;
