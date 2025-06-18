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
const PORT = process.env.PORT || 5000;
const JWT_SECRET = 'your-very-secure-secret-key';

// Middleware
app.use(cors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:5500'],
    credentials: true
}));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database setup
const db = new sqlite3.Database('./merrycream.db');

// Initialize tables
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'manager'
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS stores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        location TEXT,
        contact TEXT
    )`);

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

    // Create default admin user if none exists
    db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
        if (row.count === 0) {
            const hashedPassword = bcrypt.hashSync('admin123', 10);
            db.run(
                "INSERT INTO users (username, password, role) VALUES (?, ?, ?)",
                ['admin', hashedPassword, 'admin']
            );
        }
    });
});

// Auth middleware
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) return res.sendStatus(401);
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
}

// Routes
app.post('/api/register', async (req, res) => {
    const { username, password, role = 'manager' } = req.body;
    
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        db.run(
            "INSERT INTO users (username, password, role) VALUES (?, ?, ?)",
            [username, hashedPassword, role],
            function(err) {
                if (err) return res.status(400).json({ error: 'Username already exists' });
                res.json({ id: this.lastID, username, role });
            }
        );
    } catch (error) {
        res.status(500).json({ error: 'Registration failed' });
    }
});

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

// Protected routes
app.use('/api', authenticateToken);

// Store endpoints
app.get('/api/stores', (req, res) => {
    db.all('SELECT * FROM stores', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/stores', (req, res) => {
    const { name, location, contact } = req.body;
    db.run(
        'INSERT INTO stores (name, location, contact) VALUES (?, ?, ?)',
        [name, location, contact],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID, name, location, contact });
        }
    );
});

// Invoice endpoints
app.get('/api/invoices', (req, res) => {
    const query = `
        SELECT i.*, s.name as store_name 
        FROM invoices i
        JOIN stores s ON i.store_id = s.id
    `;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/invoices', (req, res) => {
    const { store_id, cups_delivered, price_per_cup, is_paid } = req.body;
    const invoice_number = `INV-${Date.now()}`;
    const date = new Date().toISOString().split('T')[0];
    
    db.run(
        `INSERT INTO invoices VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [null, invoice_number, date, store_id, cups_delivered, price_per_cup, is_paid ? 1 : 0],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            
            // Generate PDF
            if (!fs.existsSync('./invoices')) {
                fs.mkdirSync('./invoices');
            }
            
            const doc = new PDFDocument();
            const pdfPath = `./invoices/${invoice_number}.pdf`;
            doc.pipe(fs.createWriteStream(pdfPath));
            
            doc.fontSize(20).text('Merry Cream Invoice', { align: 'center' });
            doc.moveDown();
            doc.fontSize(12).text(`Invoice #: ${invoice_number}`);
            doc.text(`Date: ${date}`);
            doc.text(`Store ID: ${store_id}`);
            doc.text(`Cups Delivered: ${cups_delivered}`);
            doc.text(`Price per Cup: $${price_per_cup.toFixed(2)}`);
            doc.text(`Total: $${(cups_delivered * price_per_cup).toFixed(2)}`);
            doc.text(`Status: ${is_paid ? 'PAID' : 'UNPAID'}`);
            
            doc.end();
            
            res.json({ 
                id: this.lastID, 
                invoice_number, 
                date,
                store_id,
                cups_delivered,
                price_per_cup,
                is_paid,
                pdf_url: `/invoices/${invoice_number}.pdf` 
            });
        }
    );
});

// Reports endpoint
app.get('/api/reports', (req, res) => {
    let query = `
        SELECT 
            SUM(cups_delivered * price_per_cup) as total_sales,
            SUM(CASE WHEN is_paid = 0 THEN cups_delivered * price_per_cup ELSE 0 END) as total_unpaid,
            COUNT(*) as total_invoices,
            SUM(CASE WHEN is_paid = 0 THEN 1 ELSE 0 END) as unpaid_count
        FROM invoices
        WHERE 1=1
    `;
    
    const params = [];
    
    if (req.query.start_date) {
        query += ' AND date >= ?';
        params.push(req.query.start_date);
    }
    
    if (req.query.end_date) {
        query += ' AND date <= ?';
        params.push(req.query.end_date);
    }
    
    if (req.query.store_id) {
        query += ' AND store_id = ?';
        params.push(req.query.store_id);
    }
    
    db.get(query, params, (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row);
    });
});

// Serve PDF invoices
app.get('/api/stores', (req, res) => {
  db.all('SELECT * FROM stores', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Access the app at http://localhost:${PORT}`);
});