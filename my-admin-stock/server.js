require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- 1. AUTHENTICATION SYSTEM ---
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || '1234';
const SECRET_TOKEN = 'my-super-secret-session-token'; // In real app, use JWT

// Middleware: ตรวจสอบสิทธิ์
const authMiddleware = (req, res, next) => {
    const token = req.headers['authorization'];
    if (token === SECRET_TOKEN) {
        next(); // ผ่าน
    } else {
        res.status(401).json({ error: 'Unauthorized: Please login first' });
    }
};

// Route: Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USER && password === ADMIN_PASS) {
        return res.json({ success: true, token: SECRET_TOKEN });
    }
    return res.status(401).json({ error: 'Invalid credentials' });
});


// --- 2. DATABASE CONFIG ---
let isMongoConnected = false;
let ProductModel, HistoryModel;
let mockDB = [
    { _id: '1', name: 'MacBook Pro', quantity: 5, minLevel: 2, category: 'IT Equipment', price: 45000, cost: 40000, barcode: '8851' },
    { _id: '2', name: 'Coke Zero', quantity: 48, minLevel: 12, category: 'Beverage', price: 20, cost: 15, barcode: '8852' },
];
let mockHistory = [];

if (process.env.MONGODB_URI) {
    mongoose.connect(process.env.MONGODB_URI)
        .then(() => {
            console.log('✅ Connected to MongoDB');
            isMongoConnected = true;
            const productSchema = new mongoose.Schema({
                name: String, quantity: Number, minLevel: Number, category: String,
                price: { type: Number, default: 0 }, cost: { type: Number, default: 0 },
                barcode: { type: String, default: '' }
            }, { timestamps: true });
            const historySchema = new mongoose.Schema({
                productName: String, type: String, amount: Number, date: { type: Date, default: Date.now }
            });
            ProductModel = mongoose.model('Product', productSchema);
            HistoryModel = mongoose.model('History', historySchema);
        })
        .catch(err => console.log('⚠️ MongoDB connection failed, using Mock Data.'));
}

async function recordHistory(name, type, amount) {
    if (isMongoConnected) {
        await new HistoryModel({ productName: name, type, amount }).save();
    } else {
        mockHistory.unshift({ _id: Date.now(), productName: name, type, amount, date: new Date() });
        if(mockHistory.length > 100) mockHistory.pop();
    }
}

// --- 3. PROTECTED ROUTES (Apply authMiddleware) ---
// API เหล่านี้ต้อง Login ก่อนถึงจะเรียกได้

app.get('/api/products', authMiddleware, async (req, res) => {
    if (isMongoConnected) return res.json(await ProductModel.find().sort({ createdAt: -1 }));
    return res.json(mockDB);
});

app.post('/api/products', authMiddleware, async (req, res) => {
    const { name, quantity, minLevel, category, price, cost, barcode } = req.body;
    const newData = { name, quantity: Number(quantity), minLevel: Number(minLevel), category, price: Number(price), cost: Number(cost), barcode };

    if (isMongoConnected) {
        const newProduct = await new ProductModel(newData).save();
        await recordHistory(name, 'NEW', quantity);
        return res.json(newProduct);
    } else {
        const newProduct = { _id: Date.now().toString(), ...newData };
        mockDB.push(newProduct);
        await recordHistory(name, 'NEW', quantity);
        return res.json(newProduct);
    }
});

app.put('/api/products/:id', authMiddleware, async (req, res) => {
    const { id } = req.params;
    if(isMongoConnected) {
        await ProductModel.findByIdAndUpdate(id, req.body);
    } else {
        const index = mockDB.findIndex(p => p._id === id);
        if(index !== -1) mockDB[index] = { ...mockDB[index], ...req.body };
    }
    return res.json({ success: true });
});

app.delete('/api/products/:id', authMiddleware, async (req, res) => {
    const { id } = req.params;
    if(isMongoConnected) {
        await ProductModel.findByIdAndDelete(id);
    } else {
        mockDB = mockDB.filter(p => p._id !== id);
    }
    return res.json({ success: true });
});

app.put('/api/stock/:action/:id', authMiddleware, async (req, res) => {
    const { action, id } = req.params;
    const qty = parseInt(req.body.amount);
    if (qty <= 0) return res.status(400).json({ error: 'Amount must be positive' });

    let product, name;
    // Helper
    const updateLogic = (current) => {
        if(action === 'in') return current + qty;
        if(action === 'out') {
            if (current < qty) throw new Error('Insufficient stock');
            return current - qty;
        }
    };

    try {
        if (isMongoConnected) {
            product = await ProductModel.findById(id);
            if(!product) return res.status(404).send();
            name = product.name;
            product.quantity = updateLogic(product.quantity);
            await product.save();
        } else {
            const index = mockDB.findIndex(p => p._id === id);
            if(index === -1) return res.status(404).send();
            name = mockDB[index].name;
            mockDB[index].quantity = updateLogic(mockDB[index].quantity);
        }
        await recordHistory(name, action.toUpperCase(), qty);
        return res.json({ success: true });
    } catch (e) {
        return res.status(400).json({ error: e.message });
    }
});

app.get('/api/history', authMiddleware, async (req, res) => {
    if(isMongoConnected) return res.json(await HistoryModel.find().sort({ date: -1 }).limit(100));
    return res.json(mockHistory);
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));