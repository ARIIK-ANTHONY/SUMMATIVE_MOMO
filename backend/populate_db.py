import sqlite3
import xml.etree.ElementTree as ET
import re
import logging
from datetime import datetime

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def create_tables(conn):
    """Create tables with enhanced schema"""
    with conn:
        # Enhanced transactions table
        conn.execute("""
        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            transaction_id TEXT,
            type TEXT,
            sender TEXT,
            recipient TEXT,
            amount REAL,
            fee REAL DEFAULT 0,
            date TEXT,
            status TEXT DEFAULT 'completed',
            description TEXT,
            raw_message TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)
        
        # Unprocessed SMS table
        conn.execute("""
        CREATE TABLE IF NOT EXISTS unprocessed_sms (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            raw_message TEXT NOT NULL,
            reason TEXT NOT NULL,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)
        
        # Create indexes
        conn.execute("CREATE INDEX IF NOT EXISTS idx_transaction_id ON transactions(transaction_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_type ON transactions(type)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_date ON transactions(date)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_amount ON transactions(amount)")

def extract_transaction_id(body):
    """Extract transaction ID from SMS body"""
    patterns = [
        r'TxId[:\s]*([0-9]+)',
        r'Financial Transaction Id[:\s]*([0-9]+)',
        r'Transaction ID[:\s]*([0-9]+)',
        r'External Transaction Id[:\s]*([A-Z0-9]+)'
    ]
    
    for pattern in patterns:
        match = re.search(pattern, body, re.IGNORECASE)
        if match:
            return match.group(1)
    return None

def extract_amount(body):
    """Extract amount from SMS body"""
    patterns = [
        r'(\d{1,10}(?:,\d{3})*(?:\.\d{2})?)\s*RWF',
        r'received\s+(\d{1,10}(?:,\d{3})*)\s*RWF',
        r'payment of\s+(\d{1,10}(?:,\d{3})*)\s*RWF',
        r'transaction of\s+(\d{1,10}(?:,\d{3})*)\s*RWF'
    ]
    
    for pattern in patterns:
        match = re.search(pattern, body, re.IGNORECASE)
        if match:
            amount_str = match.group(1).replace(',', '')
            try:
                return float(amount_str)
            except ValueError:
                continue
    return None

def extract_fee(body):
    """Extract fee from SMS message"""
    patterns = [
        r'Fee[:\s]*(\d+(?:\.\d{2})?)\s*RWF',
        r'fee was\s+(\d+(?:\.\d{2})?)\s*RWF',
        r'Charge[:\s]*(\d+(?:\.\d{2})?)\s*RWF'
    ]
    
    for pattern in patterns:
        match = re.search(pattern, body, re.IGNORECASE)
        if match:
            try:
                return float(match.group(1))
            except ValueError:
                continue
    return 0

def extract_date(body):
    """Extract date from SMS body"""
    patterns = [
        r'(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})',
        r'at (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})',
        r'completed at (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})'
    ]
    
    for pattern in patterns:
        match = re.search(pattern, body)
        if match:
            try:
                return datetime.strptime(match.group(1), '%Y-%m-%d %H:%M:%S').isoformat()
            except ValueError:
                return match.group(1)
    return None

def categorize_transaction(body):
    """Categorize transaction type based on SMS content"""
    body_lower = body.lower()
    
    if "received" in body_lower and "from" in body_lower:
        return "INCOMING_MONEY"
    elif "payment of" in body_lower and "to" in body_lower:
        return "PAYMENT"
    elif "withdrawn" in body_lower:
        return "WITHDRAWAL"
    elif "data bundle" in body_lower or "internet bundle" in body_lower:
        return "BUNDLE_PURCHASE"
    elif "airtime" in body_lower:
        return "AIRTIME_PAYMENT"
    elif "bank" in body_lower and "deposit" in body_lower:
        return "BANK_DEPOSIT"
    elif "transfer" in body_lower:
        return "TRANSFER"
    else:
        return "OTHER"

def extract_sender_receiver(body, transaction_type):
    """Extract sender and receiver based on transaction type"""
    sender = None
    receiver = None
    
    if transaction_type == "INCOMING_MONEY":
        # Extract sender from "received X RWF from SENDER"
        match = re.search(r'from\s+([^(]+?)(?:\s*\([^)]*\))?\s+on your mobile', body, re.IGNORECASE)
        if match:
            sender = match.group(1).strip()
    
    elif transaction_type == "PAYMENT":
        # Extract receiver from "payment of X RWF to RECEIVER"
        match = re.search(r'payment of.*?to\s+([^0-9]+?)(?:\s+\d+)?\s+has been', body, re.IGNORECASE)
        if match:
            receiver = match.group(1).strip()
    
    elif transaction_type == "WITHDRAWAL":
        # Extract agent info
        match = re.search(r'agent.*?:\s*([^.]+)', body, re.IGNORECASE)
        if match:
            receiver = match.group(1).strip()
    
    return sender, receiver

def create_description(body):
    """Create a short description for UI display"""
    if len(body) > 100:
        return body[:97] + "..."
    return body

def extract_status(body):
    """Extract transaction status from SMS"""
    body_lower = body.lower()
    
    if any(word in body_lower for word in ['completed', 'successful', 'confirmed']):
        return 'completed'
    elif any(word in body_lower for word in ['failed', 'declined', 'error']):
        return 'failed'
    else:
        return 'completed'  # Default

def parse_sms_enhanced(body):
    """Enhanced SMS parsing"""
    transaction = {}
    
    # Basic extraction
    transaction["type"] = categorize_transaction(body)
    transaction["amount"] = extract_amount(body)
    transaction["transaction_id"] = extract_transaction_id(body)
    transaction["date"] = extract_date(body)
    transaction["fee"] = extract_fee(body)
    transaction["status"] = extract_status(body)
    transaction["description"] = create_description(body)
    transaction["raw_message"] = body
    
    # Extract sender/receiver
    sender, receiver = extract_sender_receiver(body, transaction["type"])
    transaction["sender"] = sender
    transaction["recipient"] = receiver
    
    return transaction

def insert_transaction(conn, tx):
    """Insert transaction with enhanced fields"""
    try:
        with conn:
            conn.execute("""
                INSERT INTO transactions (
                    type, amount, sender, recipient, transaction_id, date, 
                    fee, status, description, raw_message
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                tx.get("type"),
                tx.get("amount"),
                tx.get("sender"),
                tx.get("recipient"),
                tx.get("transaction_id"),
                tx.get("date"),
                tx.get("fee", 0),
                tx.get("status", 'completed'),
                tx.get("description"),
                tx.get("raw_message")
            ))
            return True
    except Exception as e:
        logger.error(f"Error inserting transaction: {e}")
        return False

def log_unprocessed_sms(conn, message, reason):
    """Log SMS that couldn't be processed"""
    try:
        with conn:
            conn.execute("""
                INSERT INTO unprocessed_sms (raw_message, reason)
                VALUES (?, ?)
            """, (message, reason))
            logger.warning(f"Unprocessed SMS: {reason}")
    except Exception as e:
        logger.error(f"Error logging unprocessed SMS: {e}")

def process_xml_file(file_path, conn):
    """Process the SMS XML file"""
    try:
        tree = ET.parse(file_path)
        root = tree.getroot()
        
        processed_count = 0
        unprocessed_count = 0
        
        for sms in root.findall('sms'):
            body = sms.get('body')
            if not body:
                continue
            
            # Only process M-Money SMS
            address = sms.get('address', '')
            if 'M-Money' not in address:
                continue
            
            try:
                transaction = parse_sms_enhanced(body)
                
                # Validate required fields
                if transaction.get('amount') and transaction.get('type'):
                    if insert_transaction(conn, transaction):
                        processed_count += 1
                    else:
                        log_unprocessed_sms(conn, body, "Database insertion failed")
                        unprocessed_count += 1
                else:
                    log_unprocessed_sms(conn, body, "Missing required fields (amount or type)")
                    unprocessed_count += 1
                    
            except Exception as e:
                log_unprocessed_sms(conn, body, f"Parsing error: {str(e)}")
                unprocessed_count += 1
        
        logger.info(f"Processed: {processed_count}, Unprocessed: {unprocessed_count}")
        return processed_count, unprocessed_count
        
    except Exception as e:
        logger.error(f"Error processing XML file: {e}")
        return 0, 0

def main():
    """Main processing function"""
    # Use momo.db to match your view_data.py
    conn = sqlite3.connect('momo.db')
    
    try:
        # Create enhanced tables
        create_tables(conn)
        logger.info("Database tables created successfully")
        
        # Process XML file
        xml_file_path = '../sms_data.xml'
        processed, unprocessed = process_xml_file(xml_file_path, conn)
        
        # Get final count
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM transactions")
        total_transactions = cursor.fetchone()[0]
        
        logger.info(f"Processing completed successfully")
        logger.info(f"Total transactions in database: {total_transactions}")
        logger.info(f"Successfully processed: {processed}")
        logger.info(f"Failed to process: {unprocessed}")
        
    except Exception as e:
        logger.error(f"Error during processing: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    main()