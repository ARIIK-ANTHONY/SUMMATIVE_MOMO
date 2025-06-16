-- Enhanced MoMo Transaction Database Schema for Both Flask and FastAPI

-- Drop existing table to recreate with new schema
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS unprocessed_sms;

-- Main transactions table with all required fields
CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id TEXT,
    type TEXT,
    sender TEXT,
    recipient TEXT,
    receiver TEXT,                           -- For FastAPI compatibility (maps to recipient)
    amount REAL,                            -- Changed from INTEGER to REAL for decimal amounts
    fee REAL DEFAULT 0,                     -- Transaction fees
    date TEXT,
    status TEXT DEFAULT 'completed',        -- Transaction status
    description TEXT,                       -- Short description for UI
    raw_message TEXT,                       -- Original SMS content
    raw_body TEXT,                          -- For FastAPI compatibility (maps to raw_message)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table for logging unprocessed SMS messages
CREATE TABLE IF NOT EXISTS unprocessed_sms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    raw_message TEXT NOT NULL,
    raw_body TEXT,                          -- For FastAPI compatibility
    reason TEXT NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_transaction_id ON transactions(transaction_id);
CREATE INDEX IF NOT EXISTS idx_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_amount ON transactions(amount);
CREATE INDEX IF NOT EXISTS idx_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_sender ON transactions(sender);
CREATE INDEX IF NOT EXISTS idx_recipient ON transactions(recipient);
CREATE INDEX IF NOT EXISTS idx_receiver ON transactions(receiver);
CREATE INDEX IF NOT EXISTS idx_created_at ON transactions(created_at);

-- Triggers to keep compatible columns in sync
CREATE TRIGGER IF NOT EXISTS sync_recipient_receiver_insert
AFTER INSERT ON transactions
WHEN NEW.receiver IS NULL AND NEW.recipient IS NOT NULL
BEGIN
    UPDATE transactions SET receiver = NEW.recipient WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS sync_recipient_receiver_update
AFTER UPDATE ON transactions
WHEN NEW.receiver IS NULL AND NEW.recipient IS NOT NULL
BEGIN
    UPDATE transactions SET receiver = NEW.recipient WHERE id = NEW.id;
END;

-- Trigger to sync raw_message and raw_body
CREATE TRIGGER IF NOT EXISTS sync_raw_message_body_insert
AFTER INSERT ON transactions
WHEN NEW.raw_body IS NULL AND NEW.raw_message IS NOT NULL
BEGIN
    UPDATE transactions SET raw_body = NEW.raw_message WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS sync_raw_message_body_update
AFTER UPDATE ON transactions
WHEN NEW.raw_body IS NULL AND NEW.raw_message IS NOT NULL
BEGIN
    UPDATE transactions SET raw_body = NEW.raw_message WHERE id = NEW.id;
END;

-- Trigger to auto-generate description if missing
CREATE TRIGGER IF NOT EXISTS auto_description_insert
AFTER INSERT ON transactions
WHEN NEW.description IS NULL AND NEW.type IS NOT NULL AND NEW.amount IS NOT NULL
BEGIN
    UPDATE transactions 
    SET description = REPLACE(NEW.type, '_', ' ') || ' - ' || CAST(NEW.amount AS TEXT) || ' RWF'
    WHERE id = NEW.id;
END;