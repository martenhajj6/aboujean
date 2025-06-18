const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 5000;
const JWT_SECRET = 'your-secret-key';

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname)));

// Database setup
const db = new sqlite3.Database('./database.db');

// Initialize tables and default admin
db.serialize(() => {
    // Users table
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'manager'
    )`);
    
    // Default admin user
    const adminPassword = bcrypt.hashSync('admin123', 10);
    db.run(
        `INSERT OR IGNORE INTO users (username, password, role) VALUES (?, ?, ?)`,
        ['admin', adminPassword, 'admin']
    );

    // Stores table
    db.run(`CREATE TABLE IF NOT EXISTS stores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        location TEXT,
        contact TEXT
    )`);
    
    // Invoices table
    db.run(`CREATE TABLE IF NOT EXISTS invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_number TEXT UNIQUE NOT NULL,
        date TEXT NOT NULL,
        store_id INTEGER NOT NULL,
        cups_delivered INTEGER NOT NULL,
        price_per_cup REAL NOT NULL,
        is_paid INTEGER DEFAULT 0,
        FOREIGN KEY (store_id) REFERENCES stores(id)
    )`);
});

// Authentication middleware
function authenticate(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user;
        next();
    });
}

// Routes
// 1. Auth Routes
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
        if (err || !user || !bcrypt.compareSync(password, user.password)) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: '1h' }
        );
        res.json({ token });
    });
});

// 2. Store Routes
app.get('/api/stores', authenticate, (req, res) => {
    db.all('SELECT * FROM stores', [], (err, stores) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(stores);
    });
});

app.post('/api/stores', authenticate, (req, res) => {
    const { name, location, contact } = req.body;
    db.run(
        'INSERT INTO stores (name, location, contact) VALUES (?, ?, ?)',
        [name, location, contact],
        function(err) {
            if (err) return res.status(400).json({ error: err.message });
            res.status(201).json({ id: this.lastID, name, location, contact });
        }
    );
});

// 3. Invoice Routes
app.get('/api/invoices', authenticate, (req, res) => {
    const query = `
        SELECT i.*, s.name as store_name 
        FROM invoices i
        JOIN stores s ON i.store_id = s.id
    `;
    db.all(query, [], (err, invoices) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(invoices);
    });
});

app.post('/api/invoices', authenticate, (req, res) => {
    const { store_id, cups_delivered, price_per_cup, is_paid } = req.body;
    const invoice_number = `INV-${Date.now()}`;
    const date = new Date().toISOString().split('T')[0];

    db.run(
        `INSERT INTO invoices VALUES (NULL, ?, ?, ?, ?, ?, ?)`,
        [invoice_number, date, store_id, cups_delivered, price_per_cup, is_paid ? 1 : 0],
        function(err) {
            if (err) return res.status(400).json({ error: err.message });
            
            // Generate PDF
            if (!fs.existsSync('invoices')) fs.mkdirSync('invoices');
            
            const doc = new PDFDocument();
            const pdfPath = `./invoices/${invoice_number}.pdf`;
            doc.pipe(fs.createWriteStream(pdfPath));
            
            doc.fontSize(20).text('Merry Cream Invoice', { align: 'center' })
               .fontSize(12).text(`Invoice #: ${invoice_number}`)
               .text(`Date: ${date}`)
               .text(`Store ID: ${store_id}`)
               .text(`Cups Delivered: ${cups_delivered}`)
               .text(`Price per Cup: $${price_per_cup.toFixed(2)}`)
               .text(`Total: $${(cups_delivered * price_per_cup).toFixed(2)}`)
               .text(`Status: ${is_paid ? 'PAID' : 'PENDING'}`);
            doc.end();
            
            res.status(201).json({
                id: this.lastID,
                invoice_number,
                pdf_url: `/invoices/${invoice_number}.pdf`
            });
        }
    );
});

// Serve PDF invoices
app.get('/invoices/:filename', (req, res) => {
    res.sendFile(path.join(__dirname, 'invoices', req.params.filename));
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK',
        timestamp: new Date(),
        database: fs.existsSync('./database.db') ? 'Connected' : 'Not found'
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`\n🟢 Server running on http://localhost:${PORT}`);
    console.log(`🔑 Default admin login:`);
    console.log(`   Username: admin`);
    console.log(`   Password: admin123\n`);
});