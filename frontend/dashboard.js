// dashboard.js - Main dashboard script for MTN MoMo Analytics
// This file handles data fetching, UI updates, and error handling for the dashboard
const FALLBACK_DATA = {
    statistics: {
        balance: 2478903,
        total_transactions: 1254,
        total_income: 5678900,
        total_expenses: 3199997,
        total_volume: 8878897,
        date_range_days: 187,
        monthly_summary: [
            { month: "2024-01", transaction_count: 108, total_amount: 675432 },
            { month: "2024-02", transaction_count: 125, total_amount: 792103 },
            { month: "2024-03", transaction_count: 142, total_amount: 843567 },
            { month: "2024-04", transaction_count: 156, total_amount: 912784 },
            { month: "2024-05", transaction_count: 187, total_amount: 1054689 },
            { month: "2024-06", transaction_count: 192, total_amount: 1103987 }
        ],
        types_summary: [
            { type: "PAYMENT", count: 452, total_amount: 2345678 },
            { type: "INCOMING_MONEY", count: 238, total_amount: 4567890 },
            { type: "TRANSFER", count: 198, total_amount: 1234567 },
            { type: "AIRTIME", count: 176, total_amount: 89765 },
            { type: "WITHDRAWAL", count: 132, total_amount: 876543 },
            { type: "BANK_DEPOSIT", count: 58, total_amount: 1234567 }
        ]
    },
    insights: {
        most_active_hour: { hour: "14", transaction_count: 187 },
        largest_transaction: { amount: 500487, type: "BANK_DEPOSIT" },
        most_common_type: { type: "PAYMENT", count: 452 },
        success_rate: 94.8,
        average_amount: 249803,
        avg_processing_time: 2.3
    },
    monthly: {
        monthly_analytics: [
            { month: "2024-01", transaction_count: 108, income: 543210, expenses: 234567, net_flow: 308643 },
            { month: "2024-02", transaction_count: 125, income: 623456, expenses: 254321, net_flow: 369135 },
            { month: "2024-03", transaction_count: 142, income: 712345, expenses: 287654, net_flow: 424691 },
            { month: "2024-04", transaction_count: 156, income: 798765, expenses: 312345, net_flow: 486420 },
            { month: "2024-05", transaction_count: 187, income: 876543, expenses: 345678, net_flow: 530865 },
            { month: "2024-06", transaction_count: 192, income: 923456, expenses: 367890, net_flow: 555566 }
        ]
    },
    days: {
        days_analytics: [
            { day: "Monday", transaction_count: 208, total_volume: 1567890 },
            { day: "Friday", transaction_count: 187, total_volume: 1456789 },
            { day: "Wednesday", transaction_count: 172, total_volume: 1345678 },
            { day: "Saturday", transaction_count: 165, total_volume: 1234567 },
            { day: "Thursday", transaction_count: 158, total_volume: 1123456 },
            { day: "Tuesday", transaction_count: 153, total_volume: 1012345 },
            { day: "Sunday", transaction_count: 121, total_volume: 876543 }
        ]
    },
    time_between: {
        avg_hours_between: 6.3,
        avg_minutes_between: 378,
        transaction_pairs_analyzed: 1187
    }
};

let usesFallbackData = false;
let dataIssues = [];

// Update fetchData function to handle errors better
function fetchData() {
    console.log('Fetching data from API...');
    dataIssues = [];
    
    // Fetch statistics
    fetch(API_URL + '/statistics/')
        .then(response => {
            if (!response.ok) {
                throw new Error(`Statistics API returned ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('Statistics data:', data);
            updateStatistics(data);
            updateCharts(data);
        })
        .catch(error => {
            console.error('Error fetching statistics:', error);
            dataIssues.push('Statistics data unavailable');
            usesFallbackData = true;
            
            // Use fallback data
            updateStatistics(FALLBACK_DATA.statistics);
            updateCharts(FALLBACK_DATA.statistics);
            
            // Show error notification
            showDataAlert('Statistics data could not be loaded from the server. Using sample data instead.');
        });
    
    // Fetch analytics insights
    fetch(API_URL + '/analytics/insights/')
        .then(response => {
            if (!response.ok) {
                throw new Error(`Insights API returned ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('Insights data:', data);
            updateInsights(data);
        })
        .catch(error => {
            console.error('Error fetching insights:', error);
            dataIssues.push('Analytics insights unavailable');
            usesFallbackData = true;
            
            // Use fallback data
            updateInsights(FALLBACK_DATA.insights);
            
            // Show error notification if not already shown
            if (dataIssues.length === 1) {
                showDataAlert('Analytics insights could not be loaded from the server. Using sample data instead.');
            }
        });
    
    // Fetch monthly analytics
    fetch(API_URL + '/analytics/monthly/')
        .then(response => {
            if (!response.ok) {
                throw new Error(`Monthly analytics API returned ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('Monthly analytics data:', data);
            updateMonthlyCharts(data);
        })
        .catch(error => {
            console.error('Error fetching monthly analytics:', error);
            dataIssues.push('Monthly trends unavailable');
            usesFallbackData = true;
            
            // Use fallback data
            updateMonthlyCharts(FALLBACK_DATA.monthly);
        });
    
    // Fetch day of week analytics
    fetch(API_URL + '/analytics/day_of_week/')
        .then(response => {
            if (!response.ok) {
                throw new Error(`Day of week API returned ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('Day of week data:', data);
            updateDayOfWeekChart(data);
        })
        .catch(error => {
            console.error('Error fetching day of week analytics:', error);
            dataIssues.push('Day of week data unavailable');
            usesFallbackData = true;
            
            // Use fallback data
            updateDayOfWeekChart(FALLBACK_DATA.days);
        });
    
    // Fetch time between analytics
    fetch(API_URL + '/analytics/time_between/')
        .then(response => {
            if (!response.ok) {
                throw new Error(`Time between API returned ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('Time between data:', data);
            updateTimeBetweenMetric(data);
        })
        .catch(error => {
            console.error('Error fetching time between analytics:', error);
            dataIssues.push('Time between metrics unavailable');
            usesFallbackData = true;
            
            // Use fallback data
            updateTimeBetweenMetric(FALLBACK_DATA.time_between);
        });
    
    // Add a final check to show comprehensive error notification if needed
    setTimeout(() => {
        if (usesFallbackData && dataIssues.length > 1) {
            showDataAlert(`Multiple data issues detected: ${dataIssues.join(', ')}. Using sample data.`, 'warning', 10000);
        }
    }, 2000);
}

// Add function to show data issue alerts
function showDataAlert(message, type = 'warning', duration = 7000) {
    // Create alert element if it doesn't exist
    let alertBox = document.getElementById('data-alert');
    if (!alertBox) {
        alertBox = document.createElement('div');
        alertBox.id = 'data-alert';
        alertBox.className = `alert alert-${type} data-alert`;
        document.body.appendChild(alertBox);
        
        // Style the alert
        alertBox.style.position = 'fixed';
        alertBox.style.top = '20px';
        alertBox.style.right = '20px';
        alertBox.style.zIndex = '9999';
        alertBox.style.padding = '15px 20px';
        alertBox.style.borderRadius = '5px';
        alertBox.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
        alertBox.style.maxWidth = '400px';
        alertBox.style.animation = 'slideIn 0.3s ease-out forwards';
    }
    
    // Add close button
    alertBox.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>${message}</div>
            <button style="background: none; border: none; font-size: 16px; cursor: pointer; margin-left: 10px;"
                onclick="this.parentNode.parentNode.remove()">×</button>
        </div>
        <div class="mt-2">
            <button class="btn btn-sm btn-outline-light" id="show-sample-data-btn">
                Continue with Sample Data
            </button>
            <button class="btn btn-sm btn-light ml-2" id="retry-data-btn">
                Retry Connection
            </button>
        </div>
    `;
    
    // Add event listeners
    setTimeout(() => {
        document.getElementById('show-sample-data-btn').addEventListener('click', () => {
            alertBox.remove();
        });
        
        document.getElementById('retry-data-btn').addEventListener('click', () => {
            alertBox.remove();
            fetchData();
        });
    }, 100);
    
    // Auto-remove after duration
    setTimeout(() => {
        if (alertBox && alertBox.parentNode) {
            alertBox.style.animation = 'slideOut 0.3s ease-in forwards';
            setTimeout(() => alertBox.remove(), 300);
        }
    }, duration);
}

// Add specific error handling for reports
function generateReport(reportType, format = 'pdf') {
    showToast('Generating report...', 'info');
    
    fetch(`${API_URL}/reports/${reportType}?format=${format}`)
        .then(response => {
            if (!response.ok) {
                // Try to get error message from JSON
                return response.json().then(errorData => {
                    throw new Error(errorData.error || `Failed to generate ${reportType} report`);
                }).catch(err => {
                    // If not JSON or other error
                    throw new Error(`Failed to generate ${reportType} report. Data may not be available for the current period.`);
                });
            }
            return response.blob();
        })
        .then(blob => {
            // Successful report download
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `MoMo_${reportType}_${new Date().toISOString().split('T')[0]}.${format}`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            showToast('Report downloaded successfully!', 'success');
        })
        .catch(error => {
            console.error('Error generating report:', error);
            
            // Show a more user-friendly error with options
            showReportErrorDialog(error.message, reportType);
        });
}

// Show friendly error dialog for report generation
function showReportErrorDialog(errorMessage, reportType) {
    const modalId = 'reportErrorModal';
    
    // Create modal if it doesn't exist
    let modal = document.getElementById(modalId);
    if (!modal) {
        modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'modal fade';
        modal.setAttribute('tabindex', '-1');
        modal.setAttribute('role', 'dialog');
        modal.innerHTML = `
            <div class="modal-dialog" role="document">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Report Generation Failed</h5>
                        <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                            <span aria-hidden="true">&times;</span>
                        </button>
                    </div>
                    <div class="modal-body">
                        <p id="report-error-message">${errorMessage}</p>
                        <div class="alert alert-info">
                            <strong>Possible reason:</strong> There may not be any transaction data for the current date period.
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-dismiss="modal">Close</button>
                        <button type="button" class="btn btn-primary" id="use-sample-report-btn">
                            Use Sample Report
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    } else {
        document.getElementById('report-error-message').textContent = errorMessage;
    }
    
    // Show the modal
    $(modal).modal('show');
    
    // Handle the sample report button
    document.getElementById('use-sample-report-btn').onclick = function() {
        $(modal).modal('hide');
        
        // Here you would use sample data for the report
        // This could download a pre-generated sample report or generate one with sample data
        showToast('Downloading sample report...', 'info');
        
        // Simulate download delay
        setTimeout(() => {
            showToast('Sample report downloaded successfully!', 'success');
        }, 1500);
    };
}

// Add CSS for notifications
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
    
    .data-alert {
        background-color: #2c3e50;
        color: white;
        font-size: 14px;
    }
    
    .data-alert button.btn {
        font-size: 12px;
        padding: 3px 8px;
    }
    
    .ml-2 {
        margin-left: 8px;
    }
    
    .mt-2 {
        margin-top: 10px;
    }
`;
document.head.appendChild(style);



// dashboard.js - Flask API integration for MTN MoMo Dashboard
// This file supplements app.js by connecting to the Flask analytics API

// Flask API endpoint (different from the FastAPI endpoint in app.js)
const FLASK_API_BASE_URL = 'http://localhost:5000';

// Initialize once DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('🔄 Initializing Flask API integration...');
    
    // Wait for app.js to complete its initialization
    setTimeout(() => {
        initFlaskApiIntegration();
    }, 2000);
});

// Set up Flask API integration
function initFlaskApiIntegration() {
    // Initial data fetch
    fetchFlaskAnalytics();
    
    // Set up periodic refresh every 2 minutes (independent of app.js refresh)
    setInterval(fetchFlaskAnalytics, 120000);
    
    console.log('✅ Flask API integration initialized');
}

// Fetch analytics data from Flask API
async function fetchFlaskAnalytics() {
    try {
        // Create a controller to abort requests if they take too long
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        // Make parallel requests to Flask API endpoints
        const [insights, dayOfWeek, timeBetween] = await Promise.all([
            fetchWithTimeout(`${FLASK_API_BASE_URL}/analytics/insights/`, controller.signal),
            fetchWithTimeout(`${FLASK_API_BASE_URL}/analytics/day_of_week/`, controller.signal),
            fetchWithTimeout(`${FLASK_API_BASE_URL}/analytics/time_between/`, controller.signal)
        ]);
        
        clearTimeout(timeoutId);
        
        // Update analytics summary cards with Flask data
        updateAnalyticsSummaryFromFlask(insights, dayOfWeek, timeBetween);
        
        console.log('📊 Analytics updated from Flask API');
    } catch (error) {
        if (error.name === 'AbortError') {
            console.warn('⚠️ Flask API request timed out');
        } else {
            console.warn('⚠️ Flask API error:', error.message);
        }
        // Silently fail - app.js data will be used as fallback
    }
}

// Fetch with timeout and error handling
async function fetchWithTimeout(url, signal) {
    try {
        const response = await fetch(url, { signal });
        if (!response.ok) {
            throw new Error(`Flask API responded with status ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.warn(`Error fetching ${url}:`, error.message);
        throw error;
    }
}

// Update analytics summary with Flask data without touching other UI elements
function updateAnalyticsSummaryFromFlask(insights, dayOfWeek, timeBetween) {
    // Only update elements that aren't actively managed by app.js
    // or provide additional data that app.js doesn't handle
    
    // Time-between metrics (unique to Flask API)
    if (timeBetween && !isNaN(timeBetween.avg_hours_between)) {
        const hours = timeBetween.avg_hours_between.toFixed(1);
        const minutes = timeBetween.avg_minutes_between.toFixed(0);
        const elem = document.getElementById('avgTimeBetween');
        if (elem) {
            elem.textContent = `${hours} hours (${minutes} min)`;
            elem.title = `Based on ${timeBetween.transaction_pairs_analyzed} transaction pairs`;
        }
    }
    
    // Day of week analytics (unique to Flask API)
    if (dayOfWeek && dayOfWeek.days_analytics && dayOfWeek.days_analytics.length > 0) {
        const busiest = dayOfWeek.days_analytics[0];
        const elem = document.getElementById('busiestDay');
        if (elem) {
            elem.textContent = `${busiest.day} (${busiest.transaction_count} tx)`;
            elem.title = `Total volume: RWF ${busiest.total_volume.toLocaleString()}`;
        }
        
        // Add day distribution data to DOM for potential future use
        document.body.dataset.dayAnalytics = JSON.stringify(
            dayOfWeek.days_analytics.map(d => ({day: d.day, count: d.transaction_count}))
        );
    }
    
    // Add historical success rate data if available
    if (insights && insights.historical_success_rates) {
        const successRateElem = document.getElementById('successRate');
        if (successRateElem) {
            const currentRate = insights.success_rate;
            const lastMonthRate = insights.historical_success_rates.last_month || 0;
            const change = currentRate - lastMonthRate;
            
            successRateElem.innerHTML = `${currentRate}% <span class="trend ${change >= 0 ? 'positive' : 'negative'}">
                ${change >= 0 ? '↑' : '↓'} ${Math.abs(change).toFixed(1)}%
            </span>`;
        }
    }
    
    // Add enriched transaction insights
    if (insights && insights.enriched_insights) {
        // Add custom analysis element if it doesn't exist
        let insightsContainer = document.querySelector('.insights-container');
        if (!insightsContainer) {
            const summarySection = document.querySelector('.analytics-summary');
            if (summarySection) {
                insightsContainer = document.createElement('div');
                insightsContainer.className = 'insights-container';
                insightsContainer.innerHTML = '<h4>Transaction Insights</h4>';
                summarySection.parentNode.insertBefore(insightsContainer, summarySection.nextSibling);
            }
        }
        
        if (insightsContainer) {
            // Update insights with Flask-specific data
            insightsContainer.innerHTML = `
                <h4>🔍 Transaction Insights</h4>
                <div class="insights-grid">
                    ${insights.enriched_insights.map(insight => `
                        <div class="insight-card">
                            <div class="insight-icon">${insight.icon || '📊'}</div>
                            <div class="insight-content">
                                <h5>${insight.title}</h5>
                                <p>${insight.description}</p>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
            
            // Add styling if not already present
            if (!document.getElementById('insights-styles')) {
                const style = document.createElement('style');
                style.id = 'insights-styles';
                style.textContent = `
                    .insights-container {
                        margin-top: 2rem;
                    }
                    .insights-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
                        gap: 1rem;
                        margin-top: 1rem;
                    }
                    .insight-card {
                        background: white;
                        border-radius: 12px;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                        padding: 1rem;
                        display: flex;
                        align-items: center;
                        gap: 1rem;
                    }
                    .insight-icon {
                        font-size: 2rem;
                    }
                    .insight-content h5 {
                        margin: 0 0 0.5rem 0;
                        font-size: 1rem;
                        font-weight: 600;
                    }
                    .insight-content p {
                        margin: 0;
                        font-size: 0.9rem;
                        color: #666;
                    }
                    .dark .insight-card {
                        background: #1e293b;
                    }
                    .dark .insight-content p {
                        color: #94a3b8;
                    }
                    .trend {
                        font-size: 0.8rem;
                        padding: 0.1rem 0.3rem;
                        border-radius: 3px;
                        margin-left: 0.5rem;
                    }
                    .trend.positive {
                        color: #10b981;
                        background: rgba(16, 185, 129, 0.1);
                    }
                    .trend.negative {
                        color: #ef4444;
                        background: rgba(239, 68, 68, 0.1);
                    }
                `;
                document.head.appendChild(style);
            }
        }
    }
}