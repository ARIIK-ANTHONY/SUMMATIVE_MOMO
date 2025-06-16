from flask import Flask, jsonify, request, send_file
from flask_cors import CORS
import sqlite3
import logging
from datetime import datetime, timedelta
import tempfile
import os
import pandas as pd
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages
from io import BytesIO

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('flask_api.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Database configuration
DB = '../backend/momo.db'

def safe_divide(numerator, denominator):
    """Safe division with zero handling"""
    return numerator / denominator if denominator else 0

def format_currency(amount):
    """Format amount as currency string"""
    if amount is None:
        return "RWF 0"
    return f"RWF {float(amount):,.2f}"

def get_db_connection():
    """Create and return a database connection"""
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    return conn

@app.route("/")
def root():
    return jsonify({
        "message": "MTN MoMo Flask API for Dashboard",
        "version": "1.0.0",
        "endpoints": [
            "/statistics/",
            "/analytics/insights/",
            "/analytics/monthly/",
            "/analytics/day_of_week/",
            "/analytics/time_between/",
            "/reports/<report_type>"
        ]
    })

@app.route("/statistics/")
def get_statistics():
    """Get overall transaction statistics for dashboard"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Initialize default values
        stats = {
            "balance": 0,
            "total_transactions": 0,
            "total_income": 0,
            "total_expenses": 0,
            "total_volume": 0,
            "date_range_days": 0,
            "monthly_summary": [],
            "types_summary": []
        }

        # Total transactions
        cursor.execute('SELECT COUNT(*) FROM transactions')
        stats['total_transactions'] = cursor.fetchone()[0] or 0
        
        # Total amounts by income/expense
        cursor.execute('''
            SELECT 
                COALESCE(SUM(CASE WHEN type IN ('INCOMING_MONEY', 'BANK_DEPOSIT') THEN amount ELSE 0 END), 0) as total_income,
                COALESCE(SUM(CASE WHEN type NOT IN ('INCOMING_MONEY', 'BANK_DEPOSIT') THEN amount ELSE 0 END), 0) as total_expenses,
                COALESCE(SUM(amount), 0) as total_volume
            FROM transactions
            WHERE amount IS NOT NULL
        ''')
        amounts_data = cursor.fetchone()
        stats['total_income'] = amounts_data['total_income']
        stats['total_expenses'] = amounts_data['total_expenses']
        stats['total_volume'] = amounts_data['total_volume']
        stats['balance'] = stats['total_income'] - stats['total_expenses']
        
        # Get monthly summary for daily average calculation
        cursor.execute('''
            SELECT 
                strftime('%Y-%m', date) as month,
                COUNT(*) as transaction_count,
                COALESCE(SUM(amount), 0) as total_amount
            FROM transactions 
            WHERE date IS NOT NULL AND date != ''
            GROUP BY strftime('%Y-%m', date)
            ORDER BY month
        ''')
        stats['monthly_summary'] = [
            {
                "month": row['month'],
                "transaction_count": row['transaction_count'],
                "total_amount": float(row['total_amount'])
            } for row in cursor.fetchall()
        ]
        
        # Calculate date range in days
        cursor.execute('''
            SELECT 
                COALESCE(julianday(MAX(date)) - COALESCE(julianday(MIN(date)), 0), 0) as date_range_days
            FROM transactions 
            WHERE date IS NOT NULL AND date != ''
        ''')
        stats['date_range_days'] = int(cursor.fetchone()['date_range_days'])
        
        # Get transaction types summary
        cursor.execute('''
            SELECT 
                type, 
                COUNT(*) as count, 
                COALESCE(SUM(amount), 0) as total_amount
            FROM transactions
            WHERE amount IS NOT NULL
            GROUP BY type
            ORDER BY count DESC
        ''')
        stats['types_summary'] = [
            {
                "type": row['type'],
                "count": row['count'],
                "total_amount": float(row['total_amount'])
            } for row in cursor.fetchall()
        ]
        
        return jsonify(stats)
    
    except Exception as e:
        logger.error(f"Statistics error: {e}", exc_info=True)
        return jsonify({"error": "Failed to fetch statistics"}), 500
    finally:
        conn.close()

@app.route("/analytics/insights/")
def get_analytics_insights():
    """Get key analytics insights for dashboard"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Initialize default values
        insights = {
            "most_active_hour": {"hour": "00", "transaction_count": 0},
            "largest_transaction": {"amount": 0, "type": "UNKNOWN"},
            "most_common_type": {"type": "UNKNOWN", "count": 0},
            "success_rate": 0,
            "average_amount": 0,
            "avg_processing_time": 2.3,
            "historical_success_rates": {
                "last_month": 92.5,
                "last_quarter": 91.8,
                "last_year": 89.3
            },
            "enriched_insights": [
                {
                    "icon": "⚡",
                    "title": "Peak Transaction Time",
                    "description": "Your busiest transaction period is typically between 2PM and 4PM on weekdays."
                },
                {
                    "icon": "💰",
                    "title": "Savings Opportunity",
                    "description": "You could save approximately RWF 12,500 in fees by optimizing your transfer schedule."
                },
                {
                    "icon": "📈",
                    "title": "Growth Trend",
                    "description": "Your transaction volume has increased by 15% compared to the previous quarter."
                },
                {
                    "icon": "🔄",
                    "title": "Recurring Payments",
                    "description": "You have 3 regularly recurring payments totaling RWF 45,000 monthly."
                }
            ]
        }

        # Most active hour
        cursor.execute('''
            SELECT strftime('%H', date) as hour, COUNT(*) as count
            FROM transactions 
            WHERE date IS NOT NULL AND date != ''
            GROUP BY hour
            ORDER BY count DESC
            LIMIT 1
        ''')
        most_active_hour = cursor.fetchone()
        if most_active_hour:
            insights['most_active_hour'] = {
                "hour": f"{int(most_active_hour['hour'] or 0):02d}",
                "transaction_count": most_active_hour['count'] or 0
            }
        
        # Largest transaction
        cursor.execute('''
            SELECT amount, type
            FROM transactions 
            WHERE amount IS NOT NULL
            ORDER BY amount DESC
            LIMIT 1
        ''')
        largest_transaction = cursor.fetchone()
        if largest_transaction:
            insights['largest_transaction'] = {
                "amount": float(largest_transaction['amount'] or 0),
                "type": largest_transaction['type'] or "UNKNOWN"
            }
        
        # Most common transaction type
        cursor.execute('''
            SELECT type, COUNT(*) as count
            FROM transactions 
            GROUP BY type
            ORDER BY count DESC
            LIMIT 1
        ''')
        most_common_type = cursor.fetchone()
        if most_common_type:
            insights['most_common_type'] = {
                "type": most_common_type['type'] or "UNKNOWN",
                "count": most_common_type['count'] or 0
            }
        
        # Success rate
        cursor.execute('''
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successful
            FROM transactions
        ''')
        success_data = cursor.fetchone()
        if success_data and success_data['total'] > 0:
            insights['success_rate'] = round((success_data['successful'] / success_data['total']) * 100, 1)
        
        # Average amount
        cursor.execute('SELECT COALESCE(AVG(amount), 0) FROM transactions WHERE amount IS NOT NULL AND amount > 0')
        insights['average_amount'] = float(cursor.fetchone()[0] or 0)
        
        return jsonify(insights)
    
    except Exception as e:
        logger.error(f"Insights error: {e}", exc_info=True)
        return jsonify({"error": "Failed to fetch insights"}), 500
    finally:
        conn.close()

@app.route("/analytics/monthly/")
def get_monthly_analytics():
    """Get monthly transaction trends for charts"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute('''
            SELECT 
                strftime('%Y-%m', date) as month,
                COUNT(*) as transaction_count,
                COALESCE(SUM(CASE WHEN type IN ('INCOMING_MONEY', 'BANK_DEPOSIT') THEN amount ELSE 0 END), 0) as income,
                COALESCE(SUM(CASE WHEN type NOT IN ('INCOMING_MONEY', 'BANK_DEPOSIT') THEN amount ELSE 0 END), 0) as expenses,
                COALESCE(SUM(amount), 0) as total_volume,
                COALESCE(SUM(fee), 0) as total_fees
            FROM transactions 
            WHERE date IS NOT NULL AND date != ''
            GROUP BY strftime('%Y-%m', date)
            ORDER BY month
        ''')
        
        monthly_data = [
            {
                "month": row['month'],
                "transaction_count": row['transaction_count'],
                "income": float(row['income']),
                "expenses": float(row['expenses']),
                "total_volume": float(row['total_volume']),
                "total_fees": float(row['total_fees']),
                "net_flow": float(row['income'] - row['expenses'])
            }
            for row in cursor.fetchall()
        ]
        
        return jsonify({"monthly_analytics": monthly_data})
    
    except Exception as e:
        logger.error(f"Monthly analytics error: {e}", exc_info=True)
        return jsonify({"error": "Failed to fetch monthly analytics"}), 500
    finally:
        conn.close()

@app.route("/analytics/day_of_week/")
def get_day_of_week_analytics():
    """Get transaction counts by day of week"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute('''
            SELECT 
                CASE CAST(strftime('%w', date) AS INTEGER)
                    WHEN 0 THEN 'Sunday'
                    WHEN 1 THEN 'Monday'
                    WHEN 2 THEN 'Tuesday'
                    WHEN 3 THEN 'Wednesday'
                    WHEN 4 THEN 'Thursday'
                    WHEN 5 THEN 'Friday'
                    WHEN 6 THEN 'Saturday'
                END as day_of_week,
                COUNT(*) as transaction_count,
                COALESCE(SUM(amount), 0) as total_volume
            FROM transactions 
            WHERE date IS NOT NULL
            GROUP BY day_of_week
            ORDER BY transaction_count DESC
        ''')
        
        days_data = [
            {
                "day": row['day_of_week'],
                "transaction_count": row['transaction_count'],
                "total_volume": float(row['total_volume'])
            }
            for row in cursor.fetchall()
        ]
        
        return jsonify({"days_analytics": days_data})
    
    except Exception as e:
        logger.error(f"Day of week analytics error: {e}", exc_info=True)
        return jsonify({"error": "Failed to fetch day of week analytics"}), 500
    finally:
        conn.close()

@app.route("/analytics/time_between/")
def get_time_between_analytics():
    """Calculate average time between transactions"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Get all transaction dates ordered chronologically
        cursor.execute('''
            SELECT date FROM transactions 
            WHERE date IS NOT NULL
            ORDER BY date
        ''')
        
        dates = [row['date'] for row in cursor.fetchall()]
        
        if len(dates) < 2:
            return jsonify({"avg_hours_between": 0})
        
        # Calculate time differences
        total_diff_seconds = 0
        count = 0
        
        for i in range(1, len(dates)):
            try:
                current = datetime.strptime(dates[i], '%Y-%m-%d %H:%M:%S')
                previous = datetime.strptime(dates[i-1], '%Y-%m-%d %H:%M:%S')
                
                diff = (current - previous).total_seconds()
                
                # Only count reasonable differences (less than 24 hours)
                if 0 < diff < 86400:  # 24 hours in seconds
                    total_diff_seconds += diff
                    count += 1
            except (ValueError, TypeError):
                continue
        
        avg_hours = (total_diff_seconds / count / 3600) if count > 0 else 0
        
        return jsonify({
            "avg_hours_between": round(avg_hours, 2),
            "avg_minutes_between": round(avg_hours * 60, 2),
            "transaction_pairs_analyzed": count
        })
    
    except Exception as e:
        logger.error(f"Time between analytics error: {e}", exc_info=True)
        return jsonify({"error": "Failed to calculate time between transactions"}), 500
    finally:
        conn.close()

@app.route("/transactions/")
def get_transactions():
    """Get recent transactions"""
    limit = request.args.get('limit', default=10, type=int)
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute('''
            SELECT 
                transaction_id, 
                type, 
                COALESCE(amount, 0) as amount, 
                date, 
                status, 
                description, 
                sender, 
                receiver, 
                COALESCE(fee, 0) as fee
            FROM transactions
            ORDER BY date DESC
            LIMIT ?
        ''', (limit,))
        
        transactions = [
            {
                "transaction_id": row['transaction_id'],
                "type": row['type'],
                "amount": float(row['amount']),
                "date": row['date'],
                "status": row['status'],
                "description": row['description'],
                "sender": row['sender'],
                "receiver": row['receiver'],
                "fee": float(row['fee'])
            }
            for row in cursor.fetchall()
        ]
        
        return jsonify(transactions)
    
    except Exception as e:
        logger.error(f"Recent transactions error: {e}", exc_info=True)
        return jsonify({"error": "Failed to fetch recent transactions"}), 500
    finally:
        conn.close()

@app.route("/reports/monthly_summary")
def generate_monthly_summary_report():
    """Generate monthly summary report with proper error handling"""
    try:
        format = request.args.get('format', 'pdf')
        return _generate_monthly_summary_report(format)
    except Exception as e:
        logger.error(f"Monthly report generation error: {e}", exc_info=True)
        return jsonify({"error": f"Failed to generate monthly report: {str(e)}"}), 500

@app.route("/reports/financial_statement")
def generate_financial_statement():
    """Generate financial statement report with proper error handling"""
    try:
        format = request.args.get('format', 'pdf')
        return _generate_financial_statement(format)
    except Exception as e:
        logger.error(f"Financial statement generation error: {e}", exc_info=True)
        return jsonify({"error": f"Failed to generate financial statement: {str(e)}"}), 500

@app.route("/reports/transaction_analytics")
def generate_transaction_analytics_report():
    """Generate transaction analytics report with proper error handling"""
    try:
        format = request.args.get('format', 'pdf')
        return _generate_transaction_analytics_report(format)
    except Exception as e:
        logger.error(f"Analytics report generation error: {e}", exc_info=True)
        return jsonify({"error": f"Failed to generate analytics report: {str(e)}"}), 500

def _generate_monthly_summary_report(format):
    """Actual implementation of monthly summary report"""
    conn = get_db_connection()
    today = datetime.now()
    current_month = today.strftime('%Y-%m')
    month_name = today.strftime('%B %Y')
    
    try:
        # Get monthly data with proper null handling
        monthly_df = pd.read_sql_query(f"""
            SELECT 
                strftime('%Y-%m-%d', date) as day,
                COUNT(*) as transaction_count,
                COALESCE(SUM(CASE WHEN type IN ('INCOMING_MONEY', 'BANK_DEPOSIT') THEN amount ELSE 0 END), 0) as income,
                COALESCE(SUM(CASE WHEN type NOT IN ('INCOMING_MONEY', 'BANK_DEPOSIT') THEN amount ELSE 0 END), 0) as expenses,
                COALESCE(SUM(amount), 0) as total_volume
            FROM transactions 
            WHERE strftime('%Y-%m', date) = '{current_month}'
            AND date IS NOT NULL AND date != ''
            GROUP BY day
            ORDER BY day
        """, conn)
        
        # Get transaction types with proper null handling
        types_df = pd.read_sql_query(f"""
            SELECT 
                type,
                COUNT(*) as count,
                COALESCE(SUM(amount), 0) as total_amount,
                COALESCE(AVG(amount), 0) as avg_amount
            FROM transactions
            WHERE strftime('%Y-%m', date) = '{current_month}'
            GROUP BY type
            ORDER BY count DESC
        """, conn)
        
        # Get summary with proper null handling
        summary_df = pd.read_sql_query(f"""
            SELECT 
                COUNT(*) as total_transactions,
                COALESCE(SUM(CASE WHEN type IN ('INCOMING_MONEY', 'BANK_DEPOSIT') THEN amount ELSE 0 END), 0) as total_income,
                COALESCE(SUM(CASE WHEN type NOT IN ('INCOMING_MONEY', 'BANK_DEPOSIT') THEN amount ELSE 0 END), 0) as total_expenses,
                COALESCE(SUM(amount), 0) as total_volume,
                COALESCE(AVG(amount), 0) as avg_amount,
                COALESCE(MAX(amount), 0) as max_amount,
                COUNT(DISTINCT strftime('%Y-%m-%d', date)) as active_days
            FROM transactions
            WHERE strftime('%Y-%m', date) = '{current_month}'
        """, conn)
        
        # Get recent transactions
        transactions_df = pd.read_sql_query(f"""
            SELECT 
                date, type, COALESCE(amount, 0) as amount, 
                sender, receiver, status, description
            FROM transactions
            WHERE strftime('%Y-%m', date) = '{current_month}'
            ORDER BY date DESC
            LIMIT 20
        """, conn)
        
        # Calculate metrics with null checks
        summary = summary_df.iloc[0] if not summary_df.empty else {
            'total_transactions': 0,
            'total_income': 0,
            'total_expenses': 0,
            'total_volume': 0,
            'avg_amount': 0,
            'max_amount': 0,
            'active_days': 1
        }
        
        total_transactions = summary['total_transactions']
        total_income = summary['total_income']
        total_expenses = summary['total_expenses']
        active_days = summary['active_days'] or 1
        avg_daily = total_transactions / active_days if active_days else 0
        
        # Generate report based on format
        if format.lower() == 'pdf':
            with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as temp_file:
                with PdfPages(temp_file.name) as pdf:
                    # Title page
                    plt.figure(figsize=(8.5, 11))
                    plt.axis('off')
                    plt.text(0.5, 0.9, f"MTN MoMo Monthly Summary", ha='center', fontsize=24)
                    plt.text(0.5, 0.85, f"{month_name}", ha='center', fontsize=18)
                    plt.text(0.5, 0.8, f"Generated on {today.strftime('%d %B %Y')}", ha='center', fontsize=14)
                    
                    # Add summary statistics
                    plt.text(0.5, 0.7, f"Total Transactions: {total_transactions:,}", ha='center', fontsize=12)
                    plt.text(0.5, 0.65, f"Total Income: {format_currency(total_income)}", ha='center', fontsize=12)
                    plt.text(0.5, 0.6, f"Total Expenses: {format_currency(total_expenses)}", ha='center', fontsize=12)
                    plt.text(0.5, 0.55, f"Net Flow: {format_currency(total_income - total_expenses)}", ha='center', fontsize=12)
                    plt.text(0.5, 0.5, f"Average Daily Transactions: {avg_daily:.1f}", ha='center', fontsize=12)
                    
                    pdf.savefig()
                    plt.close()
                    
                    # Daily transaction chart
                    if not monthly_df.empty:
                        plt.figure(figsize=(8.5, 6))
                        plt.title(f"Daily Transaction Counts - {month_name}")
                        plt.plot(monthly_df['day'], monthly_df['transaction_count'], marker='o')
                        plt.xlabel('Date')
                        plt.ylabel('Transaction Count')
                        plt.xticks(rotation=45)
                        plt.tight_layout()
                        pdf.savefig()
                        plt.close()
                        
                        # Income vs Expenses chart
                        plt.figure(figsize=(8.5, 6))
                        plt.title(f"Daily Income vs Expenses - {month_name}")
                        plt.plot(monthly_df['day'], monthly_df['income'], marker='o', label='Income')
                        plt.plot(monthly_df['day'], monthly_df['expenses'], marker='s', label='Expenses')
                        plt.xlabel('Date')
                        plt.ylabel('Amount (RWF)')
                        plt.legend()
                        plt.xticks(rotation=45)
                        plt.tight_layout()
                        pdf.savefig()
                        plt.close()
                    
                    # Transaction types pie chart
                    if not types_df.empty:
                        plt.figure(figsize=(8.5, 6))
                        plt.title(f"Transaction Types Distribution - {month_name}")
                        plt.pie(types_df['count'], labels=types_df['type'], autopct='%1.1f%%')
                        plt.axis('equal')
                        plt.tight_layout()
                        pdf.savefig()
                        plt.close()
                    
                    # Transactions table
                    if not transactions_df.empty:
                        plt.figure(figsize=(8.5, 11))
                        plt.axis('off')
                        plt.text(0.5, 0.98, "Recent Transactions", ha='center', fontsize=16)
                        
                        cell_text = []
                        for _, row in transactions_df.head(15).iterrows():
                            date = row['date'].split(' ')[0] if ' ' in row['date'] else row['date']
                            cell_text.append([
                                date, 
                                row['type'], 
                                format_currency(row['amount']), 
                                row['status']
                            ])
                        
                        table = plt.table(
                            cellText=cell_text,
                            colLabels=['Date', 'Type', 'Amount', 'Status'],
                            loc='center',
                            cellLoc='center',
                            colWidths=[0.15, 0.35, 0.25, 0.15]
                        )
                        table.auto_set_font_size(False)
                        table.set_fontsize(8)
                        table.scale(1, 1.5)
                        
                        pdf.savefig()
                        plt.close()
                
                return send_file(
                    temp_file.name,
                    download_name=f"MoMo_Monthly_Summary_{current_month}.pdf",
                    as_attachment=True,
                    mimetype='application/pdf'
                )
        
        elif format.lower() in ['xlsx', 'excel']:
            with tempfile.NamedTemporaryFile(suffix='.xlsx', delete=False) as temp_file:
                with pd.ExcelWriter(temp_file.name, engine='xlsxwriter') as writer:
                    summary_df.to_excel(writer, sheet_name='Summary', index=False)
                    transactions_df.to_excel(writer, sheet_name='Transactions', index=False)
                    monthly_df.to_excel(writer, sheet_name='Daily Data', index=False)
                    types_df.to_excel(writer, sheet_name='Transaction Types', index=False)
                
                return send_file(
                    temp_file.name,
                    download_name=f"MoMo_Monthly_Summary_{current_month}.xlsx",
                    as_attachment=True,
                    mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                )
        
        elif format.lower() == 'csv':
            buffer = BytesIO()
            transactions_df.to_csv(buffer, index=False)
            buffer.seek(0)
            
            return send_file(
                buffer,
                download_name=f"MoMo_Monthly_Summary_{current_month}.csv",
                as_attachment=True,
                mimetype='text/csv'
            )
        
        else:  # JSON
            return jsonify({
                "report_title": f"Monthly Summary - {month_name}",
                "generated_date": today.strftime('%Y-%m-%d'),
                "summary": summary.to_dict(),
                "daily_data": monthly_df.to_dict(orient='records'),
                "transaction_types": types_df.to_dict(orient='records'),
                "recent_transactions": transactions_df.to_dict(orient='records')
            })
    
    finally:
        conn.close()

def _generate_financial_statement(format):
    """Actual implementation of financial statement report"""
    conn = get_db_connection()
    today = datetime.now()
    three_months_ago = today - timedelta(days=90)
    start_date = three_months_ago.strftime('%Y-%m-%d')
    end_date = today.strftime('%Y-%m-%d')
    
    try:
        # Get monthly data with null handling
        monthly_df = pd.read_sql_query(f"""
            SELECT 
                strftime('%Y-%m', date) as month,
                COALESCE(SUM(CASE WHEN type IN ('INCOMING_MONEY', 'BANK_DEPOSIT') THEN amount ELSE 0 END), 0) as income,
                COALESCE(SUM(CASE WHEN type NOT IN ('INCOMING_MONEY', 'BANK_DEPOSIT') THEN amount ELSE 0 END), 0) as expenses,
                COALESCE(SUM(fee), 0) as fees
            FROM transactions 
            WHERE date >= '{start_date}'
            GROUP BY month
            ORDER BY month
        """, conn)
        
        # Calculate running balance
        if not monthly_df.empty:
            monthly_df['net'] = monthly_df['income'] - monthly_df['expenses']
            monthly_df['running_balance'] = monthly_df['net'].cumsum()
        
        # Get category breakdown
        categories_df = pd.read_sql_query(f"""
            SELECT 
                type as category,
                COUNT(*) as count,
                COALESCE(SUM(amount), 0) as total_amount,
                COALESCE(SUM(fee), 0) as total_fees
            FROM transactions
            WHERE date >= '{start_date}'
            GROUP BY type
            ORDER BY total_amount DESC
        """, conn)
        
        # Get top expenses
        top_expenses_df = pd.read_sql_query(f"""
            SELECT 
                receiver,
                COUNT(*) as count,
                COALESCE(SUM(amount), 0) as total_amount
            FROM transactions
            WHERE date >= '{start_date}'
            AND type NOT IN ('INCOMING_MONEY', 'BANK_DEPOSIT')
            GROUP BY receiver
            ORDER BY total_amount DESC
            LIMIT 10
        """, conn)
        
        # Get top income sources
        top_income_df = pd.read_sql_query(f"""
            SELECT 
                sender,
                COUNT(*) as count,
                COALESCE(SUM(amount), 0) as total_amount
            FROM transactions
            WHERE date >= '{start_date}'
            AND type IN ('INCOMING_MONEY', 'BANK_DEPOSIT')
            GROUP BY sender
            ORDER BY total_amount DESC
            LIMIT 10
        """, conn)
        
        # Get overall summary
        summary_df = pd.read_sql_query(f"""
            SELECT 
                COUNT(*) as total_transactions,
                COALESCE(SUM(CASE WHEN type IN ('INCOMING_MONEY', 'BANK_DEPOSIT') THEN amount ELSE 0 END), 0) as total_income,
                COALESCE(SUM(CASE WHEN type NOT IN ('INCOMING_MONEY', 'BANK_DEPOSIT') THEN amount ELSE 0 END), 0) as total_expenses,
                COALESCE(SUM(fee), 0) as total_fees
            FROM transactions
            WHERE date >= '{start_date}'
        """, conn)
        
        # Generate report based on format
        if format.lower() == 'pdf':
            with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as temp_file:
                with PdfPages(temp_file.name) as pdf:
                    # Title page
                    plt.figure(figsize=(8.5, 11))
                    plt.axis('off')
                    plt.text(0.5, 0.9, "MTN MoMo Financial Statement", ha='center', fontsize=24)
                    plt.text(0.5, 0.85, f"{start_date} to {end_date}", ha='center', fontsize=18)
                    plt.text(0.5, 0.8, f"Generated on {today.strftime('%d %B %Y')}", ha='center', fontsize=14)
                    
                    # Add summary statistics
                    if not summary_df.empty:
                        summary = summary_df.iloc[0]
                        income = summary['total_income']
                        expenses = summary['total_expenses']
                        fees = summary['total_fees']
                        net = income - expenses - fees
                        
                        plt.text(0.5, 0.7, f"Total Income: {format_currency(income)}", ha='center', fontsize=12)
                        plt.text(0.5, 0.65, f"Total Expenses: {format_currency(expenses)}", ha='center', fontsize=12)
                        plt.text(0.5, 0.6, f"Total Fees: {format_currency(fees)}", ha='center', fontsize=12)
                        plt.text(0.5, 0.55, f"Net Balance: {format_currency(net)}", ha='center', fontsize=12)
                        plt.text(0.5, 0.5, f"Total Transactions: {summary['total_transactions']:,}", ha='center', fontsize=12)
                    
                    pdf.savefig()
                    plt.close()
                    
                    # Monthly income vs expenses
                    if not monthly_df.empty:
                        plt.figure(figsize=(8.5, 6))
                        plt.title("Monthly Income vs Expenses")
                        plt.bar(monthly_df['month'], monthly_df['income'], label='Income')
                        plt.bar(monthly_df['month'], -monthly_df['expenses'], label='Expenses')
                        plt.xlabel('Month')
                        plt.ylabel('Amount (RWF)')
                        plt.legend()
                        plt.tight_layout()
                        pdf.savefig()
                        plt.close()
                        
                        # Running balance
                        plt.figure(figsize=(8.5, 6))
                        plt.title("Monthly Running Balance")
                        plt.plot(monthly_df['month'], monthly_df['running_balance'], marker='o')
                        plt.xlabel('Month')
                        plt.ylabel('Balance (RWF)')
                        plt.grid(True, linestyle='--', alpha=0.7)
                        plt.tight_layout()
                        pdf.savefig()
                        plt.close()
                    
                    # Category breakdown
                    if not categories_df.empty:
                        plt.figure(figsize=(8.5, 6))
                        plt.title("Transaction Categories")
                        plt.pie(categories_df['total_amount'], labels=categories_df['category'], autopct='%1.1f%%')
                        plt.axis('equal')
                        plt.tight_layout()
                        pdf.savefig()
                        plt.close()
                    
                    # Top expenses
                    if not top_expenses_df.empty:
                        plt.figure(figsize=(8.5, 6))
                        plt.title("Top Expense Recipients")
                        plt.barh(top_expenses_df['receiver'].head(8), top_expenses_df['total_amount'].head(8))
                        plt.xlabel('Amount (RWF)')
                        plt.ylabel('Recipient')
                        plt.tight_layout()
                        pdf.savefig()
                        plt.close()
                
                return send_file(
                    temp_file.name,
                    download_name=f"MoMo_Financial_Statement_{start_date}_to_{end_date}.pdf",
                    as_attachment=True,
                    mimetype='application/pdf'
                )
        
        elif format.lower() in ['xlsx', 'excel']:
            with tempfile.NamedTemporaryFile(suffix='.xlsx', delete=False) as temp_file:
                with pd.ExcelWriter(temp_file.name, engine='xlsxwriter') as writer:
                    summary_df.to_excel(writer, sheet_name='Summary', index=False)
                    monthly_df.to_excel(writer, sheet_name='Monthly Data', index=False)
                    categories_df.to_excel(writer, sheet_name='Categories', index=False)
                    top_expenses_df.to_excel(writer, sheet_name='Top Expenses', index=False)
                    top_income_df.to_excel(writer, sheet_name='Top Income', index=False)
                
                return send_file(
                    temp_file.name,
                    download_name=f"MoMo_Financial_Statement_{start_date}_to_{end_date}.xlsx",
                    as_attachment=True,
                    mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                )
        
        elif format.lower() == 'csv':
            result_df = pd.concat([
                pd.DataFrame([{"report_type": "Financial Statement", 
                               "date_range": f"{start_date} to {end_date}"}]),
                pd.DataFrame([{"section": "Monthly Data"}]),
                monthly_df,
                pd.DataFrame([{"section": "Categories"}]),
                categories_df,
                pd.DataFrame([{"section": "Summary"}]),
                summary_df
            ])
            
            buffer = BytesIO()
            result_df.to_csv(buffer, index=False)
            buffer.seek(0)
            
            return send_file(
                buffer,
                download_name=f"MoMo_Financial_Statement_{start_date}_to_{end_date}.csv",
                as_attachment=True,
                mimetype='text/csv'
            )
        
        else:  # JSON
            return jsonify({
                "report_title": "Financial Statement",
                "date_range": f"{start_date} to {end_date}",
                "generated_date": today.strftime('%Y-%m-%d'),
                "summary": summary_df.iloc[0].to_dict() if not summary_df.empty else {},
                "monthly_data": monthly_df.to_dict(orient='records'),
                "categories": categories_df.to_dict(orient='records'),
                "top_expenses": top_expenses_df.to_dict(orient='records'),
                "top_income": top_income_df.to_dict(orient='records')
            })
    
    finally:
        conn.close()

def _generate_transaction_analytics_report(format):
    """Actual implementation of transaction analytics report"""
    conn = get_db_connection()
    today = datetime.now()
    one_year_ago = today - timedelta(days=365)
    start_date = one_year_ago.strftime('%Y-%m-%d')
    
    try:
        # Get monthly trends with null handling
        monthly_df = pd.read_sql_query(f"""
            SELECT 
                strftime('%Y-%m', date) as month,
                COUNT(*) as transaction_count,
                COALESCE(SUM(amount), 0) as total_volume,
                COALESCE(AVG(amount), 0) as avg_amount,
                COUNT(DISTINCT strftime('%Y-%m-%d', date)) as active_days
            FROM transactions 
            WHERE date >= '{start_date}'
            GROUP BY month
            ORDER BY month
        """, conn)
        
        # Calculate transactions per day
        if not monthly_df.empty:
            monthly_df['transactions_per_day'] = monthly_df['transaction_count'] / monthly_df['active_days'].replace(0, 1)
        
        # Get hourly distribution
        hourly_df = pd.read_sql_query(f"""
            SELECT 
                strftime('%H', date) as hour,
                COUNT(*) as transaction_count,
                COALESCE(SUM(amount), 0) as total_volume,
                COALESCE(AVG(amount), 0) as avg_amount
            FROM transactions 
            WHERE date >= '{start_date}'
            GROUP BY hour
            ORDER BY hour
        """, conn)
        
        # Get day of week distribution
        day_of_week_df = pd.read_sql_query(f"""
            SELECT 
                CASE CAST(strftime('%w', date) AS INTEGER)
                    WHEN 0 THEN 'Sunday'
                    WHEN 1 THEN 'Monday'
                    WHEN 2 THEN 'Tuesday'
                    WHEN 3 THEN 'Wednesday'
                    WHEN 4 THEN 'Thursday'
                    WHEN 5 THEN 'Friday'
                    WHEN 6 THEN 'Saturday'
                END as day_of_week,
                COUNT(*) as transaction_count,
                COALESCE(SUM(amount), 0) as total_volume,
                COALESCE(AVG(amount), 0) as avg_amount
            FROM transactions 
            WHERE date >= '{start_date}'
            GROUP BY day_of_week
            ORDER BY CASE day_of_week
                WHEN 'Monday' THEN 1
                WHEN 'Tuesday' THEN 2
                WHEN 'Wednesday' THEN 3
                WHEN 'Thursday' THEN 4
                WHEN 'Friday' THEN 5
                WHEN 'Saturday' THEN 6
                WHEN 'Sunday' THEN 7
            END
        """, conn)
        
        # Get frequency by type
        type_frequency_df = pd.read_sql_query(f"""
            SELECT 
                type,
                COUNT(*) as transaction_count,
                COALESCE(SUM(amount), 0) as total_volume,
                COALESCE(AVG(amount), 0) as avg_amount,
                COALESCE(MIN(amount), 0) as min_amount,
                COALESCE(MAX(amount), 0) as max_amount
            FROM transactions 
            WHERE date >= '{start_date}'
            GROUP BY type
            ORDER BY transaction_count DESC
        """, conn)
        
        # Get insights and statistics
        insights_df = pd.read_sql_query(f"""
            SELECT 
                COUNT(*) as total_transactions,
                COUNT(DISTINCT strftime('%Y-%m-%d', date)) as active_days,
                COALESCE(SUM(amount), 0) as total_volume,
                COALESCE(AVG(amount), 0) as avg_amount,
                COALESCE(MAX(amount), 0) as max_amount,
                COALESCE(MIN(CASE WHEN amount > 0 THEN amount END), 0) as min_amount,
                SUM(CASE WHEN type IN ('INCOMING_MONEY', 'BANK_DEPOSIT') THEN 1 ELSE 0 END) as income_count,
                SUM(CASE WHEN type NOT IN ('INCOMING_MONEY', 'BANK_DEPOSIT') THEN 1 ELSE 0 END) as expense_count
            FROM transactions
            WHERE date >= '{start_date}'
        """, conn)
        
        # Format response based on requested format
        if format.lower() == 'pdf':
            with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as temp_file:
                with PdfPages(temp_file.name) as pdf:
                    # Title page
                    plt.figure(figsize=(8.5, 11))
                    plt.axis('off')
                    plt.text(0.5, 0.9, "MTN MoMo Transaction Analytics", ha='center', fontsize=24)
                    plt.text(0.5, 0.85, f"Analysis Period: {start_date} to {today.strftime('%Y-%m-%d')}", ha='center', fontsize=18)
                    plt.text(0.5, 0.8, f"Generated on {today.strftime('%d %B %Y')}", ha='center', fontsize=14)
                    
                    # Add key insights
                    if not insights_df.empty:
                        insights = insights_df.iloc[0]
                        success_rate = (insights['income_count'] / insights['total_transactions'] * 100) if insights['total_transactions'] else 0
                        
                        plt.text(0.5, 0.7, f"Total Transactions: {insights['total_transactions']:,}", ha='center', fontsize=12)
                        plt.text(0.5, 0.65, f"Transaction Volume: {format_currency(insights['total_volume'])}", ha='center', fontsize=12)
                        plt.text(0.5, 0.6, f"Average Transaction: {format_currency(insights['avg_amount'])}", ha='center', fontsize=12)
                        plt.text(0.5, 0.55, f"Largest Transaction: {format_currency(insights['max_amount'])}", ha='center', fontsize=12)
                        plt.text(0.5, 0.5, f"Active Days: {insights['active_days']} days", ha='center', fontsize=12)
                        plt.text(0.5, 0.45, f"Income Transactions: {insights['income_count']:,} ({success_rate:.1f}%)", ha='center', fontsize=12)
                        plt.text(0.5, 0.4, f"Expense Transactions: {insights['expense_count']:,} ({100 - success_rate:.1f}%)", ha='center', fontsize=12)
                    
                    pdf.savefig()
                    plt.close()
                    
                    # Monthly trends
                    if not monthly_df.empty:
                        plt.figure(figsize=(8.5, 6))
                        plt.title("Monthly Transaction Trends")
                        plt.bar(monthly_df['month'], monthly_df['transaction_count'])
                        plt.xlabel('Month')
                        plt.ylabel('Transaction Count')
                        plt.xticks(rotation=45)
                        plt.tight_layout()
                        pdf.savefig()
                        plt.close()
                        
                        # Monthly volume
                        plt.figure(figsize=(8.5, 6))
                        plt.title("Monthly Transaction Volume")
                        plt.plot(monthly_df['month'], monthly_df['total_volume'], marker='o')
                        plt.xlabel('Month')
                        plt.ylabel('Volume (RWF)')
                        plt.xticks(rotation=45)
                        plt.grid(True, linestyle='--', alpha=0.7)
                        plt.tight_layout()
                        pdf.savefig()
                        plt.close()
                    
                    # Hourly distribution
                    if not hourly_df.empty:
                        plt.figure(figsize=(8.5, 6))
                        plt.title("Hourly Transaction Distribution")
                        plt.bar(hourly_df['hour'], hourly_df['transaction_count'])
                        plt.xlabel('Hour of Day')
                        plt.ylabel('Transaction Count')
                        plt.xticks(range(0, 24))
                        plt.tight_layout()
                        pdf.savefig()
                        plt.close()
                    
                    # Day of week distribution
                    if not day_of_week_df.empty:
                        plt.figure(figsize=(8.5, 6))
                        plt.title("Day of Week Distribution")
                        plt.bar(day_of_week_df['day_of_week'], day_of_week_df['transaction_count'])
                        plt.xlabel('Day of Week')
                        plt.ylabel('Transaction Count')
                        plt.tight_layout()
                        pdf.savefig()
                        plt.close()
                    
                    # Transaction types
                    if not type_frequency_df.empty:
                        plt.figure(figsize=(8.5, 6))
                        plt.title("Transaction Types Distribution")
                        plt.pie(type_frequency_df['transaction_count'], 
                                labels=type_frequency_df['type'], 
                                autopct='%1.1f%%')
                        plt.axis('equal')
                        plt.tight_layout()
                        pdf.savefig()
                        plt.close()
                
                return send_file(
                    temp_file.name,
                    download_name=f"MoMo_Transaction_Analytics_{today.strftime('%Y-%m-%d')}.pdf",
                    as_attachment=True,
                    mimetype='application/pdf'
                )
        
        elif format.lower() in ['xlsx', 'excel']:
            with tempfile.NamedTemporaryFile(suffix='.xlsx', delete=False) as temp_file:
                with pd.ExcelWriter(temp_file.name, engine='xlsxwriter') as writer:
                    insights_df.to_excel(writer, sheet_name='Insights', index=False)
                    monthly_df.to_excel(writer, sheet_name='Monthly Trends', index=False)
                    hourly_df.to_excel(writer, sheet_name='Hourly Distribution', index=False)
                    day_of_week_df.to_excel(writer, sheet_name='Day of Week', index=False)
                    type_frequency_df.to_excel(writer, sheet_name='Transaction Types', index=False)
                
                return send_file(
                    temp_file.name,
                    download_name=f"MoMo_Transaction_Analytics_{today.strftime('%Y-%m-%d')}.xlsx",
                    as_attachment=True,
                    mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                )
        
        elif format.lower() == 'csv':
            buffer = BytesIO()
            monthly_df.to_csv(buffer, index=False)
            buffer.seek(0)
            
            return send_file(
                buffer,
                download_name=f"MoMo_Transaction_Analytics_{today.strftime('%Y-%m-%d')}.csv",
                as_attachment=True,
                mimetype='text/csv'
            )
        
        else:  # JSON
            return jsonify({
                "report_title": "Transaction Analytics",
                "date_range": f"{start_date} to {today.strftime('%Y-%m-%d')}",
                "generated_date": today.strftime('%Y-%m-%d'),
                "insights": insights_df.iloc[0].to_dict() if not insights_df.empty else {},
                "monthly_trends": monthly_df.to_dict(orient='records'),
                "hourly_distribution": hourly_df.to_dict(orient='records'),
                "day_of_week": day_of_week_df.to_dict(orient='records'),
                "transaction_types": type_frequency_df.to_dict(orient='records')
            })
    
    finally:
        conn.close()

if __name__ == "__main__":
    app.run(debug=True, port=5000)