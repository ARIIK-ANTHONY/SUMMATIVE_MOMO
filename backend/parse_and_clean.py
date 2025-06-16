import xml.etree.ElementTree as ET
import re
from datetime import datetime
import logging
import os

os.makedirs("logs", exist_ok=True)
logging.basicConfig(filename="logs/unprocessed_sms.log", level=logging.INFO)

def extract_transaction_id(body):
    match = re.search(r"TxId[:\s]*([0-9]+)", body)
    if match:
        return match.group(1)
    match = re.search(r"Transaction ID[:\s]*([0-9]+)", body)
    if match:
        return match.group(1)
    match = re.search(r"Financial Transaction Id[:\s]*([0-9]+)", body)
    if match:
        return match.group(1)
    return None

def extract_date(body):
    match = re.search(r"(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})", body)
    if match:
        try:
            return datetime.strptime(match.group(1).strip(), "%Y-%m-%d %H:%M:%S").isoformat()
        except:
            return match.group(1).strip()
    return None

def parse_message(body):
    if "received" in body and "from" in body:
        match = re.search(r"received\s+(\d+)\s+RWF\s+from\s+(.*?)(?:\.|$)", body)
        if match:
            return {
                "type": "Incoming Money",
                "amount": int(match.group(1)),
                "sender": match.group(2).strip(),
                "recipient": None,
                "transaction_id": extract_transaction_id(body),
                "date": extract_date(body),
                "raw_message": body
            }

    elif "payment of" in body and "to" in body:
        match = re.search(r"payment of (\d+) RWF to (.*?)(?:\.|$)", body)
        if match:
            return {
                "type": "Payment",
                "amount": int(match.group(1)),
                "sender": None,
                "recipient": match.group(2).strip(),
                "transaction_id": extract_transaction_id(body),
                "date": extract_date(body),
                "raw_message": body
            }

    elif "withdrawn" in body and "agent" in body:
        match = re.search(r"withdrawn\s+(\d+)\s+RWF.*?agent.*?:\s+(.*?)\s+\(", body)
        if match:
            return {
                "type": "Agent Withdrawal",
                "amount": int(match.group(1)),
                "sender": None,
                "recipient": match.group(2).strip(),
                "transaction_id": extract_transaction_id(body),
                "date": extract_date(body),
                "raw_message": body
            }

    elif "internet bundle" in body:
        match = re.search(r"bundle.*?for\s+(\d+)\s+RWF", body)
        if match:
            return {
                "type": "Internet Bundle Purchase",
                "amount": int(match.group(1)),
                "sender": None,
                "recipient": "MTN MoMo",
                "transaction_id": extract_transaction_id(body),
                "date": extract_date(body),
                "raw_message": body
            }

    return None

def parse_sms(file_path):
    tree = ET.parse(file_path)
    root = tree.getroot()
    messages = []

    for sms in root.findall("sms"):
        body = sms.get("body")
        if body is None:
            continue
        body = body.strip()
        parsed = parse_message(body)
        if parsed:
            messages.append(parsed)
        else:
            logging.info(body)

    return messages

if __name__ == "__main__":
    data = parse_sms("../sms_data.xml")
    print(data[:2])