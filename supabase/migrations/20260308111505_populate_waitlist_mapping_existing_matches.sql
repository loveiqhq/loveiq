-- Link any waitlist_user who already took the survey (email match with app_user)
INSERT INTO waitlist_mapping (waitlist_id, user_id)
SELECT wu.id, au.id
FROM waitlist_user wu
JOIN app_user au ON lower(au.email) = lower(wu.email)
ON CONFLICT DO NOTHING;;
