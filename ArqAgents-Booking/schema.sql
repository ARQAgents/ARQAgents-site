-- ─────────────────────────────────────────────────────────────────────────────
-- ARQAgents Booking — D1 (SQLite) schema
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bookings (
  id                   TEXT PRIMARY KEY,                -- e.g. bk_aB3xY9
  name                 TEXT NOT NULL,
  email                TEXT NOT NULL,
  phone                TEXT,                            -- E.164-ish, e.g. 639171234567
  service              TEXT,
  appointment_date     TEXT NOT NULL,                   -- YYYY-MM-DD (Manila local)
  appointment_time     TEXT NOT NULL,                   -- HH:MM (24h, Manila local)
  duration_minutes     INTEGER NOT NULL DEFAULT 30,
  notes                TEXT,
  status               TEXT NOT NULL DEFAULT 'confirmed', -- confirmed | cancelled | completed
  source               TEXT DEFAULT 'website-chat',

  -- notification ledger
  confirmation_sent    INTEGER NOT NULL DEFAULT 0,
  reminder_1day_sent   INTEGER NOT NULL DEFAULT 0,
  reminder_dayof_sent  INTEGER NOT NULL DEFAULT 0,
  thankyou_sent        INTEGER NOT NULL DEFAULT 0,

  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_bookings_date    ON bookings(appointment_date);
CREATE INDEX IF NOT EXISTS idx_bookings_status  ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_pending ON bookings(appointment_date, status);

-- ─────────────────────────────────────────────────────────────────────────────
-- Lightweight audit log so you can debug what got sent and when.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id  TEXT NOT NULL,
  kind        TEXT NOT NULL,   -- confirmation | reminder_1day | reminder_dayof | thankyou | owner_alert
  channel     TEXT NOT NULL,   -- email | sms
  ok          INTEGER NOT NULL DEFAULT 0,
  detail      TEXT,
  sent_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notif_booking ON notifications_log(booking_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Optional: blocked time-off (vacations, holidays). Inserted manually for now.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS time_off (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  start_date  TEXT NOT NULL,   -- YYYY-MM-DD
  end_date    TEXT NOT NULL,   -- YYYY-MM-DD (inclusive)
  reason      TEXT
);
