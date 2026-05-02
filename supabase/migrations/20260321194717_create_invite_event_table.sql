CREATE TABLE invite_event (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  referrer_email text,
  invite_method text NOT NULL DEFAULT 'email',
  client_ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_invite_event_created ON invite_event (created_at);;
