-- Add source column to waitlist_user
ALTER TABLE waitlist_user ADD COLUMN IF NOT EXISTS source text;

-- Add UNIQUE constraint on email for idempotency
ALTER TABLE waitlist_user ADD CONSTRAINT waitlist_user_email_unique UNIQUE (email);;
