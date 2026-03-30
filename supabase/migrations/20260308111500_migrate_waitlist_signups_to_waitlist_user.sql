-- Migrate existing rows from legacy waitlist_signups to waitlist_user
INSERT INTO waitlist_user (email, source, created_date_time, unsub_status)
SELECT email, source, created_at, false
FROM waitlist_signups
ON CONFLICT (email) DO NOTHING;;
