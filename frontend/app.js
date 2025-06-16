/**
 * MTN MoMo Dashboard Application
 * Complete frontend implementation for SMS transaction analysis
 */

// API Configuration
const API_BASE_URL = 'http://localhost:8000';

// Transaction type constants with UI configurations
const TRANSACTION_TYPES = {
    INCOMING_MONEY: { 
        label: 'Incoming Money', 
        color: '#22c55e',
        icon: 'ri-arrow-down-line'
    },
    PAYMENT: { 
        label: 'Payment', 
        color: '#3b82f6',
        icon: 'ri-bank-card-line'
    },
    TRANSFER: { 
        label: 'Transfer', 
        color: '#8b5cf6',
        icon: 'ri-exchange-line'
    },
    WITHDRAWAL: { 
        label: 'Withdrawal', 
        color: '#ef4444',
        icon: 'ri-arrow-up-line'
    },
    AIRTIME: { 
        label: 'Airtime', 
        color: '#f59e0b',
        icon: 'ri-phone-line'
    },
    BUNDLE: { 
        label: 'Bundle Purchase', 
        color: '#ec4899',
        icon: 'ri-wifi-line'
    },
    BANK_DEPOSIT: { 
        label: 'Bank Deposit', 
        color: '#10b981',
        icon: 'ri-bank-line'
    },
    CASH_POWER: { 
        label: 'Cash Power', 
        color: '#f97316',
        icon: 'ri-flashlight-line'
    },
    THIRD_PARTY: { 
        label: 'Third Party', 
        color: '#6366f1',
        icon: 'ri-group-line'
    }
};

// Transaction status constants
const TRANSACTION_STATUS = {
    COMPLETED: { 
        label: 'Completed', 
        color: '#10b981',
        icon: 'ri-checkbox-circle-line'
    },
    PENDING: { 
        label: 'Pending', 
        color: '#f59e0b',
        icon: 'ri-time-line'
    },
    FAILED: { 
        label: 'Failed', 
        color: '#ef4444',
        icon: 'ri-close-circle-line'
    }
};

// DOM elements cache
let elements = {};

// Application state management
const appState = {
    transactions: [],
    filteredTransactions: [],
    currentSection: 'dashboard',
    darkMode: document.documentElement.classList.contains('dark'),
    autoRefresh: {
        enabled: true,
        interval: 30000,
        timerId: null,
        lastRefresh: null,
        isPaused: false
    },
    filters: {
        search: '',
        type: '',
        status: '',
        startDate: '',
        endDate: '',
        minAmount: '',
        maxAmount: ''
    },
    pagination: {
        currentPage: 1,
        itemsPerPage: 15,
        totalItems: 0
    },
    charts: {},
    
    // Updates transactions in state
    setTransactions(transactions) {
        this.transactions = transactions;
        this.filteredTransactions = [...transactions];
        this.pagination.totalItems = transactions.length;
        this.autoRefresh.lastRefresh = new Date();
        console.log(`✅ Loaded ${transactions.length} transactions`);
    },
    
    // Applies all active filters to transactions
    applyFilters() {
        this.filteredTransactions = this.transactions.filter(transaction => {
            const matchesSearch = !this.filters.search || 
                transaction.description.toLowerCase().includes(this.filters.search.toLowerCase()) ||
                transaction.transactionId.toLowerCase().includes(this.filters.search.toLowerCase());
            
            const matchesType = !this.filters.type || transaction.type === this.filters.type;
            
            const matchesStatus = !this.filters.status || transaction.status === this.filters.status;
            
            const matchesDateRange = (!this.filters.startDate || transaction.date >= this.filters.startDate) &&
                                   (!this.filters.endDate || transaction.date <= this.filters.endDate);
            
            const matchesAmountRange = (!this.filters.minAmount || transaction.amount >= parseFloat(this.filters.minAmount)) &&
                                     (!this.filters.maxAmount || transaction.amount <= parseFloat(this.filters.maxAmount));
            
            return matchesSearch && matchesType && matchesStatus && matchesDateRange && matchesAmountRange;
        });
        
        this.pagination.totalItems = this.filteredTransactions.length;
        this.pagination.currentPage = 1;
        console.log(`🔍 Filtered to ${this.filteredTransactions.length} transactions`);
    }
};

// Initialize DOM elements when page loads
function initializeElements() {
    elements = {
        navLinks: document.querySelectorAll('.nav-link'),
        headerTitle: document.querySelector('.header h2'),
        totalBalance: document.getElementById('totalBalance'),
        totalTransactions: document.getElementById('totalTransactions'),
        moneyIn: document.getElementById('moneyIn'),
        moneyOut: document.getElementById('moneyOut'),
        globalSearch: document.querySelector('.search-bar input'),
        typeFilter: document.getElementById('typeFilter'),
        statusFilter: document.getElementById('statusFilter'),
        startDate: document.getElementById('startDate'),
        endDate: document.getElementById('endDate'),
        minAmount: document.getElementById('minAmount'),
        maxAmount: document.getElementById('maxAmount'),
        applyFilters: document.getElementById('applyFilters'),
        resetFilters: document.getElementById('resetFilters'),
        recentTransactionsTable: document.getElementById('recentTransactionsTable'),
        allTransactionsTable: document.getElementById('allTransactionsTable'),
        transactionsChart: document.getElementById('transactionsChart'),
        transactionTypesChart: document.getElementById('transactionTypesChart'),
        analyticsTransactionsChart: document.getElementById('analyticsTransactionsChart'),
        analyticsTypesChart: document.getElementById('analyticsTypesChart'),
        monthlyTrendsChart: document.getElementById('monthlyTrendsChart'),
        hourlyDistributionChart: document.getElementById('hourlyDistributionChart'),
        refreshBtn: document.querySelector('.btn-refresh'),
        exportBtns: document.querySelectorAll('#exportBtn, .btn[onclick*="export"]'),
        exportChartBtns: document.querySelectorAll('.export-chart-btn'),
        transactionModal: document.getElementById('transactionModal'),
        darkModeToggle: document.getElementById('darkModeToggle'),
        loadingOverlay: document.getElementById('loadingOverlay'),
        autoRefreshStatus: document.getElementById('autoRefreshStatus'),
        lastUpdateTime: document.getElementById('lastUpdateTime'),
        transactionDetails: document.getElementById('transactionDetails')
    };
    
    console.log('🎯 DOM elements initialized:', Object.keys(elements).length);
}

// Utility functions
const utils = {
    formatCurrency(amount) {
        const formatted = new Intl.NumberFormat('en-US', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(amount);
        return `RWF ${formatted}`;
    },
    
    formatDate(date) {
        if (!date) return 'N/A';
        return new Date(date).toLocaleDateString('en-GB', {
            year: 'numeric',
            month: 'short',
            day: '2-digit'
        });
    },
    
    formatDateTime(date) {
        if (!date) return 'N/A';
        return new Date(date).toLocaleString('en-GB', {
            year: 'numeric',
            month: 'short',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    },
    
    formatTime(date) {
        if (!date) return 'Never';
        return new Date(date).toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    },
    
    getStatusBadge(status) {
        const statusInfo = {
            completed: TRANSACTION_STATUS.COMPLETED,
            pending: TRANSACTION_STATUS.PENDING,
            failed: TRANSACTION_STATUS.FAILED
        }[status.toLowerCase()] || { color: '#6b7280', label: status, icon: 'ri-question-line' };
        
        return `<span class="status-badge" style="background-color: ${statusInfo.color}20; color: ${statusInfo.color}">
            <i class="${statusInfo.icon}"></i> ${statusInfo.label}
        </span>`;
    },
    
    showLoading(show = true) {
        if (elements.loadingOverlay) {
            elements.loadingOverlay.classList.toggle('hidden', !show);
        }
        if (elements.refreshBtn) {
            elements.refreshBtn.classList.toggle('spin', show);
        }
    },
    
    showToast(message, type = 'success') {
        document.querySelectorAll('.toast').forEach(toast => toast.remove());
        
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <i class="ri-${type === 'success' ? 'check' : type === 'error' ? 'close' : 'information'}-line"></i>
            <span>${message}</span>
        `;
        
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    },
    
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
};

// Auto-refresh management
const autoRefreshManager = {
    init() {
        console.log('🔄 Initializing auto-refresh system...');
        this.startAutoRefresh();
        this.updateStatus();
        setInterval(() => this.updateStatus(), 1000);
    },
    
    startAutoRefresh() {
        if (appState.autoRefresh.timerId) {
            clearInterval(appState.autoRefresh.timerId);
        }
        
        if (appState.autoRefresh.enabled && !appState.autoRefresh.isPaused) {
            appState.autoRefresh.timerId = setInterval(async () => {
                console.log('🔄 Auto-refreshing data...');
                await dataManager.loadTransactions(true);
            }, appState.autoRefresh.interval);
        }
    },
    
    stopAutoRefresh() {
        if (appState.autoRefresh.timerId) {
            clearInterval(appState.autoRefresh.timerId);
            appState.autoRefresh.timerId = null;
        }
    },
    
    pauseAutoRefresh() {
        appState.autoRefresh.isPaused = true;
        this.stopAutoRefresh();
        this.updateStatus();
    },
    
    resumeAutoRefresh() {
        appState.autoRefresh.isPaused = false;
        this.startAutoRefresh();
        this.updateStatus();
    },
    
    toggleAutoRefresh() {
        if (appState.autoRefresh.isPaused) {
            this.resumeAutoRefresh();
        } else {
            this.pauseAutoRefresh();
        }
    },
    
    updateStatus() {
        if (elements.autoRefreshStatus) {
            const status = appState.autoRefresh.isPaused ? 
                '⏸️ Paused' : 
                `🔄 Auto-refresh (${appState.autoRefresh.interval / 1000}s)`;
            elements.autoRefreshStatus.textContent = status;
        }
        
        if (elements.lastUpdateTime && appState.autoRefresh.lastRefresh) {
            const timeAgo = this.getTimeAgo(appState.autoRefresh.lastRefresh);
            elements.lastUpdateTime.textContent = `Last updated: ${timeAgo}`;
        }
    },
    
    getTimeAgo(date) {
        const now = new Date();
        const diff = Math.floor((now - date) / 1000);
        
        if (diff < 60) return `${diff}s ago`;
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        return `${Math.floor(diff / 86400)}d ago`;
    },
    
    pauseOnActivity() {
        if (!appState.autoRefresh.isPaused) {
            this.pauseAutoRefresh();
            setTimeout(() => {
                if (appState.autoRefresh.isPaused) {
                    this.resumeAutoRefresh();
                }
            }, 60000);
        }
    }
};

// Data processing utilities
const dataProcessor = {
    calculateStats(transactions) {
        return transactions.reduce((stats, transaction) => {
            const amount = transaction.amount || 0;
            
            if (['INCOMING_MONEY', 'BANK_DEPOSIT'].includes(transaction.type)) {
                stats.moneyIn += amount;
                stats.balance += amount;
            } else {
                stats.moneyOut += amount;
                stats.balance -= amount;
            }
            
            stats.totalTransactions++;
            return stats;
        }, {
            balance: 0,
            moneyIn: 0,
            moneyOut: 0,
            totalTransactions: 0
        });
    },
    
    getTransactionsByType(transactions) {
        const typeStats = {};
        transactions.forEach(transaction => {
            const type = transaction.type;
            if (!typeStats[type]) {
                typeStats[type] = {
                    count: 0,
                    amount: 0,
                    label: TRANSACTION_TYPES[type]?.label || type,
                    color: TRANSACTION_TYPES[type]?.color || '#6b7280'
                };
            }
            typeStats[type].count++;
            typeStats[type].amount += (transaction.amount || 0);
        });
        return typeStats;
    },
    
    getMonthlyData(transactions) {
        const monthlyData = {};
        transactions.forEach(transaction => {
            const month = new Date(transaction.date).toISOString().slice(0, 7);
            if (!monthlyData[month]) {
                monthlyData[month] = { income: 0, expenses: 0, count: 0 };
            }
            
            if (['INCOMING_MONEY', 'BANK_DEPOSIT'].includes(transaction.type)) {
                monthlyData[month].income += (transaction.amount || 0);
            } else {
                monthlyData[month].expenses += (transaction.amount || 0);
            }
            monthlyData[month].count++;
        });
        return monthlyData;
    },
    
    getHourlyDistribution(transactions) {
        const hourlyData = Array(24).fill(0);
        transactions.forEach(transaction => {
            const hour = new Date(transaction.date).getHours();
            hourlyData[hour]++;
        });
        return hourlyData;
    },
    
    getDailyPatterns(transactions) {
        const dayData = Array(7).fill(0);
        transactions.forEach(transaction => {
            const day = new Date(transaction.date).getDay();
            dayData[day]++;
        });
        return dayData;
    },
    
    generateMockTransactions(count = 100000) { 
        console.log('🎭 Generating mock data...');
        const mockTransactions = [];
        const types = Object.keys(TRANSACTION_TYPES);
        const descriptions = {
            INCOMING_MONEY: ['Payment received from John Doe', 'Salary payment', 'Refund received', 'Money from Alice', 'Commission payment', 'Bonus received', 'Freelance payment', 'Gift received'],
            PAYMENT: ['Electricity bill payment', 'Water bill payment', 'Internet payment', 'School fees', 'Medical bills', 'Shopping payment', 'Restaurant bill', 'Transport fare'],
            TRANSFER: ['Transfer to Jane Smith', 'Money sent to family', 'Transfer to savings', 'Payment to friend', 'Emergency transfer', 'Monthly allowance', 'Loan repayment', 'Investment transfer'],
            WITHDRAWAL: ['ATM withdrawal', 'Agent withdrawal', 'Cash withdrawal', 'Bank withdrawal', 'Emergency cash', 'Daily expenses', 'Travel money', 'Pocket money'],
            AIRTIME: ['Airtime purchase', 'Mobile top-up', 'Phone credit', 'Call credit', 'SMS bundle', 'Voice bundle', 'Emergency airtime', 'Monthly airtime'],
            BUNDLE: ['Internet bundle', 'Data package', 'Monthly bundle', 'Weekly data', 'Social media bundle', 'Streaming bundle', 'Work data', 'Student package'],
            BANK_DEPOSIT: ['Bank deposit', 'Account funding', 'Direct deposit', 'Salary deposit', 'Investment deposit', 'Savings deposit', 'Business deposit', 'Loan deposit'],
            CASH_POWER: ['Electricity tokens', 'Power purchase', 'Utility payment', 'Energy tokens', 'Prepaid electricity', 'Power top-up', 'Monthly electricity', 'Emergency power'],
            THIRD_PARTY: ['Third party payment', 'Service payment', 'External transfer', 'Merchant payment', 'Online purchase', 'Service fee', 'Platform payment', 'Subscription fee']
        };
        
        const senders = ['John Doe', 'Jane Smith', 'MTN Rwanda', 'Kigali Water', 'REG', 'KCB Bank', 'Alice', 'Bob', 'MTN Mobile', 'Umurenge SACCO'];
        const receivers = ['John Doe', 'Jane Smith', 'MTN Rwanda', 'Kigali Water', 'REG', 'KCB Bank', 'Alice', 'Bob', 'MTN Mobile', 'Umurenge SACCO'];
        
        for (let i = 0; i < count; i++) {
            const type = types[Math.floor(Math.random() * types.length)];
            const amount = Math.floor(Math.random() * 500000) + 500;
            const date = new Date();
            date.setDate(date.getDate() - Math.floor(Math.random() * 365));
            
            mockTransactions.push({
                id: i + 1,
                transactionId: `TX${String(i + 1).padStart(8, '0')}`,
                date: date.toISOString().split('T')[0],
                type: type,
                amount: amount,
                description: descriptions[type][Math.floor(Math.random() * descriptions[type].length)],
                status: Math.random() > 0.05 ? 'completed' : Math.random() > 0.8 ? 'pending' : 'failed',
                fee: ['TRANSFER', 'WITHDRAWAL'].includes(type) ? Math.floor(amount * 0.005) : 0,
                sender: ['INCOMING_MONEY', 'BANK_DEPOSIT'].includes(type) ? 
                    senders[Math.floor(Math.random() * senders.length)] : 'You',
                receiver: ['INCOMING_MONEY', 'BANK_DEPOSIT'].includes(type) ? 
                    'You' : receivers[Math.floor(Math.random() * receivers.length)]
            });
        }
        
        return mockTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));
    }
};

// Data management and API interaction
const dataManager = {
    async loadTransactions(silent = false) {
        console.log('🔄 Loading transactions...');
        
        if (!silent) utils.showLoading(true);
        
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            
            const response = await fetch(`${API_BASE_URL}/transactions/?limit=100000`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                },
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) throw new Error(`API responded with status: ${response.status}`);
            
            const apiTransactions = await response.json();
            console.log('📡 API Response received:', apiTransactions?.length || 0, 'transactions');
            
            if (!Array.isArray(apiTransactions) || apiTransactions.length === 0) {
                throw new Error('API returned empty or invalid data');
            }
            
            const transactions = apiTransactions.map((tx, index) => ({
                id: index + 1,
                transactionId: tx.transaction_id || `TX${index + 1}`,
                date: tx.date || new Date().toISOString().split('T')[0],
                type: this.mapApiTypeToFrontendType(tx.type),
                amount: parseFloat(tx.amount) || 0,
                description: tx.raw_body || tx.description || 'No description',
                status: tx.status || 'completed',
                fee: parseFloat(tx.fee) || 0,
                sender: tx.sender || 'Unknown',
                receiver: tx.receiver || 'Unknown'
            }));
            
            appState.setTransactions(transactions);
            this.updateAllViews();
            
            if (!silent) {
                utils.showToast(`✅ Loaded ${transactions.length} transactions from API`, 'success');
            }
            
        } catch (error) {
            console.warn('⚠️ API Error:', error.message);
            console.log('🎭 Loading mock data for demonstration...');
            const transactions = dataProcessor.generateMockTransactions();
            appState.setTransactions(transactions);
            this.updateAllViews();
            
            if (!silent) {
                utils.showToast(`🎭 Demo mode: Generated ${transactions.length} sample transactions`, 'warning');
            }
        } finally {
            if (!silent) utils.showLoading(false);
        }
    },
    
    mapApiTypeToFrontendType(apiType) {
        if (!apiType) return 'PAYMENT';
        
        const typeMapping = {
            'Incoming Money': 'INCOMING_MONEY',
            'incoming money': 'INCOMING_MONEY',
            'Payment': 'PAYMENT',
            'payment': 'PAYMENT',
            'Withdrawal': 'WITHDRAWAL',
            'withdrawal': 'WITHDRAWAL',
            'Internet Bundle Purchase': 'BUNDLE',
            'internet bundle': 'BUNDLE',
            'Agent Withdrawal': 'WITHDRAWAL',
            'agent withdrawal': 'WITHDRAWAL',
            'Bank Deposit': 'BANK_DEPOSIT',
            'bank deposit': 'BANK_DEPOSIT',
            'Cash Power': 'CASH_POWER',
            'cash power': 'CASH_POWER',
            'Third Party': 'THIRD_PARTY',
            'third party': 'THIRD_PARTY',
            'Airtime': 'AIRTIME',
            'airtime': 'AIRTIME',
            'Transfer': 'TRANSFER',
            'transfer': 'TRANSFER'
        };
        return typeMapping[apiType] || 'PAYMENT';
    },
    
    updateAllViews() {
        console.log('🔄 Updating all views...');
        uiManager.updateDashboard();
        uiManager.updateRecentTransactionsTable();
        
        if (appState.currentSection === 'analytics') {
            setTimeout(() => {
                chartManager.initializeCharts();
                chartManager.updateAllCharts();
                uiManager.updateAnalyticsSummary();
            }, 100);
        }
        
        setTimeout(() => {
            chartManager.initializeCharts();
            chartManager.updateAllCharts();
        }, 100);
    },
    
    async refreshData() {
        utils.showToast('🔄 Refreshing data...', 'info');
        await this.loadTransactions();
    },
    
    exportData(format = 'csv') {
        const data = appState.filteredTransactions;
        
        if (data.length === 0) {
            utils.showToast('❌ No data to export', 'error');
            return;
        }
        
        if (format === 'csv') {
            const csv = [
                ['Date', 'Transaction ID', 'Type', 'Amount', 'Description', 'Status', 'Sender', 'Receiver'],
                ...data.map(tx => [
                    utils.formatDate(tx.date),
                    tx.transactionId,
                    TRANSACTION_TYPES[tx.type]?.label || tx.type,
                    tx.amount,
                    `"${tx.description}"`,
                    tx.status,
                    tx.sender,
                    tx.receiver
                ])
            ].map(row => row.join(',')).join('\n');
            
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `momo-transactions-${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            utils.showToast(`📁 Exported ${data.length} transactions`, 'success');
        }
    },
    
    exportChartImage(chartId) {
        if (!appState.charts[chartId]) {
            utils.showToast('Chart not available for export', 'error');
            return;
        }
        
        try {
            const dataURL = appState.charts[chartId].getDataURL({
                type: 'png',
                pixelRatio: 2,
                backgroundColor: appState.darkMode ? '#1e293b' : '#fff'
            });
            
            const a = document.createElement('a');
            a.href = dataURL;
            a.download = `momo-chart-${chartId}-${new Date().toISOString().split('T')[0]}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            utils.showToast(`📊 Chart exported successfully`, 'success');
        } catch (error) {
            console.error('Chart export error:', error);
            utils.showToast('Failed to export chart', 'error');
        }
    }
};

// UI management
const uiManager = {
    updateDashboard() {
        console.log('📊 Updating dashboard stats...');
        const stats = dataProcessor.calculateStats(appState.transactions);
        
        if (elements.totalBalance) {
            elements.totalBalance.textContent = utils.formatCurrency(stats.balance);
        }
        if (elements.totalTransactions) {
            elements.totalTransactions.textContent = stats.totalTransactions.toLocaleString();
        }
        if (elements.moneyIn) {
            elements.moneyIn.textContent = utils.formatCurrency(stats.moneyIn);
        }
        if (elements.moneyOut) {
            elements.moneyOut.textContent = utils.formatCurrency(stats.moneyOut);
        }
    },
    
    updateRecentTransactionsTable() {
        if (!elements.recentTransactionsTable) {
            console.warn('⚠️ Recent transactions table not found');
            return;
        }
        
        console.log('📋 Updating recent transactions table...');
        const recentTransactions = appState.transactions.slice(0, 5);
        
        if (recentTransactions.length === 0) {
            elements.recentTransactionsTable.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: center; padding: 2rem; color: var(--gray-500);">
                        No transactions found
                    </td>
                </tr>
            `;
            return;
        }
        
        elements.recentTransactionsTable.innerHTML = recentTransactions
            .map(tx => `
                <tr onclick="showTransactionDetails(${tx.id})" class="cursor-pointer">
                    <td>${utils.formatDate(tx.date)}</td>
                    <td>
                        <span class="transaction-type" style="background-color: ${TRANSACTION_TYPES[tx.type]?.color || '#6b7280'}20; color: ${TRANSACTION_TYPES[tx.type]?.color || '#6b7280'}">
                            ${TRANSACTION_TYPES[tx.type]?.label || tx.type}
                        </span>
                    </td>
                    <td class="amount ${['INCOMING_MONEY', 'BANK_DEPOSIT'].includes(tx.type) ? 'positive' : 'negative'}">
                        ${utils.formatCurrency(tx.amount)}
                    </td>
                    <td>${tx.description}</td>
                    <td>
                        ${utils.getStatusBadge(tx.status)}
                    </td>
                </tr>
            `)
            .join('');
    },

    switchSection(sectionName) {
        console.log(`🔄 Switching to section: ${sectionName}`);
        
        // Hide all sections
        document.querySelectorAll('.section').forEach(section => {
            section.classList.remove('active');
        });
        
        // Show target section
        const targetSection = document.getElementById(`${sectionName}-section`);
        if (targetSection) {
            targetSection.classList.add('active');
        }
        
        // Update navigation
        elements.navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.dataset.section === sectionName) {
                link.classList.add('active');
            }
        });
        
        // Update header title
        const titles = {
            dashboard: 'Dashboard',
            transactions: 'All Transactions',
            analytics: 'Analytics',
            reports: 'Reports'
        };
        
        if (elements.headerTitle) {
            elements.headerTitle.textContent = titles[sectionName] || 'Dashboard';
        }
        
        appState.currentSection = sectionName;
        
        // Update data based on section
        if (sectionName === 'transactions') {
            this.updateAllTransactionsTable();
        } else if (sectionName === 'analytics') {
            setTimeout(() => {
                chartManager.initializeCharts();
                chartManager.updateAllCharts();
                this.updateAnalyticsSummary();
            }, 200);
        }
    },

    updateAnalyticsSummary() {
        console.log('📊 Updating analytics summary...');
        
        if (appState.transactions.length === 0) {
            console.warn('No transactions available for analytics');
            return;
        }

        const insights = this.calculateAnalyticsInsights();
        
        const summaryElements = {
            mostActiveHour: document.getElementById('mostActiveHour'),
            largestTransaction: document.getElementById('largestTransaction'),
            avgDailyTransactions: document.getElementById('avgDailyTransactions'),
            mostCommonType: document.getElementById('mostCommonType'),
            successRate: document.getElementById('successRate'),
            avgTransactionAmount: document.getElementById('avgTransactionAmount'),
            growthRate: document.getElementById('growthRate'),
            avgTimeBetween: document.getElementById('avgTimeBetween'),
            busiestDay: document.getElementById('busiestDay')
        };
        
        if (summaryElements.mostActiveHour) {
            summaryElements.mostActiveHour.textContent = `${insights.mostActiveHour}:00 (${insights.mostActiveHourCount} transactions)`;
        }
        
        if (summaryElements.largestTransaction) {
            summaryElements.largestTransaction.textContent = `${utils.formatCurrency(insights.largestAmount)} - ${insights.largestType}`;
        }
        
        if (summaryElements.avgDailyTransactions) {
            summaryElements.avgDailyTransactions.textContent = `${Math.round(insights.avgDaily)} transactions/day`;
        }
        
        if (summaryElements.mostCommonType) {
            summaryElements.mostCommonType.textContent = `${insights.mostCommonType} (${insights.mostCommonCount.toLocaleString()}x)`;
        }
        
        if (summaryElements.successRate) {
            summaryElements.successRate.textContent = `${insights.successRate}%`;
        }
        
        if (summaryElements.avgTransactionAmount) {
            summaryElements.avgTransactionAmount.textContent = utils.formatCurrency(insights.avgAmount);
        }
        
        if (summaryElements.growthRate) {
            summaryElements.growthRate.textContent = `+${insights.growthRate}%`;
        }
        
        if (summaryElements.avgTimeBetween) {
            summaryElements.avgTimeBetween.textContent = insights.avgTimeBetween;
        }
        
        if (summaryElements.busiestDay) {
            summaryElements.busiestDay.textContent = insights.busiestDay;
        }
    },

    calculateAnalyticsInsights() {
        const transactions = appState.transactions;
        
        // Most active hour
        const hourlyData = dataProcessor.getHourlyDistribution(transactions);
        const mostActiveHour = hourlyData.indexOf(Math.max(...hourlyData));
        const mostActiveHourCount = hourlyData[mostActiveHour] || 0;
        
        // Largest transaction
        const largestTransaction = transactions.reduce((max, tx) => 
            tx.amount > max.amount ? tx : max, transactions[0] || { amount: 0, type: 'PAYMENT' });
        
        // Average daily transactions
        const dayRange = Math.max(1, Math.ceil(
            (new Date() - new Date(Math.min(...transactions.map(tx => new Date(tx.date))))) / (1000 * 60 * 60 * 24)
        ));
        const avgDaily = transactions.length / dayRange;
        
        // Most common transaction type
        const typeStats = dataProcessor.getTransactionsByType(transactions);
        const mostCommonEntry = Object.entries(typeStats).reduce((max, [type, stats]) => 
            stats.count > max.count ? { type, count: stats.count, label: stats.label } : max, 
            { type: '', count: 0, label: 'None' });
        
        // Success rate
        const successfulTransactions = transactions.filter(tx => tx.status === 'completed').length;
        const successRate = ((successfulTransactions / transactions.length) * 100).toFixed(1);
        
        // Average amount
        const totalAmount = transactions.reduce((sum, tx) => sum + tx.amount, 0);
        const avgAmount = totalAmount / transactions.length || 0;
        
        // Time between transactions
        const transactionDurations = [];
        let prevDate = null;
        transactions.sort((a, b) => new Date(a.date) - new Date(b.date)).forEach(tx => {
            const currentDate = new Date(tx.date);
            if (prevDate) {
                transactionDurations.push((currentDate - prevDate) / (1000 * 60 * 60)); // Hours between transactions
            }
            prevDate = currentDate;
        });

        const avgTimeBetween = transactionDurations.length > 0 ? 
            (transactionDurations.reduce((a, b) => a + b, 0) / transactionDurations.length).toFixed(1) + ' hours' : 'N/A';
        
        // Daily patterns
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dayData = dataProcessor.getDailyPatterns(transactions);
        const busiestDay = days[dayData.indexOf(Math.max(...dayData))];
        
        // Mock growth rate calculation
        const growthRate = (Math.random() * 20 + 5).toFixed(1);
        
        return {
            mostActiveHour: mostActiveHour || 0,
            mostActiveHourCount,
            largestAmount: largestTransaction.amount || 0,
            largestType: TRANSACTION_TYPES[largestTransaction.type]?.label || 'Unknown',
            avgDaily,
            mostCommonType: mostCommonEntry.label,
            mostCommonCount: mostCommonEntry.count,
            successRate,
            avgAmount,
            growthRate,
            avgTimeBetween,
            busiestDay
        };
    },
    
    updateAllTransactionsTable() {
        if (!elements.allTransactionsTable) {
            console.warn('⚠️ All transactions table not found');
            return;
        }
        
        console.log('📋 Updating all transactions table...');
        
        const { currentPage, itemsPerPage } = appState.pagination;
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        
        const currentPageTransactions = appState.filteredTransactions.slice(startIndex, endIndex);
        
        if (currentPageTransactions.length === 0) {
            elements.allTransactionsTable.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 2rem; color: var(--gray-500);">
                        No transactions found
                    </td>
                </tr>
            `;
            this.updatePagination();
            return;
        }
        
        elements.allTransactionsTable.innerHTML = currentPageTransactions
            .map(tx => `
                <tr onclick="showTransactionDetails(${tx.id})" class="cursor-pointer">
                    <td>${utils.formatDate(tx.date)}</td>
                    <td>${tx.transactionId}</td>
                    <td>
                        <span class="transaction-type" style="background-color: ${TRANSACTION_TYPES[tx.type]?.color || '#6b7280'}20; color: ${TRANSACTION_TYPES[tx.type]?.color || '#6b7280'}">
                            ${TRANSACTION_TYPES[tx.type]?.label || tx.type}
                        </span>
                    </td>
                    <td class="amount ${['INCOMING_MONEY', 'BANK_DEPOSIT'].includes(tx.type) ? 'positive' : 'negative'}">
                        ${utils.formatCurrency(tx.amount)}
                    </td>
                    <td>${tx.description}</td>
                    <td>
                        ${utils.getStatusBadge(tx.status)}
                    </td>
                </tr>
            `)
            .join('');
        
        this.updatePagination();
    },
    
    updatePagination() {
        const { currentPage, itemsPerPage } = appState.pagination;
        const totalItems = appState.filteredTransactions.length;
        const totalPages = Math.ceil(totalItems / itemsPerPage);
        const startItem = (currentPage - 1) * itemsPerPage + 1;
        const endItem = Math.min(currentPage * itemsPerPage, totalItems);
        
        const paginationInfo = document.querySelector('.pagination-info');
        if (paginationInfo) {
            if (totalItems === 0) {
                paginationInfo.textContent = 'No transactions found';
            } else {
                paginationInfo.textContent = `Showing ${startItem}-${endItem} of ${totalItems.toLocaleString()} transactions`;
            }
        }
        
        const paginationContainer = document.querySelector('.pagination-controls');
        if (paginationContainer && totalPages > 1) {
            let paginationHTML = '';
            
            // Previous button
            paginationHTML += `
                <button class="btn btn-page" onclick="changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>
                    <i class="ri-arrow-left-line"></i> Previous
                </button>
            `;
            
            // Page numbers
            const showPages = [];
            if (totalPages > 1) showPages.push(1);
            
            const range = 2;
            for (let i = Math.max(2, currentPage - range); i <= Math.min(totalPages - 1, currentPage + range); i++) {
                if (!showPages.includes(i)) showPages.push(i);
            }
            
            if (totalPages > 1 && !showPages.includes(totalPages)) showPages.push(totalPages);
            
            for (let i = 0; i < showPages.length; i++) {
                const pageNum = showPages[i];
                
                if (i > 0 && showPages[i] - showPages[i-1] > 1) {
                    paginationHTML += `<span class="pagination-ellipsis">...</span>`;
                }
                
                paginationHTML += `
                    <button class="btn btn-page ${pageNum === currentPage ? 'active' : ''}" onclick="changePage(${pageNum})">
                        ${pageNum}
                    </button>
                `;
            }
            
            // Next button
            paginationHTML += `
                <button class="btn btn-page" onclick="changePage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>
                    Next <i class="ri-arrow-right-line"></i>
                </button>
            `;
            
            paginationContainer.innerHTML = paginationHTML;
        } else if (paginationContainer) {
            paginationContainer.innerHTML = totalItems > 0 ? `
                <div style="color: var(--gray-500); font-size: 0.875rem; text-align: center; padding: 0.5rem;">
                    📄 All ${totalItems} transactions displayed on one page
                </div>
            ` : '';
        }
    }
};

// Chart management
const chartManager = {
    initializeCharts() {
        console.log('📈 Initializing charts...');
        
        if (typeof echarts === 'undefined') {
            console.error('❌ ECharts library not loaded');
            return;
        }
        
        try {
            // Initialize only if containers exist
            if (elements.transactionsChart && !appState.charts.transactions) {
                appState.charts.transactions = echarts.init(elements.transactionsChart);
            }
            if (elements.transactionTypesChart && !appState.charts.types) {
                appState.charts.types = echarts.init(elements.transactionTypesChart);
            }
            if (elements.analyticsTransactionsChart && !appState.charts.analyticsTransactions) {
                appState.charts.analyticsTransactions = echarts.init(elements.analyticsTransactionsChart);
            }
            if (elements.analyticsTypesChart && !appState.charts.analyticsTypes) {
                appState.charts.analyticsTypes = echarts.init(elements.analyticsTypesChart);
            }
            if (elements.monthlyTrendsChart && !appState.charts.monthly) {
                appState.charts.monthly = echarts.init(elements.monthlyTrendsChart);
            }
            if (elements.hourlyDistributionChart && !appState.charts.hourly) {
                appState.charts.hourly = echarts.init(elements.hourlyDistributionChart);
            }
            
            window.addEventListener('resize', this.resizeCharts.bind(this));
            return true;
        } catch (error) {
            console.error('Chart initialization failed:', error);
            return false;
        }
    },
    
    updateAllCharts() {
        console.log('📊 Updating all charts...');
        this.updateTransactionChart();
        this.updateTypeChart();
        this.updateMonthlyTrendsChart();
        this.updateHourlyChart();
        this.updateDailyPatternsChart();
    },
    
    updateTransactionChart() {
        try {
            if (!this.ensureChartsInitialized() || !appState.charts.transactions || appState.transactions.length === 0) {
                this.renderPlaceholder(elements.transactionsChart, 'No transaction data available');
                return;
            }
            
            const monthlyData = dataProcessor.getMonthlyData(appState.transactions);
            const months = Object.keys(monthlyData).sort();
            
            if (months.length === 0) {
                this.renderPlaceholder(elements.transactionsChart, 'No monthly data available');
                return;
            }
            
            const option = {
                title: { text: 'Monthly Income vs Expenses', left: 'center' },
                tooltip: { trigger: 'axis' },
                legend: { data: ['Income', 'Expenses'], bottom: 10 },
                xAxis: {
                    type: 'category',
                    data: months.map(m => new Date(m).toLocaleDateString('en', {month: 'short'}))
                },
                yAxis: { type: 'value' },
                series: [
                    {
                        name: 'Income',
                        type: 'bar',
                        data: months.map(m => monthlyData[m].income),
                        itemStyle: { color: '#22c55e' }
                    },
                    {
                        name: 'Expenses', 
                        type: 'bar',
                        data: months.map(m => monthlyData[m].expenses),
                        itemStyle: { color: '#ef4444' }
                    }
                ]
            };
            
            appState.charts.transactions.setOption(option);
            
            // Also update analytics chart if it exists
            if (appState.charts.analyticsTransactions) {
                appState.charts.analyticsTransactions.setOption(option);
            }
        } catch (error) {
            console.error('Error updating transaction chart:', error);
            this.renderPlaceholder(elements.transactionsChart, 'Error loading chart');
        }
    },
    
    updateTypeChart() {
        try {
            if (!this.ensureChartsInitialized() || !appState.charts.types || appState.transactions.length === 0) {
                this.renderPlaceholder(elements.transactionTypesChart, 'No transaction data available');
                return;
            }
            
            const typeStats = dataProcessor.getTransactionsByType(appState.transactions);
            const data = Object.values(typeStats)
                .filter(stat => stat.count > 0)
                .map(stat => ({
                    name: stat.label,
                    value: stat.count,
                    itemStyle: { color: stat.color }
                }));
            
            const option = {
                title: { text: 'Transaction Types', left: 'center' },
                tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
                legend: { bottom: 10 },
                series: [{
                    type: 'pie',
                    radius: ['40%', '70%'],
                    data: data
                }]
            };
            
            appState.charts.types.setOption(option);
            
            // Also update analytics chart if it exists
            if (appState.charts.analyticsTypes) {
                appState.charts.analyticsTypes.setOption(option);
            }
        } catch (error) {
            console.error('Error updating type chart:', error);
            this.renderPlaceholder(elements.transactionTypesChart, 'Error loading chart');
        }
    },
    
    updateMonthlyTrendsChart() {
        try {
            if (!this.ensureChartsInitialized() || !appState.charts.monthly || appState.transactions.length === 0) {
                this.renderPlaceholder(elements.monthlyTrendsChart, 'No transaction data available');
                return;
            }
            
            const monthlyData = dataProcessor.getMonthlyData(appState.transactions);
            const months = Object.keys(monthlyData).sort();
            
            const option = {
                tooltip: {
                    trigger: 'axis'
                },
                legend: {
                    data: ['Transaction Count', 'Net Amount']
                },
                xAxis: {
                    type: 'category',
                    data: months.map(month => new Date(month).toLocaleDateString('en', { month: 'short' }))
                },
                yAxis: [
                    {
                        type: 'value',
                        name: 'Count',
                        position: 'left'
                    },
                    {
                        type: 'value',
                        name: 'Amount',
                        position: 'right',
                        axisLabel: {
                            formatter: (value) => utils.formatCurrency(value)
                        }
                    }
                ],
                series: [
                    {
                        name: 'Transaction Count',
                        type: 'line',
                        data: months.map(month => monthlyData[month].count),
                        itemStyle: { color: '#3b82f6' }
                    },
                    {
                        name: 'Net Amount',
                        type: 'line',
                        yAxisIndex: 1,
                        data: months.map(month => monthlyData[month].income - monthlyData[month].expenses),
                        itemStyle: { color: '#22c55e' }
                    }
                ]
            };
            
            appState.charts.monthly.setOption(option);
        } catch (error) {
            console.error('Error updating monthly trends chart:', error);
            this.renderPlaceholder(elements.monthlyTrendsChart, 'Error loading chart');
        }
    },
    
    updateHourlyChart() {
        try {
            if (!this.ensureChartsInitialized() || !appState.charts.hourly || appState.transactions.length === 0) {
                this.renderPlaceholder(elements.hourlyDistributionChart, 'No transaction data available');
                return;
            }
            
            const hourlyData = dataProcessor.getHourlyDistribution(appState.transactions);
            
            const option = {
                tooltip: {
                    trigger: 'axis',
                    axisPointer: { type: 'shadow' }
                },
                xAxis: {
                    type: 'category',
                    data: Array.from({ length: 24 }, (_, i) => `${i}:00`)
                },
                yAxis: {
                    type: 'value',
                    name: 'Transactions'
                },
                series: [{
                    type: 'bar',
                    data: hourlyData,
                    itemStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: '#ffcc00' },
                            { offset: 1, color: '#e6b800' }
                        ])
                    }
                }]
            };
            
            appState.charts.hourly.setOption(option);
        } catch (error) {
            console.error('Error updating hourly chart:', error);
            this.renderPlaceholder(elements.hourlyDistributionChart, 'Error loading chart');
        }
    },
    
    updateDailyPatternsChart() {
        try {
            if (!this.ensureChartsInitialized() || !appState.charts.dailyPatterns || appState.transactions.length === 0) {
                this.renderPlaceholder(elements.dailyPatternsChart, 'No transaction data available');
                return;
            }
            
            const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const dayData = dataProcessor.getDailyPatterns(appState.transactions);
            
            const option = {
                title: { text: 'Weekly Transaction Patterns', left: 'center' },
                tooltip: { trigger: 'axis' },
                xAxis: {
                    type: 'category',
                    data: days
                },
                yAxis: { type: 'value' },
                series: [{
                    data: dayData,
                    type: 'line',
                    smooth: true,
                    lineStyle: { width: 4 },
                    itemStyle: { color: '#8b5cf6' }
                }]
            };
            
            appState.charts.dailyPatterns.setOption(option);
        } catch (error) {
            console.error('Error updating daily patterns chart:', error);
            this.renderPlaceholder(elements.dailyPatternsChart, 'Error loading chart');
        }
    },
    
    resizeCharts() {
        Object.values(appState.charts).forEach(chart => {
            if (chart && chart.resize) {
                chart.resize();
            }
        });
    },
    
    ensureChartsInitialized() {
        if (!appState.charts.transactions && elements.transactionsChart) {
            appState.charts.transactions = echarts.init(elements.transactionsChart);
        }
        if (!appState.charts.types && elements.transactionTypesChart) {
            appState.charts.types = echarts.init(elements.transactionTypesChart);
        }
        if (!appState.charts.analyticsTransactions && elements.analyticsTransactionsChart) {
            appState.charts.analyticsTransactions = echarts.init(elements.analyticsTransactionsChart);
        }
        if (!appState.charts.analyticsTypes && elements.analyticsTypesChart) {
            appState.charts.analyticsTypes = echarts.init(elements.analyticsTypesChart);
        }
        if (!appState.charts.monthly && elements.monthlyTrendsChart) {
            appState.charts.monthly = echarts.init(elements.monthlyTrendsChart);
        }
        if (!appState.charts.hourly && elements.hourlyDistributionChart) {
            appState.charts.hourly = echarts.init(elements.hourlyDistributionChart);
        }
        return true;
    },
    
    renderPlaceholder(element, message) {
        if (element) {
            element.innerHTML = `<div class="chart-placeholder">${message}</div>`;
        }
    }
};

// Event handling
const eventHandlers = {
    init() {
        console.log('🎯 Initializing event handlers...');
        this.bindNavigation();
        this.bindSearch();
        this.bindFilters();
        this.bindButtons();
        this.bindTheme();
        this.bindResize();
        this.bindUserActivity();
    },
    
    bindNavigation() {
        elements.navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const section = link.dataset.section;
                if (section) {
                    uiManager.switchSection(section);
                }
            });
        });
    },
    
    bindSearch() {
        if (elements.globalSearch) {
            const debouncedSearch = utils.debounce((value) => {
                appState.filters.search = value;
                appState.applyFilters();
                uiManager.updateAllTransactionsTable();
                uiManager.updateRecentTransactionsTable();
            }, 300);
            
            elements.globalSearch.addEventListener('input', (e) => {
                debouncedSearch(e.target.value);
                autoRefreshManager.pauseOnActivity();
            });
        }
    },
    
    bindFilters() {
        const filterElements = [
            elements.typeFilter,
            elements.statusFilter,
            elements.startDate,
            elements.endDate,
            elements.minAmount,
            elements.maxAmount
        ];
        
        filterElements.forEach(element => {
            if (element) {
                element.addEventListener('change', () => {
                    this.updateFiltersFromForm();
                    autoRefreshManager.pauseOnActivity();
                });
            }
        });
        
        if (elements.applyFilters) {
            elements.applyFilters.addEventListener('click', () => {
                this.updateFiltersFromForm();
                appState.applyFilters();
                uiManager.updateAllTransactionsTable();
                utils.showToast('Filters applied successfully', 'success');
            });
        }
        
        if (elements.resetFilters) {
            elements.resetFilters.addEventListener('click', () => {
                this.resetFiltersForm();
                appState.filters = {
                    search: '',
                    type: '',
                    status: '',
                    startDate: '',
                    endDate: '',
                    minAmount: '',
                    maxAmount: ''
                };
                appState.applyFilters();
                uiManager.updateAllTransactionsTable();
                utils.showToast('Filters reset', 'info');
            });
        }
    },
    
    updateFiltersFromForm() {
        if (elements.typeFilter) appState.filters.type = elements.typeFilter.value;
        if (elements.statusFilter) appState.filters.status = elements.statusFilter.value;
        if (elements.startDate) appState.filters.startDate = elements.startDate.value;
        if (elements.endDate) appState.filters.endDate = elements.endDate.value;
        if (elements.minAmount) appState.filters.minAmount = elements.minAmount.value;
        if (elements.maxAmount) appState.filters.maxAmount = elements.maxAmount.value;
    },
    
    resetFiltersForm() {
        if (elements.typeFilter) elements.typeFilter.value = '';
        if (elements.statusFilter) elements.statusFilter.value = '';
        if (elements.startDate) elements.startDate.value = '';
        if (elements.endDate) elements.endDate.value = '';
        if (elements.minAmount) elements.minAmount.value = '';
        if (elements.maxAmount) elements.maxAmount.value = '';
    },
    
    bindButtons() {
        if (elements.refreshBtn) {
            elements.refreshBtn.addEventListener('click', () => {
                dataManager.refreshData();
            });
        }
        
        elements.exportBtns.forEach(btn => {
            if (btn) {
                btn.addEventListener('click', () => {
                    dataManager.exportData('csv');
                });
            }
        });
        
        elements.exportChartBtns.forEach(btn => {
            if (btn) {
                btn.addEventListener('click', (e) => {
                    const chartId = e.target.dataset.chartId;
                    if (chartId) {
                        dataManager.exportChartImage(chartId);
                    }
                });
            }
        });
    },
    
    bindTheme() {
    console.log('🌙 Binding theme management...');
    console.log('🎨 Theme management delegated to themeManager');
    
    // Listen for theme changes to update app state
    window.addEventListener('themeChanged', (e) => {
        appState.darkMode = e.detail.isDark;
        
        // Update charts theme after state change
        setTimeout(() => {
            if (typeof chartManager !== 'undefined' && chartManager.updateChartsTheme) {
                chartManager.updateChartsTheme();
            }
        }, 100);
    });
    
    // Check if dark mode toggle exists
    // and log its management by themeManager
    if (elements.darkModeToggle) {
        console.log('✅ Dark mode toggle is managed by themeManager');
    }
},
    
    bindResize() {
        window.addEventListener('resize', utils.debounce(() => {
            chartManager.resizeCharts();
        }, 150));
    },
    
    bindUserActivity() {
        const activityEvents = ['click', 'scroll', 'keypress', 'mousemove'];
        
        activityEvents.forEach(event => {
            document.addEventListener(event, utils.debounce(() => {
                if (event !== 'mousemove') {
                    autoRefreshManager.pauseOnActivity();
                }
            }, 1000), { passive: true });
        });
    }
};

// Global functions
function changePage(page) {
    const totalPages = Math.ceil(appState.pagination.totalItems / appState.pagination.itemsPerPage);
    
    if (page >= 1 && page <= totalPages) {
        appState.pagination.currentPage = page;
        uiManager.updateAllTransactionsTable();
        
        const tableCard = document.querySelector('.table-card');
        if (tableCard) {
            tableCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }
}

function toggleAutoRefresh() {
    autoRefreshManager.toggleAutoRefresh();
    utils.showToast(
        appState.autoRefresh.isPaused ? 
        '⏸️ Auto-refresh paused' : 
        '▶️ Auto-refresh resumed', 
        'info'
    );
}

function showTransactionDetails(transactionId) {
    const transaction = appState.transactions.find(tx => tx.id === transactionId);
    if (!transaction) return;

    const modal = elements.transactionModal;
    const detailsContainer = elements.transactionDetails;
    
    if (detailsContainer) {
        detailsContainer.innerHTML = `
            <div class="transaction-detail">
                <div class="detail-header">
                    <h4>Transaction Details</h4>
                    <div class="detail-amount ${['INCOMING_MONEY', 'BANK_DEPOSIT'].includes(transaction.type) ? 'positive' : 'negative'}">
                        ${utils.formatCurrency(transaction.amount)}
                    </div>
                </div>
                <div class="detail-grid">
                    <div class="detail-item">
                        <label>Transaction ID:</label>
                        <span>${transaction.transactionId}</span>
                    </div>
                    <div class="detail-item">
                        <label>Date:</label>
                        <span>${utils.formatDateTime(transaction.date)}</span>
                    </div>
                    <div class="detail-item">
                        <label>Type:</label>
                        <span class="transaction-type" style="background-color: ${TRANSACTION_TYPES[transaction.type]?.color || '#6b7280'}20; color: ${TRANSACTION_TYPES[transaction.type]?.color || '#6b7280'}; padding: 0.25rem 0.75rem; border-radius: 1rem;">
                            ${TRANSACTION_TYPES[transaction.type]?.label || transaction.type}
                        </span>
                    </div>
                    <div class="detail-item">
                        <label>Amount:</label>
                        <span class="amount ${['INCOMING_MONEY', 'BANK_DEPOSIT'].includes(transaction.type) ? 'positive' : 'negative'}">
                            ${utils.formatCurrency(transaction.amount)}
                        </span>
                    </div>
                    <div class="detail-item">
                        <label>Fee:</label>
                        <span>${utils.formatCurrency(transaction.fee || 0)}</span>
                    </div>
                    <div class="detail-item">
                        <label>Status:</label>
                        ${utils.getStatusBadge(transaction.status)}
                    </div>
                    <div class="detail-item">
                        <label>Sender:</label>
                        <span>${transaction.sender || 'Unknown'}</span>
                    </div>
                    <div class="detail-item">
                        <label>Receiver:</label>
                        <span>${transaction.receiver || 'Unknown'}</span>
                    </div>
                    <div class="detail-item full-width">
                        <label>Description:</label>
                        <span>${transaction.description}</span>
                    </div>
                </div>
                <div class="transaction-timeline">
                    <div class="timeline-item ${transaction.status === 'completed' ? 'active' : ''}">
                        <div class="timeline-dot"></div>
                        <div class="timeline-content">
                            <span>Initiated</span>
                            <small>${utils.formatDateTime(transaction.date)}</small>
                        </div>
                    </div>
                    <div class="timeline-item ${transaction.status === 'completed' ? 'active' : ''}">
                        <div class="timeline-dot"></div>
                        <div class="timeline-content">
                            <span>${transaction.status === 'completed' ? 'Completed' : transaction.status === 'pending' ? 'Processing' : 'Failed'}</span>
                            <small>${utils.formatDateTime(transaction.date)}</small>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    if (modal) {
        modal.classList.remove('hidden');
    }
}

function closeModal() {
    const modal = elements.transactionModal;
    if (modal) {
        modal.classList.add('hidden');
    }
}

// Initialize application
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 MTN MoMo Dashboard starting...');
    
    initializeElements();
    
    if (appState.darkMode) {
        document.documentElement.classList.add('dark');
    }
    
    // Initialize charts first (empty state)
    chartManager.initializeCharts();
    
    // Then load data
    await dataManager.loadTransactions();
    
    // Initialize other components
    eventHandlers.init();
    autoRefreshManager.init();
    
    // Force update all views
    dataManager.updateAllViews();
    
    console.log('✅ MTN MoMo Dashboard initialized successfully');
});

// Cleanup
window.addEventListener('beforeunload', () => {
    autoRefreshManager.stopAutoRefresh();
});

// Debug functions
function debugCharts() {
    console.log('🔍 Debug Charts:');
    console.log('ECharts loaded:', typeof echarts !== 'undefined');
    console.log('Chart elements:', {
        transactionsChart: !!elements.transactionsChart,
        transactionTypesChart: !!elements.transactionTypesChart,
        analyticsTransactionsChart: !!elements.analyticsTransactionsChart,
        analyticsTypesChart: !!elements.analyticsTypesChart,
        monthlyTrendsChart: !!elements.monthlyTrendsChart,
        hourlyDistributionChart: !!elements.hourlyDistributionChart
    });
    console.log('Chart instances:', Object.keys(appState.charts));
    console.log('Transactions count:', appState.transactions.length);
}

setTimeout(debugCharts, 2000);

function testCharts() {
    console.log('🧪 Testing charts...');
    
    const chartElements = {
        transactions: elements.transactionsChart,
        types: elements.transactionTypesChart,
        analyticsTransactions: elements.analyticsTransactionsChart,
        analyticsTypes: elements.analyticsTypesChart,
        monthly: elements.monthlyTrendsChart,
        hourly: elements.hourlyDistributionChart
    };
    
    console.log('Chart elements found:', Object.entries(chartElements).map(([key, el]) => 
        key + ': ' + (el ? 'YES' : 'NO')).join(', '));
    
    console.log('ECharts loaded:', typeof echarts !== 'undefined');
    console.log('Transactions available:', appState.transactions.length);
    
    if (appState.currentSection === 'analytics') {
        console.log('🔄 Force updating analytics charts...');
        chartManager.initializeCharts();
        setTimeout(() => {
            chartManager.updateTransactionChart();
            chartManager.updateTypeChart();
            chartManager.updateDailyPatternsChart();
        }, 500);
    }
}

setTimeout(testCharts, 3000);