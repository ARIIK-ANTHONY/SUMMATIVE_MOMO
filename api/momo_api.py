from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import sqlite3
import xml.etree.ElementTree as ET
import re
import csv
import io
import json
import logging
from datetime import datetime
from typing import List, Optional

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('api.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="MTN MoMo Analytics API",
    description="API for processing and analyzing MTN MoMo SMS transaction data",
    version="1.0.0"
)

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify exact origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Database configuration
DB = '../backend/momo.db'

# Initialize database with schema and handle migrations
def init_db():
    """Initialize database with proper schema and handle migrations"""
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    
    # Check if transactions table exists and get its schema
    c.execute("PRAGMA table_info(transactions)")
    columns = [column[1] for column in c.fetchall()]
    
    if not columns:
        # Create new table if it doesn't exist
        c.execute('''
            CREATE TABLE transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                transaction_id TEXT,
                type TEXT NOT NULL,
                amount REAL DEFAULT 0,
                fee REAL DEFAULT 0,
                sender TEXT,
                recipient TEXT,  -- Fixed: was 'receiver', should match populate_db.py
                date TEXT,
                status TEXT DEFAULT 'completed',
                description TEXT,
                raw_message TEXT NOT NULL,  -- Fixed: was 'raw_body', should be 'raw_message'
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(transaction_id, date, raw_message)  -- Fixed: updated column name
            )
        ''')
        logger.info("Created new transactions table")
    else:
        # Migrate existing table by adding missing columns
        if 'status' not in columns:
            c.execute('ALTER TABLE transactions ADD COLUMN status TEXT DEFAULT "completed"')
            logger.info("Added status column to transactions table")
        
        if 'description' not in columns:
            c.execute('ALTER TABLE transactions ADD COLUMN description TEXT')
            logger.info("Added description column to transactions table")
        
        if 'created_at' not in columns:
            c.execute('ALTER TABLE transactions ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP')
            logger.info("Added created_at column to transactions table")
        
        # Update existing records to have descriptions if they don't
        # Fixed: Use 'raw_message' instead of 'raw_body'
        c.execute('''
            UPDATE transactions 
            SET description = CASE 
                WHEN LENGTH(raw_message) > 100 THEN SUBSTR(raw_message, 1, 97) || '...'
                ELSE raw_message 
            END
            WHERE description IS NULL OR description = ''
        ''')
        logger.info("Updated existing records with descriptions")
    
    # Create unprocessed_sms table if it doesn't exist
    # Fixed: Use 'raw_message' instead of 'raw_body' for consistency
    c.execute('''
        CREATE TABLE IF NOT EXISTS unprocessed_sms (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            raw_message TEXT NOT NULL,
            reason TEXT NOT NULL,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Create indexes for better performance
    c.execute('CREATE INDEX IF NOT EXISTS idx_transaction_id ON transactions(transaction_id)')
    c.execute('CREATE INDEX IF NOT EXISTS idx_type ON transactions(type)')
    c.execute('CREATE INDEX IF NOT EXISTS idx_date ON transactions(date)')
    c.execute('CREATE INDEX IF NOT EXISTS idx_amount ON transactions(amount)')
    c.execute('CREATE INDEX IF NOT EXISTS idx_status ON transactions(status)')
    
    conn.commit()
    conn.close()
    logger.info("Database initialized and migrated successfully")

# Initialize database on startup
init_db()

# Pydantic models for validation
class Transaction(BaseModel):
    id: Optional[int] = None
    transaction_id: Optional[str] = None
    type: str
    amount: Optional[float] = 0
    fee: Optional[float] = 0
    sender: Optional[str] = None
    receiver: Optional[str] = None
    date: Optional[str] = None
    status: Optional[str] = "completed"
    description: Optional[str] = None
    raw_body: Optional[str] = None

class TransactionFilter(BaseModel):
    type: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    min_amount: Optional[float] = None
    max_amount: Optional[float] = None
    status: Optional[str] = None

class UploadResponse(BaseModel):
    message: str
    processed_count: int
    unprocessed_count: int
    success: bool

# Enhanced SMS Parsing Functions

def extract_transaction_id(body: str) -> Optional[str]:
    """Enhanced transaction ID extraction with multiple patterns"""
    patterns = [
        # Standard patterns
        r'TxId[:\s]*([A-Z0-9]{6,20})',
        r'Transaction ID[:\s]*([A-Z0-9]{6,20})',
        r'Ref[:\s]*([A-Z0-9]{6,20})',
        r'Reference[:\s]*([A-Z0-9]{6,20})',
        
        # Embedded patterns
        r'\*162\*TxId[:\s]*([A-Z0-9]{6,20})\*',
        r'ID[:\s]*([A-Z0-9]{6,20})',
        
        # Number-only patterns (as fallback)
        r'TxId[:\s]*(\d{6,15})',
        r'Transaction[:\s]*(\d{6,15})',
        
        # Alternative formats
        r'transaction[:\s]+([A-Z0-9]{6,20})',
        r'ref[:\s]+([A-Z0-9]{6,20})',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, body, re.IGNORECASE)
        if match:
            tx_id = match.group(1).strip()
            # Validate transaction ID format
            if len(tx_id) >= 6 and tx_id.isalnum():
                return tx_id.upper()
    
    return None

def extract_amount(body: str) -> Optional[float]:
    """Extract amount from SMS body with enhanced patterns"""
    patterns = [
        # Standard RWF patterns
        r'(\d{1,10}(?:,\d{3})*(?:\.\d{2})?)\s*RWF',
        r'RWF\s*(\d{1,10}(?:,\d{3})*(?:\.\d{2})?)',
        
        # Amount with context
        r'amount[:\s]*(\d{1,10}(?:,\d{3})*(?:\.\d{2})?)\s*RWF',
        r'payment[:\s]+of[:\s]*(\d{1,10}(?:,\d{3})*(?:\.\d{2})?)\s*RWF',
        r'received[:\s]*(\d{1,10}(?:,\d{3})*(?:\.\d{2})?)\s*RWF',
        r'withdrawn[:\s]*(\d{1,10}(?:,\d{3})*(?:\.\d{2})?)\s*RWF',
        
        # Francs pattern
        r'(\d{1,10}(?:,\d{3})*)\s*Francs?',
        
        # Numbers before specific keywords
        r'(\d{1,10}(?:,\d{3})*(?:\.\d{2})?)\s*(?:has been|was|successfully)',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, body, re.IGNORECASE)
        if match:
            amount_str = match.group(1).replace(',', '')
            try:
                amount = float(amount_str)
                # Validate reasonable amount range
                if 10 <= amount <= 50000000:  # Between 10 RWF and 50M RWF
                    return amount
            except ValueError:
                continue
    return None

def extract_fee(body: str) -> Optional[float]:
    """Extract fee from SMS body with enhanced patterns"""
    patterns = [
        r'Fee[:\s]*(\d+(?:\.\d{2})?)\s*RWF',
        r'Charge[:\s]*(\d+(?:\.\d{2})?)\s*RWF',
        r'Cost[:\s]*(\d+(?:\.\d{2})?)\s*RWF',
        r'fee[:\s]+(\d+(?:\.\d{2})?)',
        r'charged[:\s]*(\d+(?:\.\d{2})?)\s*RWF',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, body, re.IGNORECASE)
        if match:
            try:
                fee = float(match.group(1))
                if 0 <= fee <= 10000:  # Reasonable fee range
                    return fee
            except ValueError:
                continue
    return 0

def extract_date(body: str) -> Optional[str]:
    """Extract date and time from SMS body with multiple format support"""
    
    # Common date-time patterns found in MoMo SMS
    patterns = [
        # Format: "2024-12-27 21:49:25"
        r'(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})',
        
        # Format: "at 2024-12-27 21:49:25"
        r'at (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})',
        
        # Format: "completed at 2024-12-27 21:49:25"
        r'completed at (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})',
        
        # Format: "successfully completed at 2024-12-27 21:49:25"
        r'successfully completed at (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})',
        
        # Format: "on 2024-12-27 at 21:49:25"
        r'on (\d{4}-\d{2}-\d{2})\s+at\s+(\d{2}:\d{2}:\d{2})',
        
        # Format: "on 2024-12-27"
        r'on (\d{4}-\d{2}-\d{2})',
        
        # Format: "Date: 2024-12-27"
        r'Date[:\s]*(\d{4}-\d{2}-\d{2})',
        
        # Alternative formats
        r'(\d{2}[-/]\d{2}[-/]\d{4} \d{2}:\d{2}:\d{2})',
        r'(\d{4}[-/]\d{2}[-/]\d{2})',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, body, re.IGNORECASE)
        if match:
            if len(match.groups()) == 2:
                # Date and time in separate groups
                date_part = match.group(1)
                time_part = match.group(2)
                extracted_date = f"{date_part} {time_part}"
            else:
                extracted_date = match.group(1)
            
            # Validate the extracted date format
            try:
                # Try to parse it to ensure it's valid
                datetime.strptime(extracted_date, '%Y-%m-%d %H:%M:%S')
                return extracted_date
            except ValueError:
                try:
                    # Try date only format
                    datetime.strptime(extracted_date, '%Y-%m-%d')
                    return extracted_date + " 00:00:00"  # Add default time
                except ValueError:
                    continue
    
    return None

def clean_name(name: str) -> Optional[str]:
    """Clean and validate extracted names"""
    if not name:
        return None
    
    # Clean the name
    name = name.strip()
    name = re.sub(r'\s+', ' ', name)  # Normalize spaces
    name = re.sub(r'[^\w\s\.]', '', name)  # Remove special chars except dots
    name = name.strip('.')  # Remove trailing dots
    
    # Filter out common non-name words
    invalid_words = {
        'rwf', 'transaction', 'txid', 'fee', 'charge', 'payment', 'transfer',
        'completed', 'successful', 'failed', 'pending', 'date', 'time',
        'amount', 'balance', 'account', 'number', 'code', 'id', 'ref',
        'has', 'been', 'was', 'were', 'have', 'will', 'can', 'may'
    }
    
    name_words = name.lower().split()
    if any(word in invalid_words for word in name_words):
        return None
    
    # Must be at least 2 characters and contain letters
    if len(name) < 2 or not re.search(r'[A-Za-z]', name):
        return None
    
    # Skip if looks like a phone number
    if re.match(r'^\d{9,15}$', name.replace(' ', '')):
        return None
    
    # Capitalize properly
    name = ' '.join(word.capitalize() for word in name.split())
    
    return name

def categorize_transaction_type(body: str) -> str:
    """Enhanced transaction categorization with better accuracy"""
    body_lower = body.lower()
    
    # More specific patterns for better categorization
    patterns = {
        "INCOMING_MONEY": [
            r"you have received.*rwf.*from",
            r"payment.*received.*from",
            r"money.*received.*from",
            r"transfer.*received.*from",
            r"received.*rwf.*from"
        ],
        "PAYMENT": [
            r"your payment.*to.*has been completed",
            r"payment.*to.*completed",
            r"paid.*rwf.*to",
            r"payment.*successful.*to"
        ],
        "TRANSFER_MOBILE": [
            r"transfer.*to.*mobile",
            r"sent.*to.*\d{9,}",  # Phone number pattern
            r"money.*sent.*to.*\d{9,}"
        ],
        "AGENT_WITHDRAWAL": [
            r"withdrawn.*via agent",
            r"via agent.*withdrawn",
            r"agent.*withdrawal",
            r"cash.*withdrawn.*agent"
        ],
        "AIRTIME_PAYMENT": [
            r"airtime.*purchase",
            r"bought.*airtime",
            r"airtime.*top.*up",
            r"recharge.*airtime"
        ],
        "CASH_POWER": [
            r"cash power.*purchase",
            r"electricity.*payment",
            r"eucl.*payment",
            r"power.*bill.*payment",
            r"yego.*payment"
        ],
        "BUNDLE_PURCHASE": [
            r"internet bundle.*purchase",
            r"data bundle.*purchase",
            r"social media bundle",
            r"voice bundle.*purchase",
            r"yello.*bundle"
        ],
        "BANK_DEPOSIT": [
            r"bank deposit",
            r"deposited.*to.*bank",
            r"transfer.*to.*bank.*account"
        ],
        "BANK_TRANSFER": [
            r"bank.*transfer.*from",
            r"transfer.*from.*bank.*to"
        ],
        "PAYMENT_TO_CODE": [
            r"payment.*code holder",
            r"merchant.*payment",
            r"pos.*payment"
        ],
        "THIRD_PARTY": [
            r"initiated.*by.*third party",
            r"third party.*transaction",
            r"on behalf.*of"
        ]
    }
    
    # Check each pattern with priority
    for transaction_type, type_patterns in patterns.items():
        for pattern in type_patterns:
            if re.search(pattern, body_lower):
                return transaction_type
    
    # Fallback categorization
    if "withdrawal" in body_lower or "withdrawn" in body_lower:
        return "WITHDRAWAL"
    elif "payment" in body_lower and "to" in body_lower:
        return "PAYMENT"
    elif "received" in body_lower:
        return "INCOMING_MONEY"
    
    return "OTHER"

def extract_sender_receiver(body: str, transaction_type: str) -> tuple:
    """Enhanced extraction of actual sender and receiver names from SMS"""
    sender = None
    receiver = None
    
    # Clean the body for better pattern matching
    body_clean = re.sub(r'\s+', ' ', body.strip())
    
    if transaction_type == "INCOMING_MONEY":
        # Patterns for incoming money
        patterns = [
            # "You have received 25000 RWF from Samuel Carter"
            r'received\s+\d+[,\d]*\s*RWF\s+from\s+([A-Za-z\s\.]+?)(?:\.|$|\s+Transaction|\s+TxId)',
            
            # "You have received 5000 RWF from John Doe. Transaction ID"
            r'received\s+\d+[,\d]*\s*RWF\s+from\s+([A-Za-z\s\.]+?)(?:\s*\.\s*Transaction|\s*\.\s*TxId)',
            
            # "Payment received from Alice Smith"
            r'payment\s+received\s+from\s+([A-Za-z\s\.]+?)(?:\.|$)',
            
            # "Money received from Robert Johnson"
            r'money\s+received\s+from\s+([A-Za-z\s\.]+?)(?:\.|$)',
            
            # General "from [Name]" pattern
            r'from\s+([A-Za-z][A-Za-z\s\.]{2,30}?)(?:\s*\.|$|\s+on|\s+at|\s+Transaction)',
        ]
        
        for pattern in patterns:
            match = re.search(pattern, body_clean, re.IGNORECASE)
            if match:
                sender = clean_name(match.group(1))
                if sender and len(sender) > 1:
                    break
        
        receiver = "You"  # For incoming money, you are the receiver
    
    elif transaction_type in ["PAYMENT", "TRANSFER_MOBILE", "PAYMENT_TO_CODE"]:
        # Patterns for outgoing payments
        patterns = [
            # "Your payment of 1500 RWF to Jane Smith has been completed"
            r'payment\s+of\s+\d+[,\d]*\s*RWF\s+to\s+([A-Za-z\s\.]+?)(?:\s+has|\s+was|\.|$)',
            
            # "You have paid 2000 RWF to Michael Brown"
            r'paid\s+\d+[,\d]*\s*RWF\s+to\s+([A-Za-z\s\.]+?)(?:\.|$|\s+on)',
            
            # "Transfer to Emily Davis completed"
            r'transfer\s+to\s+([A-Za-z\s\.]+?)\s+completed',
            
            # "Money sent to David Wilson"
            r'money\s+sent\s+to\s+([A-Za-z\s\.]+?)(?:\.|$)',
            
            # "Payment to [Name] successful"
            r'payment\s+to\s+([A-Za-z\s\.]+?)\s+(?:successful|completed)',
            
            # General "to [Name]" pattern
            r'to\s+([A-Za-z][A-Za-z\s\.]{2,30}?)(?:\s+has|\s+was|\.|$|\s+on|\s+at)',
        ]
        
        for pattern in patterns:
            match = re.search(pattern, body_clean, re.IGNORECASE)
            if match:
                receiver = clean_name(match.group(1))
                if receiver and len(receiver) > 1:
                    break
        
        sender = "You"  # For outgoing payments, you are the sender
    
    elif transaction_type == "AGENT_WITHDRAWAL":
        # Patterns for agent withdrawals
        patterns = [
            # "You [Your Name] have via agent: Jane Doe (250123456789), withdrawn"
            r'You\s+([A-Za-z\s\.]+?)\s+have\s+via\s+agent[:\s]*([A-Za-z\s\.]+?)(?:\s*\(|\s*,)',
            
            # "Withdrawn via agent John Smith"
            r'via\s+agent[:\s]*([A-Za-z\s\.]+?)(?:\s*\(|\s*,|$)',
            
            # "Agent: Mary Johnson assisted withdrawal"
            r'agent[:\s]*([A-Za-z\s\.]+?)(?:\s+assisted|\s*\(|\s*,|$)',
        ]
        
        for pattern in patterns:
            match = re.search(pattern, body_clean, re.IGNORECASE)
            if match:
                if len(match.groups()) >= 2:
                    # Extract both user name and agent name
                    user_name = clean_name(match.group(1))
                    agent_name = clean_name(match.group(2))
                    sender = user_name if user_name else "You"
                    receiver = f"Agent: {agent_name}" if agent_name else "Agent"
                else:
                    agent_name = clean_name(match.group(1))
                    receiver = f"Agent: {agent_name}" if agent_name else "Agent"
                    sender = "You"
                break
    
    elif transaction_type in ["AIRTIME_PAYMENT", "CASH_POWER", "BUNDLE_PURCHASE"]:
        # Service payments - extract service provider or specific service
        if "airtime" in body_clean.lower():
            receiver = "MTN Airtime"
        elif "cash power" in body_clean.lower() or "electricity" in body_clean.lower():
            receiver = "EUCL Cash Power"
        elif "internet bundle" in body_clean.lower() or "data bundle" in body_clean.lower():
            receiver = "MTN Internet Bundle"
        elif "voice bundle" in body_clean.lower():
            receiver = "MTN Voice Bundle"
        elif "social media" in body_clean.lower():
            receiver = "MTN Social Media Bundle"
        else:
            receiver = "Service Provider"
        
        sender = "You"
    
    elif transaction_type == "BANK_DEPOSIT":
        # Bank deposit patterns
        patterns = [
            r'deposit\s+to\s+([A-Za-z\s\.]+?\s+Bank)',
            r'transferred\s+to\s+([A-Za-z\s\.]+?\s+Bank)',
            r'bank[:\s]*([A-Za-z\s\.]+)',
        ]
        
        for pattern in patterns:
            match = re.search(pattern, body_clean, re.IGNORECASE)
            if match:
                receiver = clean_name(match.group(1))
                break
        
        if not receiver:
            receiver = "Bank Account"
        sender = "You"
    
    elif transaction_type == "BANK_TRANSFER":
        # Bank transfer patterns
        patterns = [
            r'transfer\s+from\s+([A-Za-z\s\.]+?\s+Bank)\s+to\s+([A-Za-z\s\.]+)',
            r'from\s+([A-Za-z\s\.]+?\s+Bank)',
        ]
        
        for pattern in patterns:
            match = re.search(pattern, body_clean, re.IGNORECASE)
            if match:
                if len(match.groups()) >= 2:
                    sender = clean_name(match.group(1))
                    receiver = clean_name(match.group(2))
                else:
                    sender = clean_name(match.group(1))
                break
    
    # Default fallbacks if still None
    if not sender and transaction_type in ["PAYMENT", "TRANSFER_MOBILE", "AGENT_WITHDRAWAL", "AIRTIME_PAYMENT", "CASH_POWER", "BUNDLE_PURCHASE", "BANK_DEPOSIT"]:
        sender = "You"
    
    if not receiver and transaction_type == "INCOMING_MONEY":
        receiver = "You"
    
    return sender, receiver

def determine_status(body: str) -> str:
    """Determine transaction status from SMS content"""
    body_lower = body.lower()
    
    success_indicators = [
        "completed", "successful", "confirmed", "received", 
        "sent", "deposited", "withdrawn", "purchased", "successfully"
    ]
    
    failure_indicators = [
        "failed", "declined", "rejected", "error", 
        "insufficient", "invalid", "timeout", "cancelled"
    ]
    
    for indicator in failure_indicators:
        if indicator in body_lower:
            return "failed"
    
    for indicator in success_indicators:
        if indicator in body_lower:
            return "completed"
    
    return "pending"

def parse_sms_body(body: str) -> dict:
    """Enhanced SMS parsing with better timestamp and name extraction"""
    try:
        # Normalize whitespace
        body = " ".join(body.split())
        
        # Extract basic information
        transaction_id = extract_transaction_id(body)
        amount = extract_amount(body)
        fee = extract_fee(body)
        
        # IMPROVED: Extract actual timestamp from SMS content
        date = extract_date(body)
        
        # If no date found in body, use current timestamp as fallback
        if not date:
            date = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            logger.warning(f"No date found in SMS, using current time: {body[:100]}")
        
        # Categorize transaction
        transaction_type = categorize_transaction_type(body)
        
        # Extract sender/receiver with enhanced accuracy
        sender, receiver = extract_sender_receiver(body, transaction_type)
        
        # Determine status
        status = determine_status(body)
        
        # Create description
        description = body[:100] + "..." if len(body) > 100 else body
        
        return {
            "transaction_id": transaction_id,
            "type": transaction_type,
            "amount": amount or 0,
            "fee": fee or 0,
            "sender": sender,
            "receiver": receiver,
            "date": date,  # This will now contain the actual timestamp
            "status": status,
            "description": description,
            "raw_body": body
        }
    
    except Exception as e:
        logger.error(f"Error parsing SMS body: {e}")
        return {
            "transaction_id": None,
            "type": "UNPARSEABLE",
            "amount": 0,
            "fee": 0,
            "sender": None,
            "receiver": None,
            "date": datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            "status": "error",
            "description": body[:100] + "..." if len(body) > 100 else body,
            "raw_body": body
        }

def log_unprocessed_sms(body: str, reason: str):
    """Log unprocessed SMS to database"""
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    try:
        c.execute('''
            INSERT INTO unprocessed_sms (raw_body, reason)
            VALUES (?, ?)
        ''', (body, reason))
        conn.commit()
        logger.warning(f"Logged unprocessed SMS: {reason}")
    except Exception as e:
        logger.error(f"Failed to log unprocessed SMS: {e}")
    finally:
        conn.close()

def insert_transaction(tx: dict) -> bool:
    """Insert transaction into database with duplicate handling"""
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    try:
        c.execute('''
            INSERT OR REPLACE INTO transactions
            (transaction_id, type, amount, fee, sender, receiver, date, status, description, raw_body)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            tx['transaction_id'], tx['type'], tx['amount'], tx['fee'],
            tx['sender'], tx['receiver'], tx['date'], tx['status'],
            tx['description'], tx['raw_body']
        ))
        conn.commit()
        return True
    except Exception as e:
        logger.error(f"Failed to insert transaction: {e}")
        return False
    finally:
        conn.close()

# API Endpoints

@app.get("/")
async def root():
    """Root endpoint - API welcome message"""
    return {
        "message": "Welcome to MTN MoMo Analytics API!",
        "version": "1.0.0",
        "endpoints": {
            "upload": "/upload_xml/",
            "transactions": "/transactions/",
            "search": "/search/",
            "analytics": "/analytics/",
            "export": "/export/"
        }
    }

@app.post("/upload_xml/", response_model=UploadResponse)
async def upload_xml(file: UploadFile = File(...)):
    """Upload and process XML file with accurate timestamps"""
    if not file.filename.endswith('.xml'):
        raise HTTPException(status_code=400, detail="Only XML files are allowed")
    
    try:
        content = await file.read()
        root = ET.fromstring(content)
        
        processed_count = 0
        unprocessed_count = 0
        
        for sms in root.findall('sms'):
            body_element = sms.find('body')
            if body_element is not None and body_element.text:
                body = body_element.text.strip()
                
                if body:
                    tx = parse_sms_body(body)
                    
                    # ENHANCEMENT: Use XML timestamp if SMS parsing didn't find a date
                    if not tx['date'] or tx['date'] == datetime.now().strftime('%Y-%m-%d %H:%M:%S'):
                        # Get timestamp from XML attributes
                        xml_timestamp = sms.get('date')  # Unix timestamp in milliseconds
                        readable_date = sms.get('readable_date')  # Human readable date
                        
                        if xml_timestamp:
                            try:
                                # Convert Unix timestamp (milliseconds) to datetime
                                timestamp_seconds = int(xml_timestamp) / 1000
                                dt = datetime.fromtimestamp(timestamp_seconds)
                                tx['date'] = dt.strftime('%Y-%m-%d %H:%M:%S')
                                logger.info(f"Used XML timestamp for transaction: {tx['transaction_id']}")
                            except (ValueError, OverflowError):
                                if readable_date:
                                    tx['date'] = readable_date
                                    logger.info(f"Used readable date for transaction: {tx['transaction_id']}")
                    
                    if tx['type'] == 'UNPARSEABLE':
                        log_unprocessed_sms(body, "Could not parse SMS content")
                        unprocessed_count += 1
                    else:
                        if insert_transaction(tx):
                            processed_count += 1
                        else:
                            unprocessed_count += 1
                else:
                    log_unprocessed_sms("", "Empty SMS body")
                    unprocessed_count += 1
            else:
                log_unprocessed_sms("", "Missing SMS body element")
                unprocessed_count += 1
        
        logger.info(f"Processed {processed_count} transactions, {unprocessed_count} unprocessed")
        
        return UploadResponse(
            message=f"Successfully processed {processed_count} SMS messages with accurate timestamps",
            processed_count=processed_count,
            unprocessed_count=unprocessed_count,
            success=True
        )
    
    except ET.ParseError as e:
        logger.error(f"XML parsing error: {e}")
        raise HTTPException(status_code=400, detail=f"Invalid XML format: {e}")
    except Exception as e:
        logger.error(f"Upload processing error: {e}")
        raise HTTPException(status_code=500, detail=f"Processing failed: {e}")

@app.get("/transactions/", response_model=List[Transaction])
def get_transactions(
    type: Optional[str] = Query(None, description="Filter by transaction type"),
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    min_amount: Optional[float] = Query(None, description="Minimum amount"),
    max_amount: Optional[float] = Query(None, description="Maximum amount"),
    status: Optional[str] = Query(None, description="Filter by status"),
    limit: int = Query(100, description="Limit number of results"),
    offset: int = Query(0, description="Offset for pagination")
):
    """Get transactions with optional filtering"""
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    
    query = """
        SELECT id, transaction_id, type, amount, fee, sender, receiver, 
               date, status, description, raw_body
        FROM transactions WHERE 1=1
    """
    params = []
    
    if type:
        query += " AND type = ?"
        params.append(type)
    if start_date:
        query += " AND date >= ?"
        params.append(start_date)
    if end_date:
        query += " AND date <= ?"
        params.append(end_date)
    if min_amount is not None:
        query += " AND amount >= ?"
        params.append(min_amount)
    if max_amount is not None:
        query += " AND amount <= ?"
        params.append(max_amount)
    if status:
        query += " AND status = ?"
        params.append(status)
    
    query += " ORDER BY date DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])
    
    try:
        c.execute(query, params)
        rows = c.fetchall()
        
        transactions = [Transaction(
            id=r[0], transaction_id=r[1], type=r[2], amount=r[3], fee=r[4],
            sender=r[5], receiver=r[6], date=r[7], status=r[8],
            description=r[9], raw_body=r[10]
        ) for r in rows]
        
        return transactions
    
    except Exception as e:
        logger.error(f"Error fetching transactions: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch transactions")
    finally:
        conn.close()

@app.get("/transaction/{transaction_id}", response_model=Transaction)
def get_transaction(transaction_id: str):
    """Get specific transaction by transaction ID"""
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    
    try:
        c.execute('''
            SELECT id, transaction_id, type, amount, fee, sender, receiver,
                   date, status, description, raw_body
            FROM transactions
            WHERE transaction_id = ?
        ''', (transaction_id,))
        
        row = c.fetchone()
        if row:
            return Transaction(
                id=row[0], transaction_id=row[1], type=row[2], amount=row[3],
                fee=row[4], sender=row[5], receiver=row[6], date=row[7],
                status=row[8], description=row[9], raw_body=row[10]
            )
        else:
            raise HTTPException(status_code=404, detail="Transaction not found")
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching transaction {transaction_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch transaction")
    finally:
        conn.close()

@app.get("/search/")
def search_transactions(
    q: str = Query(..., description="Search query"),
    limit: int = Query(50, description="Limit results")
):
    """Search transactions by description, sender, receiver, or transaction ID"""
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    
    search_term = f"%{q}%"
    
    try:
        c.execute('''
            SELECT id, transaction_id, type, amount, fee, sender, receiver,
                   date, status, description, raw_body
            FROM transactions 
            WHERE 
                description LIKE ? OR
                sender LIKE ? OR
                receiver LIKE ? OR
                transaction_id LIKE ? OR
                type LIKE ? OR
                raw_body LIKE ?
            ORDER BY date DESC
            LIMIT ?
        ''', (search_term, search_term, search_term, search_term, search_term, search_term, limit))
        
        rows = c.fetchall()
        
        transactions = [Transaction(
            id=r[0], transaction_id=r[1], type=r[2], amount=r[3], fee=r[4],
            sender=r[5], receiver=r[6], date=r[7], status=r[8],
            description=r[9], raw_body=r[10]
        ) for r in rows]
        
        return {
            "query": q,
            "results_count": len(transactions),
            "transactions": transactions
        }
    
    except Exception as e:
        logger.error(f"Search error: {e}")
        raise HTTPException(status_code=500, detail="Search failed")
    finally:
        conn.close()

@app.get("/statistics/")
def get_statistics():
    """Get overall transaction statistics for dashboard"""
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    
    try:
        # Total transactions
        c.execute('SELECT COUNT(*) FROM transactions')
        total_transactions = c.fetchone()[0]
        
        # Total amounts by income/expense
        c.execute('''
            SELECT 
                SUM(CASE WHEN type IN ('INCOMING_MONEY', 'BANK_DEPOSIT') THEN amount ELSE 0 END) as total_income,
                SUM(CASE WHEN type NOT IN ('INCOMING_MONEY', 'BANK_DEPOSIT') THEN amount ELSE 0 END) as total_expenses,
                SUM(amount) as total_volume
            FROM transactions
            WHERE amount IS NOT NULL
        ''')
        amounts_data = c.fetchone()
        total_income = amounts_data[0] or 0
        total_expenses = amounts_data[1] or 0
        total_volume = amounts_data[2] or 0
        total_balance = total_income - total_expenses
        
        # This month's data
        c.execute('''
            SELECT 
                COUNT(*) as count,
                SUM(CASE WHEN type IN ('INCOMING_MONEY', 'BANK_DEPOSIT') THEN amount ELSE 0 END) as income,
                SUM(CASE WHEN type NOT IN ('INCOMING_MONEY', 'BANK_DEPOSIT') THEN amount ELSE 0 END) as expenses
            FROM transactions
            WHERE strftime('%Y-%m', date) = strftime('%Y-%m', 'now')
            AND amount IS NOT NULL
        ''')
        month_data = c.fetchone()
        
        return {
            "total_balance": round(total_balance, 2),
            "total_transactions": total_transactions,
            "money_in": round(total_income, 2),
            "money_out": round(total_expenses, 2),
            "total_volume": round(total_volume, 2),
            "this_month": {
                "transactions": month_data[0] if month_data else 0,
                "income": round(month_data[1], 2) if month_data and month_data[1] else 0,
                "expenses": round(month_data[2], 2) if month_data and month_data[2] else 0
            }
        }
    
    except Exception as e:
        logger.error(f"Statistics error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch statistics")
    finally:
        conn.close()

@app.get("/summary/")
def get_summary():
    """Get transaction summary by type for charts"""
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    
    try:
        c.execute('''
            SELECT type, COUNT(*) as count, SUM(amount) as total_amount, AVG(amount) as avg_amount
            FROM transactions
            WHERE amount IS NOT NULL
            GROUP BY type
            ORDER BY total_amount DESC
        ''')
        data = c.fetchall()
        
        summary = [
            {
                "type": row[0],
                "count": row[1],
                "total_amount": round(row[2], 2),
                "avg_amount": round(row[3], 2)
            }
            for row in data
        ]
        
        return {"summary": summary}
    
    except Exception as e:
        logger.error(f"Summary error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch summary")
    finally:
        conn.close()

@app.get("/analytics/monthly/")
def get_monthly_analytics():
    """Get monthly transaction trends for charts"""
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    
    try:
        c.execute('''
            SELECT 
                strftime('%Y-%m', date) as month,
                COUNT(*) as transaction_count,
                SUM(CASE WHEN type IN ('INCOMING_MONEY', 'BANK_DEPOSIT') THEN amount ELSE 0 END) as income,
                SUM(CASE WHEN type NOT IN ('INCOMING_MONEY', 'BANK_DEPOSIT') THEN amount ELSE 0 END) as expenses,
                SUM(amount) as total_volume,
                SUM(fee) as total_fees
            FROM transactions 
            WHERE date IS NOT NULL AND date != ''
            GROUP BY strftime('%Y-%m', date)
            ORDER BY month
        ''')
        
        rows = c.fetchall()
        
        monthly_data = [
            {
                "month": row[0],
                "transaction_count": row[1],
                "income": round(row[2], 2) if row[2] else 0,
                "expenses": round(row[3], 2) if row[3] else 0,
                "total_volume": round(row[4], 2) if row[4] else 0,
                "total_fees": round(row[5], 2) if row[5] else 0,
                "net_flow": round((row[2] or 0) - (row[3] or 0), 2)
            }
            for row in rows
        ]
        
        return {"monthly_analytics": monthly_data}
    
    except Exception as e:
        logger.error(f"Monthly analytics error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch monthly analytics")
    finally:
        conn.close()

@app.get("/analytics/hourly/")
def get_hourly_distribution():
    """Get hourly transaction distribution"""
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    
    try:
        c.execute('''
            SELECT 
                strftime('%H', date) as hour,
                COUNT(*) as transaction_count,
                SUM(amount) as total_amount,
                AVG(amount) as avg_amount
            FROM transactions 
            WHERE date IS NOT NULL AND date != ''
            GROUP BY strftime('%H', date)
            ORDER BY hour
        ''')
        
        rows = c.fetchall()
        
        # Fill in missing hours with 0 values
        hourly_data = []
        hour_map = {row[0]: row for row in rows if row[0]}
        
        for hour in range(24):
            hour_str = f"{hour:02d}"
            if hour_str in hour_map:
                row = hour_map[hour_str]
                hourly_data.append({
                    "hour": hour,
                    "hour_display": f"{hour:02d}:00",
                    "transaction_count": row[1],
                    "total_amount": round(row[2], 2) if row[2] else 0,
                    "avg_amount": round(row[3], 2) if row[3] else 0
                })
            else:
                hourly_data.append({
                    "hour": hour,
                    "hour_display": f"{hour:02d}:00",
                    "transaction_count": 0,
                    "total_amount": 0,
                    "avg_amount": 0
                })
        
        return {"hourly_distribution": hourly_data}
    
    except Exception as e:
        logger.error(f"Hourly analytics error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch hourly analytics")
    finally:
        conn.close()

@app.get("/analytics/insights/")
def get_analytics_insights():
    """Get key analytics insights for dashboard"""
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    
    try:
        # Most active hour
        c.execute('''
            SELECT strftime('%H', date) as hour, COUNT(*) as count
            FROM transactions 
            WHERE date IS NOT NULL AND date != ''
            GROUP BY hour
            ORDER BY count DESC
            LIMIT 1
        ''')
        most_active_hour = c.fetchone()
        
        # Largest transaction
        c.execute('''
            SELECT amount, type, description
            FROM transactions 
            WHERE amount IS NOT NULL
            ORDER BY amount DESC
            LIMIT 1
        ''')
        largest_transaction = c.fetchone()
        
        # Average daily transactions
        c.execute('''
            SELECT AVG(daily_count) as avg_daily
            FROM (
                SELECT DATE(date) as day, COUNT(*) as daily_count
                FROM transactions 
                WHERE date IS NOT NULL AND date != ''
                GROUP BY DATE(date)
            )
        ''')
        avg_daily = c.fetchone()
        
        # Most common transaction type
        c.execute('''
            SELECT type, COUNT(*) as count
            FROM transactions 
            GROUP BY type
            ORDER BY count DESC
            LIMIT 1
        ''')
        most_common_type = c.fetchone()
        
        # Success rate
        c.execute('''
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successful
            FROM transactions
        ''')
        success_data = c.fetchone()
        
        # Average amount
        c.execute('SELECT AVG(amount) FROM transactions WHERE amount IS NOT NULL AND amount > 0')
        avg_amount = c.fetchone()[0]
        
        # Growth rate (current month vs previous month)
        c.execute('''
            SELECT 
                strftime('%Y-%m', date) as month,
                COUNT(*) as count
            FROM transactions 
            WHERE date IS NOT NULL AND date != ''
            GROUP BY month
            ORDER BY month DESC
            LIMIT 2
        ''')
        growth_data = c.fetchall()
        
        growth_rate = 0
        if len(growth_data) >= 2:
            current_month = growth_data[0][1]
            previous_month = growth_data[1][1]
            if previous_month > 0:
                growth_rate = ((current_month - previous_month) / previous_month) * 100
        
        # Average time between transactions (in hours)
        c.execute('''
            SELECT 
                (julianday(MAX(date)) - julianday(MIN(date))) * 24 / COUNT(*) as avg_hours
            FROM transactions 
            WHERE date IS NOT NULL AND date != ''
        ''')
        avg_time_between = c.fetchone()
        
        # Busiest day of week
        c.execute('''
            SELECT 
                CASE strftime('%w', date)
                    WHEN '0' THEN 'Sunday'
                    WHEN '1' THEN 'Monday'
                    WHEN '2' THEN 'Tuesday'
                    WHEN '3' THEN 'Wednesday'
                    WHEN '4' THEN 'Thursday'
                    WHEN '5' THEN 'Friday'
                    WHEN '6' THEN 'Saturday'
                END as day_name,
                COUNT(*) as count
            FROM transactions 
            WHERE date IS NOT NULL AND date != ''
            GROUP BY strftime('%w', date)
            ORDER BY count DESC
            LIMIT 1
        ''')
        busiest_day = c.fetchone()
        
        success_rate = (success_data[1] / success_data[0] * 100) if success_data[0] > 0 else 0
        
        insights = {
            "most_active_hour": {
                "hour": f"{int(most_active_hour[0]):02d}:00" if most_active_hour and most_active_hour[0] else "N/A",
                "transaction_count": most_active_hour[1] if most_active_hour else 0
            },
            "largest_transaction": {
                "amount": round(largest_transaction[0], 2) if largest_transaction else 0,
                "type": largest_transaction[1] if largest_transaction else "N/A",
                "description": largest_transaction[2] if largest_transaction else "N/A"
            },
            "average_daily_transactions": round(avg_daily[0], 1) if avg_daily and avg_daily[0] else 0,
            "most_common_type": {
                "type": most_common_type[0] if most_common_type else "N/A",
                "count": most_common_type[1] if most_common_type else 0
            },
            "success_rate": round(success_rate, 1),
            "average_amount": round(avg_amount, 2) if avg_amount else 0,
            "growth_rate": round(growth_rate, 1),
            "average_time_between_hours": round(avg_time_between[0], 1) if avg_time_between and avg_time_between[0] else 0,
            "busiest_day": busiest_day[0] if busiest_day else "N/A"
        }
        
        return insights
    
    except Exception as e:
        logger.error(f"Insights error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch insights")
    finally:
        conn.close()

@app.get("/export/")
def export_transactions(
    format: str = Query("csv", description="Export format: csv or json"),
    type: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    min_amount: Optional[float] = Query(None),
    max_amount: Optional[float] = Query(None)
):
    """Export filtered transactions as CSV or JSON"""
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    
    query = """
        SELECT transaction_id, type, amount, fee, sender, receiver, 
               date, status, description, raw_body
        FROM transactions WHERE 1=1
    """
    params = []
    
    if type:
        query += " AND type = ?"
        params.append(type)
    if start_date:
        query += " AND date >= ?"
        params.append(start_date)
    if end_date:
        query += " AND date <= ?"
        params.append(end_date)
    if min_amount is not None:
        query += " AND amount >= ?"
        params.append(min_amount)
    if max_amount is not None:
        query += " AND amount <= ?"
        params.append(max_amount)
    
    query += " ORDER BY date DESC"
    
    try:
        c.execute(query, params)
        rows = c.fetchall()
        
        if format.lower() == "csv":
            output = io.StringIO()
            writer = csv.writer(output)
            writer.writerow([
                'Transaction ID', 'Type', 'Amount', 'Fee', 'Sender', 
                'Receiver', 'Date', 'Status', 'Description', 'Raw Body'
            ])
            writer.writerows(rows)
            
            response = StreamingResponse(
                io.BytesIO(output.getvalue().encode('utf-8')),
                media_type="text/csv",
                headers={"Content-Disposition": "attachment; filename=momo_transactions.csv"}
            )
            return response
        
        else:  # JSON format
            transactions = [
                {
                    "transaction_id": r[0], "type": r[1], "amount": r[2], "fee": r[3],
                    "sender": r[4], "receiver": r[5], "date": r[6], "status": r[7],
                    "description": r[8], "raw_body": r[9]
                }
                for r in rows
            ]
            return {
                "transactions": transactions, 
                "count": len(transactions),
                "export_timestamp": datetime.now().isoformat()
            }
    
    except Exception as e:
        logger.error(f"Export error: {e}")
        raise HTTPException(status_code=500, detail="Export failed")
    finally:
        conn.close()

@app.get("/health/")
def health_check():
    """Health check endpoint"""
    try:
        conn = sqlite3.connect(DB)
        c = conn.cursor()
        c.execute('SELECT COUNT(*) FROM transactions')
        transaction_count = c.fetchone()[0]
        conn.close()
        
        return {
            "status": "healthy",
            "database": "connected",
            "transaction_count": transaction_count,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return {
            "status": "unhealthy",
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }

# Error handlers
@app.exception_handler(404)
async def not_found_handler(request, exc):
    return {"error": "Endpoint not found", "status_code": 404}

@app.exception_handler(500)
async def internal_error_handler(request, exc):
    logger.error(f"Internal server error: {exc}")
    return {"error": "Internal server error", "status_code": 500}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")