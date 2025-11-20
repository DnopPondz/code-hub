const API = 'http://localhost:3000/api';
let allProducts = [];
let filteredProducts = []; // สำหรับ Search + Pagination
let currentStockId = null;
let currentStockMode = 'out'; 
let currentStockQty = 0;
let stockChart = null;

// --- PAGINATION CONFIG ---
let currentPage = 1;
const itemsPerPage = 8; // โชว์ 8 รายการต่อหน้า

// --- INIT ---
document.addEventListener('DOMContentLoaded', checkAuth);

function checkAuth() {
    const token = localStorage.getItem('token');
    if (token) {
        axios.defaults.headers.common['Authorization'] = token;
        showApp();
    } else {
        showLogin();
    }
}

// --- UTILS: TOAST & LOADING ---
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    const bgColor = type === 'success' ? 'bg-emerald-500' : 'bg-rose-500';
    const icon = type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle';
    
    toast.className = `toast ${bgColor} text-white px-6 py-3 rounded-xl shadow-lg flex items-center gap-3 min-w-[300px]`;
    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span class="font-bold">${message}</span>`;
    
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function toggleLoading(show) {
    const el = document.getElementById('loading-overlay');
    if(show) el.classList.remove('hidden');
    else el.classList.add('hidden');
}

// --- AUTH ---
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    toggleLoading(true);
    try {
        const res = await axios.post(`${API}/login`, {
            username: document.getElementById('loginUser').value,
            password: document.getElementById('loginPass').value
        });
        if (res.data.success) {
            localStorage.setItem('token', res.data.token);
            axios.defaults.headers.common['Authorization'] = res.data.token;
            showApp();
        }
    } catch (error) {
        showToast('Invalid Username or Password', 'error');
    } finally {
        toggleLoading(false);
    }
});

function logout() {
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
    showLogin();
}

function showApp() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app-screen').classList.remove('hidden');
    fetchData();
}

function showLogin() {
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('app-screen').classList.add('hidden');
}

// --- DATA ---
async function fetchData() {
    toggleLoading(true);
    try {
        const [pRes, hRes] = await Promise.all([
            axios.get(`${API}/products`),
            axios.get(`${API}/history`)
        ]);
        allProducts = pRes.data;
        filteredProducts = [...allProducts]; // Init filtered
        
        renderPagination(); // Render Page 1
        renderHistory(hRes.data);
        updateDashboard(allProducts);
        renderChart(allProducts);
    } catch (err) {
        if(err.response && err.response.status === 401) logout();
        else console.error(err);
    } finally {
        toggleLoading(false);
    }
}

// --- PAGINATION LOGIC ---
function renderPagination() {
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const pageData = filteredProducts.slice(start, end);
    
    renderInventory(pageData);

    // Update Controls
    const totalPages = Math.ceil(filteredProducts.length / itemsPerPage) || 1;
    document.getElementById('page-info').innerText = `Page ${currentPage} of ${totalPages}`;
    document.getElementById('btnPrev').disabled = currentPage === 1;
    document.getElementById('btnNext').disabled = currentPage === totalPages;
}

function prevPage() { if(currentPage > 1) { currentPage--; renderPagination(); } }
function nextPage() { 
    const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
    if(currentPage < totalPages) { currentPage++; renderPagination(); } 
}

function handleSearch() {
    const term = document.getElementById('globalSearch').value.toLowerCase();
    filteredProducts = allProducts.filter(p => 
        p.name.toLowerCase().includes(term) || 
        p.category.toLowerCase().includes(term) || 
        (p.barcode && p.barcode.includes(term))
    );
    currentPage = 1; // Reset to page 1 on search
    renderPagination();
}

// --- RENDER ---
function renderInventory(products) {
    const list = document.getElementById('inventory-list');
    list.innerHTML = products.map(p => {
        const isLow = p.quantity <= p.minLevel;
        const price = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(p.price);
        const cost = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(p.cost);

        return `
        <tr class="hover:bg-slate-50 border-b border-slate-50 transition group">
            <td class="p-4">
                <div class="font-bold text-slate-700">${p.name}</div>
                <div class="text-xs text-slate-400 mt-1"><i class="fa-solid fa-barcode"></i> ${p.barcode || '-'}</div>
            </td>
            <td class="p-4 text-center">
                <span class="bg-slate-100 text-slate-500 px-3 py-1 rounded-full text-xs font-bold border border-slate-200">${p.category}</span>
            </td>
            <td class="p-4 text-right">
                <div class="text-sm font-bold text-slate-700">${price}</div>
                <div class="text-xs text-slate-400">Cost: ${cost}</div>
            </td>
            <td class="p-4 text-center">
                <div class="inline-flex flex-col items-center">
                    <span class="text-lg font-bold ${isLow ? 'text-rose-600' : 'text-slate-700'}">${p.quantity}</span>
                    ${isLow ? '<span class="text-[10px] font-bold text-rose-500 bg-rose-100 px-2 rounded-full animate-pulse">Low Stock</span>' : `<span class="text-[10px] text-slate-400">min: ${p.minLevel}</span>`}
                </div>
            </td>
            <td class="p-4 text-center">
                <div class="flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <button onclick="openStockModal('${p._id}', '${p.name}', ${p.quantity})" class="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 hover:bg-blue-600 hover:text-white transition flex items-center justify-center"><i class="fa-solid fa-box-open"></i></button>
                    <button onclick="openEditModal('${p._id}')" class="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-600 hover:text-white transition flex items-center justify-center"><i class="fa-solid fa-pen"></i></button>
                    <button onclick="deleteProduct('${p._id}')" class="w-8 h-8 rounded-lg bg-rose-100 text-rose-600 hover:bg-rose-600 hover:text-white transition flex items-center justify-center"><i class="fa-solid fa-trash"></i></button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

function renderHistory(history) {
    const list = document.getElementById('history-list');
    list.innerHTML = history.map(h => {
        const isIn = h.type === 'IN' || h.type === 'NEW';
        const colorClass = isIn ? 'text-emerald-600 bg-emerald-50' : 'text-rose-600 bg-rose-50';
        const icon = isIn ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down';
        const date = new Date(h.date).toLocaleString('th-TH', { month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit' });
        return `
        <tr class="border-b border-slate-50 hover:bg-slate-50">
            <td class="p-4 text-slate-500 text-xs font-mono">${date}</td>
            <td class="p-4"><span class="px-2 py-1 rounded text-xs font-bold flex items-center gap-2 w-fit ${colorClass}"><i class="fa-solid ${icon}"></i> ${h.type}</span></td>
            <td class="p-4 font-medium text-slate-700">${h.productName}</td>
            <td class="p-4 text-right font-bold ${isIn ? 'text-emerald-600' : 'text-rose-600'}">${isIn ? '+' : '-'}${h.amount}</td>
        </tr>`;
    }).join('');
}

function updateDashboard(products) {
    const lowStock = products.filter(p => p.quantity <= p.minLevel);
    const totalValue = products.reduce((acc, p) => acc + (p.quantity * (p.cost || 0)), 0);
    document.getElementById('stat-total').innerText = products.length;
    document.getElementById('stat-low').innerText = lowStock.length;
    document.getElementById('stat-value').innerText = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 }).format(totalValue);
}

function renderChart(products) {
    const ctx = document.getElementById('stockChart').getContext('2d');
    const categoryCount = {};
    products.forEach(p => categoryCount[p.category] = (categoryCount[p.category] || 0) + p.quantity);
    if (stockChart) stockChart.destroy();
    stockChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(categoryCount),
            datasets: [{ data: Object.values(categoryCount), backgroundColor: ['#3b82f6', '#10b981', '#f43f5e', '#f59e0b', '#8b5cf6'], borderWidth: 0 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { usePointStyle: true } } } }
    });
}

// --- MODAL & ACTIONS ---
function switchView(viewName) {
    document.getElementById('view-dashboard').classList.add('hidden');
    document.getElementById('view-inventory').classList.add('hidden');
    document.getElementById('view-history').classList.add('hidden');
    document.querySelectorAll('.sidebar-link').forEach(el => { el.classList.remove('active', 'bg-blue-50', 'text-blue-600'); el.classList.add('text-slate-500'); });
    document.getElementById(`view-${viewName}`).classList.remove('hidden');
    const nav = document.getElementById(`nav-${viewName}`);
    nav.classList.add('active'); nav.classList.remove('text-slate-500');
    const titles = { 'dashboard': 'Dashboard', 'inventory': 'Inventory', 'history': 'History' };
    document.getElementById('page-title').innerText = titles[viewName];
}

function openModal(mode) {
    document.getElementById('productModal').classList.remove('hidden');
    document.getElementById('productForm').reset();
    if (mode === 'add') {
        document.getElementById('modalTitle').innerText = 'Add New Product';
        document.getElementById('qtyContainer').classList.remove('hidden');
        document.getElementById('pId').value = '';
    }
}

function openEditModal(id) {
    const p = allProducts.find(x => x._id === id);
    if (!p) return;
    openModal('edit');
    document.getElementById('modalTitle').innerText = 'Edit Product';
    document.getElementById('qtyContainer').classList.add('hidden');
    document.getElementById('pId').value = p._id;
    document.getElementById('pName').value = p.name;
    document.getElementById('pCategory').value = p.category;
    document.getElementById('pMin').value = p.minLevel;
    document.getElementById('pPrice').value = p.price;
    document.getElementById('pCost').value = p.cost;
    document.getElementById('pBarcode').value = p.barcode || '';
}

document.getElementById('productForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    toggleLoading(true);
    const id = document.getElementById('pId').value;
    const data = {
        name: document.getElementById('pName').value,
        category: document.getElementById('pCategory').value,
        minLevel: document.getElementById('pMin').value,
        quantity: document.getElementById('pQty').value,
        price: document.getElementById('pPrice').value,
        cost: document.getElementById('pCost').value,
        barcode: document.getElementById('pBarcode').value
    };
    try {
        if (id) await axios.put(`${API}/products/${id}`, data);
        else await axios.post(`${API}/products`, data);
        closeModal('productModal');
        fetchData();
        showToast('Product Saved!', 'success');
    } catch (error) { showToast('Error Saving Data', 'error'); } finally { toggleLoading(false); }
});

async function deleteProduct(id) {
    if(!confirm('Delete this item?')) return;
    toggleLoading(true);
    try {
        await axios.delete(`${API}/products/${id}`);
        fetchData();
        showToast('Item Deleted', 'success');
    } catch(e) { showToast('Delete Failed', 'error'); } finally { toggleLoading(false); }
}

function openStockModal(id, name, qty) {
    currentStockId = id; currentStockQty = qty;
    document.getElementById('stockProductName').innerText = `${name} (Current: ${qty})`;
    document.getElementById('stockModal').classList.remove('hidden');
    document.getElementById('stockAmount').value = 1;
    setStockMode('out');
}

function setStockMode(mode) {
    currentStockMode = mode;
    const btnIn = document.getElementById('btnIn');
    const btnOut = document.getElementById('btnOut');
    const input = document.getElementById('stockAmount');
    if(mode === 'in') {
        btnIn.className = "flex-1 py-2 rounded-lg bg-emerald-100 text-emerald-700 shadow-inner transition-all";
        btnOut.className = "flex-1 py-2 rounded-lg text-slate-400 transition-all";
        input.className = "w-full text-center text-3xl font-bold text-emerald-600 border-2 border-emerald-200 rounded-xl py-3 mb-6 outline-none";
    } else {
        btnIn.className = "flex-1 py-2 rounded-lg text-slate-400 transition-all";
        btnOut.className = "flex-1 py-2 rounded-lg bg-rose-100 text-rose-700 shadow-inner transition-all";
        input.className = "w-full text-center text-3xl font-bold text-rose-600 border-2 border-rose-200 rounded-xl py-3 mb-6 outline-none";
    }
}

async function confirmStockUpdate() {
    const amount = parseInt(document.getElementById('stockAmount').value);
    if(!amount || amount < 1) return showToast('Invalid Amount', 'error');
    if (currentStockMode === 'out' && amount > currentStockQty) {
        return showToast(`Insufficient Stock! Only ${currentStockQty} left.`, 'error');
    }
    toggleLoading(true);
    try {
        await axios.put(`${API}/stock/${currentStockMode}/${currentStockId}`, { amount });
        closeModal('stockModal');
        fetchData();
        showToast('Stock Updated!', 'success');
    } catch (error) { showToast('Update Failed', 'error'); } finally { toggleLoading(false); }
}

function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
function exportToCSV() {
    let csv = "ID,Name,Category,Qty,Min,Price,Cost\n";
    allProducts.forEach(p => csv += `${p._id},${p.name},${p.category},${p.quantity},${p.minLevel},${p.price},${p.cost}\n`);
    const link = document.createElement("a");
    link.href = "data:text/csv;charset=utf-8," + encodeURI(csv);
    link.download = "inventory.csv";
    link.click();
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    
    // เช็คว่า Sidebar มี class ที่ซ่อนอยู่ไหม (-translate-x-full)
    if (sidebar.classList.contains('-translate-x-full')) {
        sidebar.classList.remove('-translate-x-full'); // แสดง Sidebar
        overlay.classList.remove('hidden'); // แสดงพื้นหลังดำ
    } else {
        sidebar.classList.add('-translate-x-full'); // ซ่อน Sidebar
        overlay.classList.add('hidden'); // ซ่อนพื้นหลังดำ
    }
}

// เวลาเปลี่ยนหน้าในมือถือ ให้ปิด Sidebar อัตโนมัติ
// --- NAVIGATION LOGIC (วางส่วนนี้ใน app.js) ---

function switchView(viewName) {
    console.log("Switching to:", viewName); // เช็คว่าฟังก์ชันถูกเรียกหรือไม่

    // 1. ซ่อนทุกหน้าก่อน
    const views = ['dashboard', 'inventory', 'history'];
    views.forEach(v => {
        const el = document.getElementById(`view-${v}`);
        if (el) el.classList.add('hidden');
    });

    // 2. รีเซ็ตสีปุ่มเมนูทั้งหมดให้เป็นสีเทา (Inactive)
    const navs = ['dashboard', 'inventory', 'history'];
    navs.forEach(n => {
        const btn = document.getElementById(`nav-${n}`);
        if (btn) {
            btn.classList.remove('active', 'bg-blue-50', 'text-blue-600', 'border-r-4', 'border-blue-600'); // ลบสไตล์ Active
            btn.classList.add('text-slate-500'); // กลับเป็นสีเทา
        }
    });

    // 3. แสดงหน้าที่เลือก
    const targetView = document.getElementById(`view-${viewName}`);
    if (targetView) {
        targetView.classList.remove('hidden');
        // ถ้าเป็น Inventory ให้โหลดข้อมูลหน้าแรกใหม่
        if (viewName === 'inventory') {
             // renderPagination(); // ถ้ามี pagination ให้เปิดบรรทัดนี้
        }
    } else {
        console.error(`View not found: view-${viewName}`);
    }

    // 4. ใส่สีให้ปุ่มเมนูที่เลือก (Active)
    const targetNav = document.getElementById(`nav-${viewName}`);
    if (targetNav) {
        targetNav.classList.add('active', 'bg-blue-50', 'text-blue-600', 'border-r-4', 'border-blue-600'); // ใส่สไตล์ Active
        targetNav.classList.remove('text-slate-500');
    }

    // 5. เปลี่ยนหัวข้อหน้า (Page Title)
    const titles = { 
        'dashboard': 'Dashboard Overview', 
        'inventory': 'Product Inventory', 
        'history': 'Transaction History' 
    };
    const titleEl = document.getElementById('page-title');
    if(titleEl) titleEl.innerText = titles[viewName] || 'Stock Pro';

    // 6. (สำหรับมือถือ) ถ้าจอมือถืออยู่ ให้ปิด Sidebar อัตโนมัติหลังจากกด
    if(window.innerWidth < 768 && typeof toggleSidebar === 'function') {
        // เช็คก่อนว่า Sidebar เปิดอยู่ไหม ถ้าเปิดค่อยปิด
        const sidebar = document.getElementById('sidebar');
        if (!sidebar.classList.contains('-translate-x-full')) {
            toggleSidebar();
        }
    }
}