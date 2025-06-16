// reports.js - Handles report generation functionality for MTN MoMo Dashboard

// Report types
const REPORT_TYPES = {
    MONTHLY_SUMMARY: 'monthly_summary',
    FINANCIAL_STATEMENT: 'financial_statement',
    TRANSACTION_ANALYTICS: 'transaction_analytics',
    CUSTOM_REPORT: 'custom_report'
};

// API endpoint
const REPORTS_API_URL = 'http://localhost:5000/reports';

// Sample data object for fallback reports when real data is unavailable
const SAMPLE_REPORTS = {
    monthly_summary: '/samples/monthly_summary_sample.pdf',
    financial_statement: '/samples/financial_statement_sample.pdf',
    transaction_analytics: '/samples/transaction_analytics_sample.pdf',
    custom_report: '/samples/custom_report_sample.pdf'
};

// Initialize reports functionality
document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 Initializing reports functionality...');
    initReportButtons();
    initCustomReportConfig();
    
    // Add debug tools in development mode
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        addDebugTools();
    }
});

// Set up report button event listeners
function initReportButtons() {
    // Get all report buttons
    const reportButtons = document.querySelectorAll('.report-card .btn');
    
    // Add event listeners to each button
    reportButtons.forEach(button => {
        button.addEventListener('click', function() {
            const reportCard = this.closest('.report-card');
            const reportTitle = reportCard.querySelector('h4').innerText;
            
            // Determine report type based on title
            let reportType;
            if (reportTitle.includes('Monthly Summary')) {
                reportType = REPORT_TYPES.MONTHLY_SUMMARY;
                generateReport(reportType);
            } 
            else if (reportTitle.includes('Financial Statement')) {
                reportType = REPORT_TYPES.FINANCIAL_STATEMENT;
                generateReport(reportType);
            } 
            else if (reportTitle.includes('Transaction Analytics')) {
                reportType = REPORT_TYPES.TRANSACTION_ANALYTICS;
                generateReport(reportType);
            } 
            else if (reportTitle.includes('Custom Report')) {
                // For custom report, open the configuration modal
                openCustomReportModal();
            }
        });
    });
}

// Generate report based on type
async function generateReport(reportType, customParams = {}) {
    // Show loading toast
    const loadingToastId = showToast('Generating report...', 'info');
    
    // Set a timeout to detect stalled requests
    const timeoutId = setTimeout(() => {
        showToast('Report generation is taking longer than expected.', 'warning');
        showReportErrorModal(
            'The report generation request is taking too long.',
            reportType,
            'This could indicate a server issue or a problem with the report data.',
            true
        );
    }, 15000); // 15 second timeout
    
    try {
        // Build URL with parameters
        let url = `${REPORTS_API_URL}/${reportType}`;
        
        // Add format parameter (default to PDF)
        const format = customParams.format || 'pdf';
        url += `?format=${format}`;
        
        // Add cache-busting parameter
        url += `&t=${Date.now()}`;
        
        // Add any custom parameters
        for (const [key, value] of Object.entries(customParams)) {
            if (key !== 'format') { // Skip format as we've already added it
                url += `&${key}=${encodeURIComponent(value)}`;
            }
        }
        
        console.log(`Generating report: ${reportType} in ${format} format`);
        console.log(`Request URL: ${url}`);
        
        // Start the download
        const response = await fetch(url);
        
        // Clear timeout since we got a response
        clearTimeout(timeoutId);
        
        // Log response details for debugging
        console.log(`Response status: ${response.status}`);
        console.log(`Response type: ${response.type}`);
        console.log(`Content-Type: ${response.headers.get('Content-Type')}`);
        
        if (!response.ok) {
            // Try to get error as JSON first
            let errorMessage = `Server returned status ${response.status}`;
            try {
                const errorData = await response.json();
                errorMessage = errorData.error || errorMessage;
                console.error('Server error details:', errorData);
            } catch (parseError) {
                // If not JSON, use status text
                errorMessage = `Failed to generate report: ${response.statusText}`;
            }
            
            throw new Error(errorMessage);
        }
        
        // Check for empty response
        if (response.headers.get('Content-Length') === '0') {
            throw new Error('Server returned an empty response');
        }
        
        // Get the report data and content type
        const contentType = response.headers.get('Content-Type');
        const blob = await response.blob();
        
        // Verify we got data of appropriate size
        if (blob.size === 0) {
            throw new Error('Downloaded file is empty');
        }
        
        console.log(`Received file: ${blob.size} bytes, type: ${blob.type}`);
        
        // Get filename from Content-Disposition header or use default
        let filename = 'momo_report';
        const disposition = response.headers.get('Content-Disposition');
        if (disposition && disposition.includes('filename=')) {
            const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
            const matches = filenameRegex.exec(disposition);
            if (matches !== null && matches[1]) {
                filename = matches[1].replace(/['"]/g, '');
            }
        } else {
            // If no filename provided, create one based on report type and date
            const date = new Date().toISOString().split('T')[0];
            filename = `momo_${reportType}_${date}.${format}`;
        }
        
        // Create download link and trigger download
        const url2 = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url2;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        
        // Clean up
        window.URL.revokeObjectURL(url2);
        document.body.removeChild(a);
        
        showToast('Report downloaded successfully!', 'success');
    } catch (error) {
        // Clear timeout if there was an error
        clearTimeout(timeoutId);
        
        console.error('Error generating report:', error);
        showToast(`Failed to generate report: ${error.message}`, 'error');
        
        // Show error modal with options
        showReportErrorModal(error.message, reportType);
    }
}

// Open custom report configuration modal
function openCustomReportModal() {
    // Create modal if it doesn't exist
    let modal = document.getElementById('customReportModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'customReportModal';
        modal.className = 'modal';
        
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header">
                    <h3>Configure Custom Report</h3>
                    <button class="btn-close" onclick="closeCustomReportModal()">
                        <i class="ri-close-line"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="report-config-form">
                        <div class="filter-group">
                            <label>Report Title</label>
                            <input type="text" id="reportTitle" placeholder="My Custom Report">
                        </div>
                        
                        <div class="filter-group">
                            <label>Date Range</label>
                            <div style="display: flex; gap: 10px;">
                                <input type="date" id="reportStartDate" style="flex: 1;">
                                <span style="align-self: center;">to</span>
                                <input type="date" id="reportEndDate" style="flex: 1;">
                            </div>
                        </div>
                        
                        <div class="filter-group">
                            <label>Transaction Types</label>
                            <select id="reportTransactionType" multiple>
                                <option value="all" selected>All Types</option>
                                <option value="INCOMING_MONEY">Incoming Money</option>
                                <option value="PAYMENT">Payment</option>
                                <option value="TRANSFER">Transfer</option>
                                <option value="WITHDRAWAL">Withdrawal</option>
                                <option value="AIRTIME">Airtime</option>
                                <option value="BUNDLE">Bundle Purchase</option>
                                <option value="BANK_DEPOSIT">Bank Deposit</option>
                                <option value="CASH_POWER">Cash Power</option>
                            </select>
                            <small>Hold Ctrl/Cmd to select multiple</small>
                        </div>
                        
                        <div class="filter-group">
                            <label>Include Sections</label>
                            <div class="checkbox-group">
                                <label>
                                    <input type="checkbox" id="includeTransactions" checked>
                                    Transactions
                                </label>
                                <label>
                                    <input type="checkbox" id="includeCharts" checked>
                                    Charts & Visualizations
                                </label>
                                <label>
                                    <input type="checkbox" id="includeSummary" checked>
                                    Summary Statistics
                                </label>
                                <label>
                                    <input type="checkbox" id="includeAnalytics" checked>
                                    Analytics Insights
                                </label>
                            </div>
                        </div>
                        
                        <div class="filter-group">
                            <label>File Format</label>
                            <select id="reportFormat">
                                <option value="pdf">PDF Document</option>
                                <option value="xlsx">Excel Spreadsheet</option>
                                <option value="csv">CSV File</option>
                                <option value="json">JSON Data</option>
                            </select>
                        </div>
                        
                        <div class="filter-group">
                            <label>Data Period</label>
                            <select id="reportDataPeriod">
                                <option value="current">Current Month</option>
                                <option value="lastMonth" selected>Last Month</option>
                                <option value="lastQuarter">Last Quarter</option>
                                <option value="lastYear">Last Year</option>
                                <option value="allTime">All Available Data</option>
                            </select>
                            <small>Use this option if current date data is unavailable</small>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="closeCustomReportModal()">Cancel</button>
                    <button class="btn btn-primary" id="generateCustomReport">Generate Report</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Set default dates (last 30 days)
        const today = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(today.getDate() - 30);
        
        document.getElementById('reportEndDate').value = today.toISOString().split('T')[0];
        document.getElementById('reportStartDate').value = thirtyDaysAgo.toISOString().split('T')[0];
        
        // Add event listener for the generate button
        document.getElementById('generateCustomReport').addEventListener('click', generateCustomReport);
    }
    
    // Show the modal
    modal.classList.remove('hidden');
}

// Close custom report modal
function closeCustomReportModal() {
    const modal = document.getElementById('customReportModal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

// Initialize custom report configuration
function initCustomReportConfig() {
    // Expose the close function globally
    window.closeCustomReportModal = closeCustomReportModal;
}

// Generate custom report based on form inputs
function generateCustomReport() {
    // Get all form values
    const title = document.getElementById('reportTitle').value || 'Custom Report';
    const startDate = document.getElementById('reportStartDate').value;
    const endDate = document.getElementById('reportEndDate').value;
    const dataPeriod = document.getElementById('reportDataPeriod').value;
    
    // Get selected transaction types
    const typeSelect = document.getElementById('reportTransactionType');
    const selectedTypes = Array.from(typeSelect.selectedOptions)
        .map(option => option.value)
        .filter(value => value !== 'all');
    
    // Get include sections
    const includeTransactions = document.getElementById('includeTransactions').checked;
    const includeCharts = document.getElementById('includeCharts').checked;
    const includeSummary = document.getElementById('includeSummary').checked;
    const includeAnalytics = document.getElementById('includeAnalytics').checked;
    
    // Get format
    const format = document.getElementById('reportFormat').value;
    
    // Build parameters object
    const params = {
        title: title,
        format: format,
        startDate: startDate,
        endDate: endDate,
        includeTransactions: includeTransactions,
        includeCharts: includeCharts,
        includeSummary: includeSummary,
        includeAnalytics: includeAnalytics,
        dataPeriod: dataPeriod
    };
    
    // Add transaction types if any selected
    if (selectedTypes.length > 0) {
        params.types = selectedTypes.join(',');
    }
    
    // Close the modal
    closeCustomReportModal();
    
    // Generate the report
    generateReport(REPORT_TYPES.CUSTOM_REPORT, params);
}

// Helper function to show toast notifications
function showToast(message, type = 'info') {
    // Use existing toast system if available
    if (typeof createToast === 'function') {
        return createToast(message, type);
    }
    
    // Simple fallback toast implementation
    const toastContainer = document.getElementById('toastContainer') || createToastContainer();
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <div class="toast-content">
            <i class="ri-${type === 'success' ? 'check-line' : type === 'error' ? 'error-warning-line' : 'information-line'}"></i>
            <span>${message}</span>
        </div>
        <button class="toast-close">×</button>
    `;
    
    toastContainer.appendChild(toast);
    
    // Add close handler
    toast.querySelector('.toast-close').addEventListener('click', () => {
        toast.classList.add('toast-hiding');
        setTimeout(() => toast.remove(), 300);
    });
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (toastContainer.contains(toast)) {
            toast.classList.add('toast-hiding');
            setTimeout(() => toast.remove(), 300);
        }
    }, 5000);
    
    return toast.id;
}

// Create toast container if it doesn't exist
function createToastContainer() {
    const container = document.createElement('div');
    container.id = 'toastContainer';
    container.style.position = 'fixed';
    container.style.top = '20px';
    container.style.right = '20px';
    container.style.zIndex = '9999';
    document.body.appendChild(container);
    return container;
}

// Show error modal with options for report generation
function showReportErrorModal(errorMessage, reportType, additionalInfo = '', showDirectLinkOption = true) {
    const modalId = 'reportErrorModal';
    
    // Create modal if it doesn't exist
    let modal = document.getElementById(modalId);
    if (!modal) {
        modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'modal';
        
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 550px;">
                <div class="modal-header">
                    <h3>Report Generation Failed</h3>
                    <button class="btn-close" onclick="document.getElementById('${modalId}').classList.add('hidden')">
                        <i class="ri-close-line"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="error-message" style="color: #e74c3c; margin-bottom: 15px; font-weight: bold;"></div>
                    
                    <div class="additional-info" style="margin-bottom: 15px;"></div>
                    
                    <div class="alert alert-info">
                        <strong>Possible Reasons:</strong>
                        <ul>
                            <li>There may not be any transaction data for the current date period</li>
                            <li>The server might be experiencing issues</li>
                            <li>The report parameters might be invalid</li>
                        </ul>
                    </div>
                    
                    <div class="solution-options" style="margin-top: 20px;">
                        <p><strong>What would you like to do?</strong></p>
                        <div class="options-list"></div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="document.getElementById('${modalId}').classList.add('hidden')">
                        Close
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    }
    
    // Update content
    modal.querySelector('.error-message').textContent = errorMessage;
    modal.querySelector('.additional-info').textContent = additionalInfo;
    
    // Add options
    const optionsList = modal.querySelector('.options-list');
    optionsList.innerHTML = '';
    
    // Option 1: Try with different date range
    const datePeriodOption = document.createElement('div');
    datePeriodOption.className = 'option';
    datePeriodOption.innerHTML = `
        <button class="btn btn-outline-primary btn-sm mb-2">
            <i class="ri-calendar-line"></i> Try with a different date period
        </button>
        <p class="small">Your database might have data for a different time period than the current date.</p>
    `;
    datePeriodOption.querySelector('button').addEventListener('click', () => {
        modal.classList.add('hidden');
        showDateRangeSelectionModal(reportType);
    });
    optionsList.appendChild(datePeriodOption);
    
    // Option 2: Debug with JSON format
    const jsonDebugOption = document.createElement('div');
    jsonDebugOption.className = 'option';
    jsonDebugOption.innerHTML = `
        <button class="btn btn-outline-info btn-sm mb-2">
            <i class="ri-code-line"></i> Debug with JSON format
        </button>
        <p class="small">View the raw data in JSON format to identify issues.</p>
    `;
    jsonDebugOption.querySelector('button').addEventListener('click', () => {
        modal.classList.add('hidden');
        debugReportJSON(reportType);
    });
    optionsList.appendChild(jsonDebugOption);
    
    // Option 3: Direct link (if enabled)
    if (showDirectLinkOption) {
        const directLinkOption = document.createElement('div');
        directLinkOption.className = 'option';
        directLinkOption.innerHTML = `
            <button class="btn btn-outline-secondary btn-sm mb-2">
                <i class="ri-external-link-line"></i> Try direct link
            </button>
            <p class="small">Open the report directly in a new browser tab.</p>
        `;
        directLinkOption.querySelector('button').addEventListener('click', () => {
            modal.classList.add('hidden');
            const url = `${REPORTS_API_URL}/${reportType}?format=pdf&t=${Date.now()}`;
            window.open(url, '_blank');
        });
        optionsList.appendChild(directLinkOption);
    }
    
    // Option 4: Use sample report
    const sampleReportOption = document.createElement('div');
    sampleReportOption.className = 'option';
    sampleReportOption.innerHTML = `
        <button class="btn btn-primary btn-sm mb-2">
            <i class="ri-file-download-line"></i> Use sample report
        </button>
        <p class="small">Download a pre-generated sample report with example data.</p>
    `;
    sampleReportOption.querySelector('button').addEventListener('click', () => {
        modal.classList.add('hidden');
        useSampleReport(reportType);
    });
    optionsList.appendChild(sampleReportOption);
    
    // Show the modal
    modal.classList.remove('hidden');
}

// Show date range selection modal
function showDateRangeSelectionModal(reportType) {
    const modalId = 'dateRangeModal';
    
    // Create modal if it doesn't exist
    let modal = document.getElementById(modalId);
    if (!modal) {
        modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'modal';
        
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 450px;">
                <div class="modal-header">
                    <h3>Select Date Period</h3>
                    <button class="btn-close" onclick="document.getElementById('${modalId}').classList.add('hidden')">
                        <i class="ri-close-line"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <p>Select a time period that may have data in your database:</p>
                    
                    <div class="filter-group">
                        <label>Report Period</label>
                        <select id="alternateReportPeriod" class="form-control">
                            <option value="lastMonth">Last Month (May 2024)</option>
                            <option value="twoMonthsAgo">Two Months Ago (April 2024)</option>
                            <option value="threeMonthsAgo">Three Months Ago (March 2024)</option>
                            <option value="lastQuarter">Last Quarter (Q1 2024)</option>
                            <option value="lastYear">Last Year (2023)</option>
                        </select>
                    </div>
                    
                    <div class="mt-3">
                        <label>Or specify custom dates:</label>
                        <div style="display: flex; gap: 10px; margin-top: 5px;">
                            <input type="date" id="altStartDate" class="form-control" style="flex: 1;">
                            <span style="align-self: center;">to</span>
                            <input type="date" id="altEndDate" class="form-control" style="flex: 1;">
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="document.getElementById('${modalId}').classList.add('hidden')">
                        Cancel
                    </button>
                    <button class="btn btn-primary" id="generateAltDateReport">
                        Generate Report
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Set default dates
        const lastMonth = new Date();
        lastMonth.setMonth(lastMonth.getMonth() - 1);
        lastMonth.setDate(1);
        const lastMonthEnd = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0);
        
        document.getElementById('altStartDate').value = lastMonth.toISOString().split('T')[0];
        document.getElementById('altEndDate').value = lastMonthEnd.toISOString().split('T')[0];
        
        // Add event listener
        document.getElementById('generateAltDateReport').addEventListener('click', () => {
            const periodOption = document.getElementById('alternateReportPeriod').value;
            const customStartDate = document.getElementById('altStartDate').value;
            const customEndDate = document.getElementById('altEndDate').value;
            
            modal.classList.add('hidden');
            
            // Generate with alternate dates
            generateReport(reportType, {
                alternateTimePeriod: periodOption,
                startDate: customStartDate,
                endDate: customEndDate,
                useHistoricalData: true
            });
        });
    }
    
    // Show the modal
    modal.classList.remove('hidden');
}

// Debug report by fetching JSON format
function debugReportJSON(reportType) {
    showToast('Fetching report data as JSON...', 'info');
    
    fetch(`${REPORTS_API_URL}/${reportType}?format=json&t=${Date.now()}`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Server returned ${response.status}: ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            console.log(`${reportType} report data:`, data);
            showJsonDebugModal(data, reportType);
            showToast('Report data retrieved. Check the debug panel.', 'success');
        })
        .catch(error => {
            console.error('JSON debug error:', error);
            showToast(`Error retrieving JSON data: ${error.message}`, 'error');
        });
}

// Show JSON debug modal
function showJsonDebugModal(data, reportType) {
    const modalId = 'jsonDebugModal';
    
    // Create modal if it doesn't exist
    let modal = document.getElementById(modalId);
    if (!modal) {
        modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'modal';
        
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 800px; max-height: 80vh;">
                <div class="modal-header">
                    <h3>Report Data Debug (${reportType})</h3>
                    <button class="btn-close" onclick="document.getElementById('${modalId}').classList.add('hidden')">
                        <i class="ri-close-line"></i>
                    </button>
                </div>
                <div class="modal-body" style="overflow: auto; max-height: calc(80vh - 130px);">
                    <div class="debug-info"></div>
                    <pre class="json-data" style="background: #f8f9fa; padding: 15px; border-radius: 4px; overflow: auto;"></pre>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="document.getElementById('${modalId}').classList.add('hidden')">
                        Close
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    }
    
    // Determine if we got an error or actual data
    const debugInfo = modal.querySelector('.debug-info');
    if (data.error) {
        debugInfo.innerHTML = `
            <div class="alert alert-danger">
                <strong>Error:</strong> ${data.error}
            </div>
        `;
    } else {
        // Get some basic stats
        let dataPoints = 0;
        let hasTransactions = false;
        
        if (data.monthly_analytics) {
            dataPoints += data.monthly_analytics.length;
        }
        if (data.transactions) {
            hasTransactions = data.transactions.length > 0;
            dataPoints += data.transactions.length;
        }
        
        debugInfo.innerHTML = `
            <div class="alert alert-info mb-3">
                <strong>Data summary:</strong><br>
                - Report type: ${reportType}<br>
                - Data points: ${dataPoints}<br>
                - Has transactions: ${hasTransactions ? 'Yes' : 'No'}<br>
                - Date range: ${data.date_range || 'Unknown'}<br>
            </div>
        `;
    }
    
    // Format and display the JSON
    const jsonDisplay = modal.querySelector('.json-data');
    jsonDisplay.textContent = JSON.stringify(data, null, 2);
    
    // Show the modal
    modal.classList.remove('hidden');
}

// Use a sample report when real data fails
function useSampleReport(reportType) {
    const samplePath = SAMPLE_REPORTS[reportType];
    
    if (!samplePath) {
        showToast('Sample report not available for this report type', 'error');
        return;
    }
    
    showToast('Downloading sample report...', 'info');
    
    // In a real implementation, you would have pre-generated sample reports
    // For now, simulate a download delay
    setTimeout(() => {
        showToast('Sample report downloaded successfully!', 'success');
        
        // You would normally fetch the actual sample file
        // This is just a simulation
        const a = document.createElement('a');
        a.href = samplePath;
        a.download = `Sample_${reportType}_report.pdf`;
        a.click();
    }, 1500);
}

// Add debug tools to the page
function addDebugTools() {
    const debugDiv = document.createElement('div');
    debugDiv.className = 'debug-tools';
    debugDiv.style = 'position: fixed; bottom: 20px; right: 20px; z-index: 9999;';
    
    debugDiv.innerHTML = `
        <button id="toggleDebug" class="btn btn-sm btn-outline-secondary">
            <i class="ri-bug-line"></i>
        </button>
        <div id="debugPanel" style="display:none; background: #fff; border: 1px solid #ddd; padding: 10px; border-radius: 4px; margin-bottom: 10px; width: 200px;">
            <h5>Debug Tools</h5>
            <button class="btn btn-sm btn-outline-primary mb-2 w-100" id="debugMonthly">
                Debug Monthly Report
            </button>
            <button class="btn btn-sm btn-outline-primary mb-2 w-100" id="debugFinancial">
                Debug Financial Report
            </button>
            <button class="btn btn-sm btn-outline-primary mb-2 w-100" id="debugAnalytics">
                Debug Analytics Report
            </button>
            <button class="btn btn-sm btn-outline-primary mb-2 w-100" id="testJsonEndpoint">
                Check API Connectivity
            </button>
            <button class="btn btn-sm btn-outline-primary mb-2 w-100" id="clearConsole">
                Clear Console
            </button>
            <div class="form-check">
                <input class="form-check-input" type="checkbox" id="enableVerboseLogging">
                <label class="form-check-label" for="enableVerboseLogging">
                    Verbose logging
                </label>
            </div>
        </div>
    `;
    
    document.body.appendChild(debugDiv);
    
    // Toggle debug panel
    document.getElementById('toggleDebug').addEventListener('click', () => {
        const panel = document.getElementById('debugPanel');
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });
    
    // Debug buttons
    document.getElementById('debugMonthly').addEventListener('click', () => {
        debugReportJSON(REPORT_TYPES.MONTHLY_SUMMARY);
    });
    
    document.getElementById('debugFinancial').addEventListener('click', () => {
        debugReportJSON(REPORT_TYPES.FINANCIAL_STATEMENT);
    });
    
    document.getElementById('debugAnalytics').addEventListener('click', () => {
        debugReportJSON(REPORT_TYPES.TRANSACTION_ANALYTICS);
    });
    
    document.getElementById('testJsonEndpoint').addEventListener('click', () => {
        showToast('Testing API connectivity...', 'info');
        fetch(`${REPORTS_API_URL.replace('/reports', '')}`)
            .then(response => response.json())
            .then(data => {
                console.log('API root response:', data);
                showToast('API connection successful!', 'success');
            })
            .catch(error => {
                console.error('API connection error:', error);
                showToast(`API connection failed: ${error.message}`, 'error');
            });
    });
    
    document.getElementById('clearConsole').addEventListener('click', () => {
        console.clear();
        showToast('Console cleared', 'info');
    });
}

// Export functions for global access
window.generateReport = generateReport;
window.debugReportJSON = debugReportJSON;
window.showReportErrorModal = showReportErrorModal;
window.closeCustomReportModal = closeCustomReportModal;