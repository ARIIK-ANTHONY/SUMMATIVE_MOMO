# 📚 API Documentation - MTN MoMo SMS Analytics Platform

<div align="center">
  <img src="https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white" />
  <img src="https://img.shields.io/badge/Flask-000000?style=for-the-badge&logo=flask&logoColor=white" />
  <img src="https://img.shields.io/badge/Status-Operational-brightgreen?style=for-the-badge" />
  
  <h2>🌐 Complete API Reference Guide</h2>
  <p><em>Dual API architecture for comprehensive SMS transaction analytics</em></p>
</div>

---

## 🏗️ API Architecture Overview

The platform uses a **dual API architecture** designed for optimal performance and functionality:

```ascii
Frontend (Port 3000)
       │
       ├─────────────────┬─────────────────
       ▼                 ▼
🚀 FastAPI           📊 Flask API
  Port 8000           Port 5000
  Primary API         Analytics API
  Core Operations     Reports & Insights
```

| API | Purpose | Port | Status | Documentation |
|-----|---------|------|--------|---------------|
| **FastAPI** | Core operations, CRUD | 8000 | ✅ Operational | http://localhost:8000/docs |
| **Flask** | Analytics, reporting | 5000 | ✅ Operational | Manual documentation below |

---

## 🚀 FastAPI - Primary API Server

**Base URL**: `http://localhost:8000`  
**Interactive Documentation**: http://localhost:8000/docs  
**OpenAPI Schema**: http://localhost:8000/openapi.json

### 🔧 Core Endpoints

#### 1. Health Check
```http
GET /health
```

**Description**: System health monitoring and basic statistics

**Response**:
```json
{
  "status": "healthy",
  "database": "connected",
  "total_transactions": 1693,
  "last_updated": "2025-06-15T18:56:16",
  "api_version": "1.0.0",
  "uptime": "2h 15m 30s"
}
```

**Status Codes**:
- `200 OK` - System operational
- `503 Service Unavailable` - Database connection issues

---

#### 2. Transaction Statistics
```http
GET /statistics/
```

**Description**: Comprehensive transaction analytics and metrics

**Response**:
```json
{
  "total_transactions": 1693,
  "total_amount": 45750000.0,
  "average_transaction": 2700.5,
  "transaction_types": {
    "INCOMING_MONEY": 423,
    "PAYMENT": 387,
    "TRANSFER": 312,
    "WITHDRAWAL": 256,
    "AIRTIME": 169,
    "BUNDLE": 89,
    "BANK_DEPOSIT": 37,
    "CASH_POWER": 20
  },
  "processing_success_rate": 100.0,
  "date_range": {
    "earliest": "2024-01-15",
    "latest": "2024-06-15"
  },
  "daily_average": 242.14
}
```

---

#### 3. Get All Transactions
```http
GET /transactions/
```

**Description**: Retrieve paginated list of all transactions

**Query Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer | 1 | Page number (1-based) |
| `limit` | integer | 50 | Items per page (max 200) |
| `type` | string | null | Filter by transaction type |
| `start_date` | string | null | Filter from date (YYYY-MM-DD) |
| `end_date` | string | null | Filter to date (YYYY-MM-DD) |

**Example Request**:
```http
GET /transactions/?page=1&limit=10&type=INCOMING_MONEY&start_date=2024-01-01
```

**Response**:
```json
{
  "transactions": [
    {
      "id": 1,
      "transaction_id": "TX12345678",
      "type": "INCOMING_MONEY",
      "amount": 50000.0,
      "fee": 500.0,
      "sender": "John Doe",
      "recipient": "ALU Student",
      "date": "2024-03-15",
      "status": "completed",
      "description": "Payment received from John Doe",
      "created_at": "2024-03-15T10:30:00Z"
    }
  ],
  "pagination": {
    "current_page": 1,
    "total_pages": 170,
    "total_items": 1693,
    "items_per_page": 10,
    "has_next": true,
    "has_prev": false
  },
  "filters": {
    "type": "INCOMING_MONEY",
    "start_date": "2024-01-01",
    "end_date": null
  }
}
```

---

#### 4. Get Single Transaction
```http
GET /transactions/{transaction_id}
```

**Description**: Retrieve detailed information for a specific transaction

**Path Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `transaction_id` | integer | Yes | Unique transaction ID |

**Example Request**:
```http
GET /transactions/123
```

**Response**:
```json
{
  "id": 123,
  "transaction_id": "TX87654321",
  "type": "PAYMENT",
  "amount": 25000.0,
  "fee": 250.0,
  "sender": "MTN User",
  "recipient": "EUCL",
  "receiver": "EUCL",
  "date": "2024-03-20",
  "status": "completed",
  "description": "School fees payment to EUCL",
  "raw_message": "You have paid RWF 25,000 to EUCL...",
  "raw_body": "You have paid RWF 25,000 to EUCL...",
  "created_at": "2024-03-20T14:45:00Z",
  "updated_at": "2024-03-20T14:45:00Z"
}
```

**Status Codes**:
- `200 OK` - Transaction found
- `404 Not Found` - Transaction doesn't exist

---

#### 5. Upload SMS Data
```http
POST /upload_xml/
```

**Description**: Upload and process new SMS data from XML file

**Request Body**:
```http
Content-Type: multipart/form-data

file: [XML file containing SMS data]
```

**Response**:
```json
{
  "status": "success",
  "message": "SMS data processed successfully",
  "results": {
    "total_sms": 150,
    "processed": 148,
    "failed": 2,
    "success_rate": 98.7,
    "new_transactions": 148
  },
  "processing_time": "2.3s"
}
```

**Status Codes**:
- `200 OK` - File processed successfully
- `400 Bad Request` - Invalid file format
- `422 Unprocessable Entity` - File processing errors

---

### 🔍 Search Endpoint
```http
GET /search
```

**Description**: Advanced search across transaction fields

**Query Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| `q` | string | Search query (searches across all text fields) |
| `amount_min` | float | Minimum transaction amount |
| `amount_max` | float | Maximum transaction amount |
| `date_from` | string | Start date (YYYY-MM-DD) |
| `date_to` | string | End date (YYYY-MM-DD) |

**Example Request**:
```http
GET /search?q=EUCL&amount_min=10000&amount_max=50000
```

---

## 📊 Flask API - Analytics Server

**Base URL**: `http://localhost:5000`  
**Purpose**: Advanced analytics, reporting, and business intelligence

### 📈 Analytics Endpoints

#### 1. Business Insights
```http
GET /analytics/insights/
```

**Description**: Comprehensive business intelligence and transaction insights

**Response**:
```json
{
  "insights": {
    "total_transactions": 1693,
    "total_amount": 45750000.0,
    "peak_transaction_day": "Friday",
    "most_common_type": "INCOMING_MONEY",
    "average_daily_volume": 242.14,
    "growth_trend": "positive",
    "peak_hour": "14:00",
    "weekend_vs_weekday_ratio": 0.3
  },
  "patterns": {
    "weekday_distribution": {
      "Monday": 285,
      "Tuesday": 298,
      "Wednesday": 276,
      "Thursday": 312,
      "Friday": 345,
      "Saturday": 98,
      "Sunday": 79
    },
    "hourly_distribution": {
      "08:00": 45,
      "12:00": 78,
      "14:00": 95,
      "18:00": 67
    },
    "monthly_trends": {
      "January": 387,
      "February": 412,
      "March": 456,
      "April": 438
    }
  },
  "financial_metrics": {
    "largest_transaction": 250000.0,
    "smallest_transaction": 100.0,
    "median_amount": 15000.0,
    "total_fees_collected": 125670.0
  }
}
```

---

#### 2. Day of Week Analysis
```http
GET /analytics/day_of_week/
```

**Description**: Transaction patterns by day of the week

**Response**:
```json
{
  "analysis": "day_of_week",
  "data": {
    "Monday": {
      "count": 285,
      "total_amount": 6850000.0,
      "average_amount": 24035.1,
      "percentage_of_week": 16.8
    },
    "Tuesday": {
      "count": 298,
      "total_amount": 7125000.0,
      "average_amount": 23909.4,
      "percentage_of_week": 17.6
    },
    "Wednesday": {
      "count": 276,
      "total_amount": 6630000.0,
      "average_amount": 24021.7,
      "percentage_of_week": 16.3
    },
    "Thursday": {
      "count": 312,
      "total_amount": 7488000.0,
      "average_amount": 24000.0,
      "percentage_of_week": 18.4
    },
    "Friday": {
      "count": 345,
      "total_amount": 8970000.0,
      "average_amount": 26000.0,
      "percentage_of_week": 20.4
    },
    "Saturday": {
      "count": 98,
      "total_amount": 1960000.0,
      "average_amount": 20000.0,
      "percentage_of_week": 5.8
    },
    "Sunday": {
      "count": 79,
      "total_amount": 1185000.0,
      "average_amount": 15000.0,
      "percentage_of_week": 4.7
    }
  },
  "insights": {
    "busiest_day": "Friday",
    "slowest_day": "Sunday",
    "weekend_ratio": 10.5,
    "weekday_ratio": 89.5
  }
}
```

---

#### 3. Time Analysis
```http
GET /analytics/time_between/
```

**Description**: Time-based transaction analysis and patterns

**Query Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `start_date` | string | null | Analysis start date (YYYY-MM-DD) |
| `end_date` | string | null | Analysis end date (YYYY-MM-DD) |
| `granularity` | string | "daily" | Time granularity (hourly, daily, weekly, monthly) |

**Response**:
```json
{
  "analysis": "time_between",
  "period": {
    "start_date": "2024-01-01",
    "end_date": "2024-06-15",
    "granularity": "daily",
    "total_days": 166
  },
  "metrics": {
    "average_daily_transactions": 10.2,
    "peak_day": {
      "date": "2024-03-15",
      "count": 45,
      "amount": 1125000.0
    },
    "quiet_day": {
      "date": "2024-02-25",
      "count": 2,
      "amount": 15000.0
    },
    "consistency_score": 0.78,
    "growth_rate": 12.5
  },
  "trends": {
    "daily_averages": [10, 12, 8, 15, 18, 22, 19],
    "weekly_growth": [2.1, 3.4, 1.8, 4.2, 2.9],
    "seasonal_patterns": "Higher activity in March-April"
  }
}
```

---

### 📋 Reporting Endpoints

#### 1. Custom Report Generation
```http
GET /reports/custom_report
```

**Description**: Generate customizable Excel reports

**Query Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `start_date` | string | null | Report start date (YYYY-MM-DD) |
| `end_date` | string | null | Report end date (YYYY-MM-DD) |
| `transaction_types` | string | "all" | Comma-separated types to include |
| `format` | string | "xlsx" | Report format (xlsx, csv) |
| `include_charts` | boolean | true | Include visual charts in report |

**Example Request**:
```http
GET /reports/custom_report?start_date=2024-01-01&end_date=2024-03-31&transaction_types=INCOMING_MONEY,PAYMENT&format=xlsx&include_charts=true
```

**Response**:
```
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
Content-Disposition: attachment; filename="momo_transactions_2024-01-01_to_2024-03-31.xlsx"

[Excel file binary data]
```

**Status Codes**:
- `200 OK` - Report generated successfully
- `400 Bad Request` - Invalid date range or parameters
- `404 Not Found` - No data found for specified criteria

---

#### 2. Monthly Summary Report
```http
GET /reports/monthly_summary
```

**Description**: Pre-formatted monthly summary reports

**Query Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `month` | integer | current | Month number (1-12) |
| `year` | integer | current | Year (YYYY) |
| `format` | string | "json" | Response format (json, xlsx, pdf) |

**Example Request**:
```http
GET /reports/monthly_summary?month=3&year=2024&format=json
```

**Response**:
```json
{
  "report": {
    "period": "March 2024",
    "summary": {
      "total_transactions": 456,
      "total_amount": 11250000.0,
      "total_fees": 45600.0,
      "average_per_day": 14.7,
      "growth_from_previous": 8.3
    },
    "breakdown_by_type": {
      "INCOMING_MONEY": {
        "count": 125,
        "amount": 4500000.0,
        "percentage": 40.0
      },
      "PAYMENT": {
        "count": 98,
        "amount": 2450000.0,
        "percentage": 21.8
      },
      "TRANSFER": {
        "count": 87,
        "amount": 2175000.0,
        "percentage": 19.3
      }
    },
    "daily_summary": [
      {"date": "2024-03-01", "count": 12, "amount": 325000.0},
      {"date": "2024-03-02", "count": 18, "amount": 485000.0}
    ],
    "top_senders": [
      {"name": "MTN Rwanda", "count": 45, "amount": 1125000.0}
    ],
    "insights": [
      "Peak activity on weekdays",
      "INCOMING_MONEY transactions increased by 15%",
      "Average transaction size grew by 3.2%"
    ]
  },
  "generated_at": "2024-06-15T15:30:00Z",
  "report_id": "RPT_2024_03_001"
}
```

---

#### 3. Dynamic Report Generator
```http
POST /reports/generate
```

**Description**: Generate custom reports with advanced filtering

**Request Body**:
```json
{
  "report_name": "Custom Financial Analysis",
  "filters": {
    "date_range": {
      "start": "2024-01-01",
      "end": "2024-06-15"
    },
    "transaction_types": ["INCOMING_MONEY", "PAYMENT", "TRANSFER"],
    "amount_range": {
      "min": 1000,
      "max": 100000
    },
    "senders": ["MTN Rwanda", "Airtel Rwanda"]
  },
  "grouping": {
    "primary": "type",
    "secondary": "month"
  },
  "metrics": ["count", "sum", "average", "median"],
  "format": "xlsx",
  "include_visualizations": true,
  "email_delivery": {
    "enabled": false,
    "recipients": []
  }
}
```

**Response**:
```json
{
  "status": "success",
  "report_id": "RPT_CUSTOM_2024_001",
  "download_url": "/reports/download/RPT_CUSTOM_2024_001",
  "preview": {
    "total_records": 1245,
    "date_range": "2024-01-01 to 2024-06-15",
    "file_size": "2.4 MB",
    "estimated_generation_time": "15 seconds"
  },
  "expires_at": "2024-06-16T15:30:00Z"
}
```

---

## 🔧 Error Handling

### Standard Error Response Format
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid transaction type specified",
    "details": {
      "field": "type",
      "provided": "INVALID_TYPE",
      "allowed": ["INCOMING_MONEY", "PAYMENT", "TRANSFER", "WITHDRAWAL", "AIRTIME", "BUNDLE", "BANK_DEPOSIT", "CASH_POWER"]
    },
    "timestamp": "2024-06-15T15:30:00Z",
    "request_id": "req_12345"
  }
}
```

### Common Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid request parameters |
| `NOT_FOUND` | 404 | Resource not found |
| `DATABASE_ERROR` | 500 | Database connection issues |
| `PROCESSING_ERROR` | 422 | SMS processing failures |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `AUTHENTICATION_REQUIRED` | 401 | Authentication needed |

---

## 📝 Request/Response Examples

### Example: Search Transactions with Pagination
```bash
# Search for EUCL payments over 10,000 RWF
curl -X GET "http://localhost:8000/search?q=EUCL&amount_min=10000&page=1&limit=5" \
  -H "Accept: application/json"
```

### Example: Generate Monthly Excel Report
```bash
# Download March 2024 report as Excel
curl -X GET "http://localhost:5000/reports/custom_report?start_date=2024-03-01&end_date=2024-03-31&format=xlsx" \
  -H "Accept: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" \
  --output "march_2024_report.xlsx"
```

### Example: Get Analytics Insights
```bash
# Get comprehensive business insights
curl -X GET "http://localhost:5000/analytics/insights/" \
  -H "Accept: application/json" | jq .
```

---

## 🚀 Getting Started with the APIs

### 1. Start Both Servers
```bash
# Terminal 1: FastAPI
cd api
python -m uvicorn momo_api:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2: Flask
cd api
python flask_api.py
```

### 2. Verify APIs are Running
```bash
# Check FastAPI
curl http://localhost:8000/health

# Check Flask API
curl http://localhost:5000/analytics/insights/
```

### 3. Explore Interactive Documentation
- **FastAPI Docs**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

---

## 📊 Rate Limiting & Performance

| Endpoint Type | Rate Limit | Cache TTL | Avg Response Time |
|---------------|------------|-----------|-------------------|
| Health checks | 1000/hour | N/A | <10ms |
| Data retrieval | 500/hour | 30s | <100ms |
| Search queries | 200/hour | 60s | <200ms |
| Report generation | 50/hour | 300s | 2-15s |
| File uploads | 10/hour | N/A | 1-30s |

---

## 🔒 Security & Authentication

### Current Implementation
- **CORS enabled** for frontend integration
- **Input validation** on all endpoints
- **SQL injection protection** via parameterized queries
- **File type validation** for uploads

### Future Enhancements
- JWT token authentication
- API key management
- Role-based access control
- Request signing

---
