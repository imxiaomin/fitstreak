-- Bind $1 = authenticated user UUID, $2/$3 = inclusive local dates.
SELECT COUNT(*)::int AS checkins, COALESCE(SUM(duration_minutes),0)::int AS minutes,
 COUNT(DISTINCT local_date)::int AS active_days
FROM checkin WHERE user_id=$1 AND local_date BETWEEN $2::date AND $3::date;
SELECT local_date, COUNT(*)::int AS checkins, SUM(duration_minutes)::int AS minutes
FROM checkin WHERE user_id=$1 AND local_date BETWEEN $2::date AND $3::date
GROUP BY local_date ORDER BY local_date;
