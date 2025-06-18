// Simple JWT decoder for frontend
function jwt_decode(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        return JSON.parse(atob(base64));
    } catch (e) {
        console.error("Invalid token:", e);
        return null;
    }
}

// Global variables
let currentUser = null;
let authToken = localStorage.getItem('token') || null;
const API_BASE_URL = 'http://localhost:5000';

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    // Check for existing token
    if (authToken) {
        currentUser = jwt_decode(authToken);
        if (currentUser) {
            setupAuthenticatedUI();
            loadStores();
            loadInvoices();
        } else {
            localStorage.removeItem('token');
        }
    }
});

// ======================
// AUTHENTICATION FUNCTIONS
// ======================

function showLoginForm() {
    document.getElementById('login-form').style.display = 'block';
    document.getElementById('register-form').style.display = 'none';
}

function showRegisterForm() {
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('register-form').style.display = 'block';
}

async function login() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    if (!username || !password) {
        alert("Please enter both username and password");
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Login failed');
        }
        
        const data = await response.json();
        authToken = data.token;
        localStorage.setItem('token', authToken);
        currentUser = jwt_decode(authToken);
        
        setupAuthenticatedUI();
        document.getElementById('username').value = '';
        document.getElementById('password').value = '';
        
        loadStores();
        loadInvoices();
    } catch (error) {
        alert(error.message);
        console.error("Login error:", error);
    }
}

async function register() {
    const username = document.getElementById('reg-username').value;
    const password = document.getElementById('reg-password').value;
    
    if (!username || !password) {
        alert("Please enter both username and password");
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Registration failed');
        }
        
        alert("Registration successful! Please login.");
        showLoginForm();
        document.getElementById('reg-username').value = '';
        document.getElementById('reg-password').value = '';
    } catch (error) {
        alert(error.message);
        console.error("Registration error:", error);
    }
}

function logout() {
    currentUser = null;
    authToken = null;
    localStorage.removeItem('token');
    document.getElementById('user-info').textContent = '';
    document.getElementById('logout-btn').style.display = 'none';
    document.getElementById('main-nav').style.display = 'none';
    document.getElementById('main-content').style.display = 'none';
    document.getElementById('login-form').style.display = 'block';
    document.getElementById('register-form').style.display = 'none';
}

function setupAuthenticatedUI() {
    document.getElementById('user-info').textContent = `Logged in as ${currentUser.username}`;
    document.getElementById('logout-btn').style.display = 'inline-block';
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('register-form').style.display = 'none';
    document.getElementById('main-nav').style.display = 'block';
    document.getElementById('main-content').style.display = 'block';
}

// ======================
// NAVIGATION
// ======================

function showSection(sectionId) {
    document.querySelectorAll('.content-section').forEach(section => {
        section.style.display = 'none';
    });
    document.getElementById(`${sectionId}-section`).style.display = 'block';
}

// ======================
// STORE MANAGEMENT
// ======================

async function loadStores() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/stores`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        if (!response.ok) throw new Error('Failed to load stores');
        
        const stores = await response.json();
        const tableBody = document.querySelector('#stores-table tbody');
        tableBody.innerHTML = '';
        
        const storeSelects = document.querySelectorAll('select[id$="-store"]');
        storeSelects.forEach(select => {
            select.innerHTML = '<option value="">Select Store</option>';
        });
        
        stores.forEach(store => {
            // Add to table
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${store.id}</td>
                <td>${store.name}</td>
                <td>${store.location || '-'}</td>
                <td>${store.contact || '-'}</td>
            `;
            tableBody.appendChild(row);
            
            // Add to selects
            storeSelects.forEach(select => {
                const option = document.createElement('option');
                option.value = store.id;
                option.textContent = store.name;
                select.appendChild(option);
            });
        });
    } catch (error) {
        console.error("Failed to load stores:", error);
        alert("Failed to load stores. Please try again.");
    }
}

async function addStore() {
    const name = document.getElementById('store-name').value;
    const location = document.getElementById('store-location').value;
    const contact = document.getElementById('store-contact').value;
    
    if (!name) {
        alert("Store name is required");
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/stores`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ name, location, contact })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to add store');
        }
        
        document.getElementById('store-name').value = '';
        document.getElementById('store-location').value = '';
        document.getElementById('store-contact').value = '';
        
        loadStores();
    } catch (error) {
        console.error("Failed to add store:", error);
        alert(error.message);
    }
}

// ======================
// INVOICE MANAGEMENT
// ======================

async function loadInvoices() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/invoices`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        if (!response.ok) throw new Error('Failed to load invoices');
        
        const invoices = await response.json();
        const tableBody = document.querySelector('#invoices-table tbody');
        tableBody.innerHTML = '';
        
        invoices.forEach(invoice => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${invoice.invoice_number}</td>
                <td>${invoice.date}</td>
                <td>${invoice.store_name}</td>
                <td>${invoice.cups_delivered}</td>
                <td>$${invoice.price_per_cup.toFixed(2)}</td>
                <td>$${(invoice.cups_delivered * invoice.price_per_cup).toFixed(2)}</td>
                <td>${invoice.is_paid ? 'Paid' : 'Unpaid'}</td>
                <td><button onclick="downloadInvoice('${invoice.invoice_number}')">Download</button></td>
            `;
            tableBody.appendChild(row);
        });
    } catch (error) {
        console.error("Failed to load invoices:", error);
        alert("Failed to load invoices. Please try again.");
    }
}

async function createInvoice() {
    const storeId = document.getElementById('invoice-store').value;
    const cups = document.getElementById('cups-delivered').value;
    const price = document.getElementById('price-per-cup').value;
    const isPaid = document.getElementById('is-paid').checked;
    
    if (!storeId || !cups || !price) {
        alert("Please fill all required fields");
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/invoices`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ 
                store_id: storeId, 
                cups_delivered: cups, 
                price_per_cup: price, 
                is_paid: isPaid 
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to create invoice');
        }
        
        document.getElementById('cups-delivered').value = '';
        document.getElementById('price-per-cup').value = '';
        document.getElementById('is-paid').checked = false;
        
        loadInvoices();
    } catch (error) {
        console.error("Failed to create invoice:", error);
        alert(error.message);
    }
}

function downloadInvoice(invoiceNumber) {
    window.open(`${API_BASE_URL}/invoices/${invoiceNumber}.pdf`, '_blank');
}

// ======================
// REPORTING
// ======================

async function generateReport() {
    const startDate = document.getElementById('start-date').value;
    const endDate = document.getElementById('end-date').value;
    const storeId = document.getElementById('report-store').value;
    
    let url = `${API_BASE_URL}/api/reports?`;
    if (startDate) url += `start_date=${startDate}&`;
    if (endDate) url += `end_date=${endDate}&`;
    if (storeId) url += `store_id=${storeId}`;
    
    try {
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        if (!response.ok) throw new Error('Failed to generate report');
        
        const report = await response.json();
        
        document.getElementById('total-sales').textContent = `$${report.total_sales?.toFixed(2) || '0.00'}`;
        document.getElementById('total-unpaid').textContent = 
            `$${report.total_unpaid?.toFixed(2) || '0.00'} (${report.unpaid_count || 0} invoices)`;
        document.getElementById('total-invoices').textContent = report.total_invoices || 0;
    } catch (error) {
        console.error("Failed to generate report:", error);
        alert("Failed to generate report. Please try again.");
    }
}

function exportToExcel() {
    alert("Export to Excel would be implemented here");
}