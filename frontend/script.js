/* ============================================================
   script.js — UI & integrasi Supabase
   ============================================================ */

// ==== KONFIGURASI SUPABASE ====
// Ganti dengan URL & anon key dari project Supabase kamu.
// Jika masih berbentuk YOUR-PROJECT / YOUR-ANON-KEY, aplikasi akan
// menolak request dan menghasilkan error 403/Forbidden.
const SUPABASE_URL = 'https://dgoeucmxwlpxnbpzinyy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRnb2V1Y214d2xweG5icHppbnl5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzNDE1MTMsImV4cCI6MjEwNTkxNzUxM30.27AB18VjeTjWe8FI97w-Di0KRcd5f_GmV4ADixDet_o';

const isSupabaseConfigured = () => {
  const validUrl = !!SUPABASE_URL && !SUPABASE_URL.includes('YOUR-PROJECT') && SUPABASE_URL.includes('supabase.co');
  const validAnonKey = !!SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.includes('PASTE_ANON_KEY') && !SUPABASE_ANON_KEY.includes('YOUR-ANON');
  return validUrl && validAnonKey;
};

const db = isSupabaseConfigured() ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
let unpaidInvoices = [];
let loadedInvoices = [];
let loadedSuppliers = [];
let loadedCategories = [];
let loadedProducts = [];
let loadedPaymentHistory = [];
let cachedFilteredLaporanRows = [];
let selectedPaymentInvoice = null;
let invoicesLoadPromise = null;

let currentSupplierPage = 1;
const SUPPLIER_PER_PAGE = 5;

let currentProductPage = 1;
const PRODUCT_PER_PAGE = 5;

let currentInvoicePage = 1;
const INVOICE_PER_PAGE = 5;

let currentPaymentPage = 1;
const PAYMENT_PER_PAGE = 5;

let currentLaporanPage = 1;
const LAPORAN_PER_PAGE = 5;

var {
  parseSyaratPembayaran, addDays, hitungTanggalJatuhTempo, tanggalHariIni, diffDays,
  formatRp, formatTanggal, hitungDiskon,
  statusDinamis, exportToCSV
} = window.AppLogic;

// ====== UTIL ======
function toast(msg, type = '') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast show ' + type;
  setTimeout(() => t.className = 'toast ' + type, 2500);
}

function initTomSelect(id, extraOptions = {}) {
  const el = document.getElementById(id);
  if (!el || typeof TomSelect === 'undefined') return null;

  if (el.tomselect) {
    el.tomselect.destroy();
  }

  const defaultOptions = {
    create: false,
    maxItems: 1,
    allowEmptyOption: true,
    openOnFocus: true,
    closeAfterSelect: true,
    selectOnTab: true,
    hideSelected: false,
    searchField: ['text'],
    highlight: true,
    onItemAdd: function() {
      this.setTextboxValue('');
      this.refreshOptions(false);
    },
    render: {
      option_create: function(data, escape) {
        return '<div class="create">+ Gunakan baru: <strong>' + escape(data.input) + '</strong></div>';
      },
      no_results: function(data, escape) {
        return '<div class="no-results">Tidak ada pilihan yang cocok dengan "' + escape(data.input) + '"</div>';
      }
    }
  };

  const ts = new TomSelect('#' + id, Object.assign({}, defaultOptions, extraOptions));
  return ts;
}

function syncTomSelectVal(id, val, silent = true) {
  const el = document.getElementById(id);
  if (!el) return;
  const strVal = (val === null || val === undefined) ? '' : String(val);
  if (el.tomselect) {
    el.tomselect.setValue(strVal, silent);
  } else {
    el.value = strVal;
  }
}

function renderPaginationBar(containerId, currentPage, totalItems, perPage, changePageFnName) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const totalPages = Math.ceil(totalItems / perPage);
  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = `
    <div class="pagination-wrap">
      <button type="button" class="btn btn-secondary btn-sm" onclick="${changePageFnName}(-1)" ${currentPage <= 1 ? 'disabled' : ''}>&larr; Sebelumnya</button>
      <span class="pagination-info">Halaman <strong>${currentPage}</strong> dari <strong>${totalPages}</strong> (Total: ${totalItems})</span>
      <button type="button" class="btn btn-secondary btn-sm" onclick="${changePageFnName}(1)" ${currentPage >= totalPages ? 'disabled' : ''}>Selanjutnya &rarr;</button>
    </div>`;
}

function formatSyarat(syarat) {
  if (!syarat) return '-';
  const clean = String(syarat).trim();
  if (!clean || clean === '-' || clean.toLowerCase() === 'null' || clean.toLowerCase() === 'undefined') return '-';
  return clean;
}

function todayStr() {
  return tanggalHariIni();
}

function ensureSupabaseReady() {
  if (!db) {
    toast('Supabase belum dikonfigurasi. Isi URL dan anon key di script.js.', 'error');
    return false;
  }
  return true;
}

function getInvoiceTotalPaid(payments = []) {
  return (payments || []).reduce((sum, p) => sum + Number(p.jumlah_bayar || 0), 0);
}

function getInvoiceTotalDiscount(payments = []) {
  return (payments || []).reduce((sum, p) => sum + Number(p.diskon_didapat || 0), 0);
}

function getInvoiceTotalLateFee(payments = []) {
  return (payments || []).reduce((sum, p) => sum + Number(p.denda_dikenakan || 0), 0);
}

function getInvoiceTotalApplied(payments = []) {
  return getInvoiceTotalPaid(payments) + getInvoiceTotalDiscount(payments);
}

function getInvoiceBalance(invoice, payments = []) {
  return Math.max(0, Number(invoice.total_amount || 0) + getInvoiceTotalLateFee(payments) - getInvoiceTotalApplied(payments));
}

// ====== TAB NAVIGASI ======
const tabHeadings = {
  dashboard: 'Dashboard Ringkasan',
  supplier: 'Data Supplier',
  barang: 'Data Barang',
  invoice: 'Faktur & Utang Usaha',
  payment: 'Pencatatan Pembayaran',
  laporan: 'Laporan Historis Utang Usaha'
};

function activateTab(tabName) {
  const tabButton = document.querySelector(`.tab[data-tab="${tabName}"]`);
  const tabPanel = document.getElementById(tabName);
  if (!tabButton || !tabPanel) return;

  document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));

  tabButton.classList.add('active');
  tabPanel.classList.add('active');

  const headingEl = document.getElementById('page-heading');
  if (headingEl && tabHeadings[tabName]) {
    headingEl.textContent = tabHeadings[tabName];
  }

  // Auto close mobile drawer when link clicked
  document.getElementById('sidebar')?.classList.remove('open');

  if (tabName === 'barang') loadProducts();
  if (tabName === 'laporan') loadLaporan();
  if (tabName === 'dashboard') loadDashboard();
}

window.activateTab = activateTab;

function bindTabs() {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => activateTab(btn.dataset.tab));
  });
}

function goToNextTab() {
  const tabOrder = ['dashboard', 'supplier', 'barang', 'invoice', 'payment', 'laporan'];
  const activeTab = document.querySelector('.tab.active')?.dataset.tab || 'dashboard';
  const nextIndex = (tabOrder.indexOf(activeTab) + 1) % tabOrder.length;
  activateTab(tabOrder[nextIndex]);
}

window.goToNextTab = goToNextTab;

// ====== SUPPLIER ======
async function loadSuppliers() {
  if (!ensureSupabaseReady()) return;

  const { data, error } = await db.from('suppliers').select('*').order('id', { ascending: true });
  if (error) return toast('Gagal load supplier: ' + error.message, 'error');
  loadedSuppliers = data || [];

  currentSupplierPage = 1;
  renderSupplierTable();
  populateInvoiceSupplierOptions();
  populateReportSupplierOptions();
}

function onSupplierSearch() {
  currentSupplierPage = 1;
  renderSupplierTable();
}
window.onSupplierSearch = onSupplierSearch;

function getFilteredSuppliers() {
  const query = (document.getElementById('search-supplier')?.value || '').toLowerCase().trim();
  if (!query) return loadedSuppliers;
  return loadedSuppliers.filter(s => {
    const statusStr = s.is_active !== false ? 'aktif' : 'nonaktif';
    return (s.nama || '').toLowerCase().includes(query) ||
           (s.kontak || '').toLowerCase().includes(query) ||
           (s.alamat || '').toLowerCase().includes(query) ||
           statusStr.includes(query);
  });
}

function renderSupplierTable() {
  const tbody = document.querySelector('#tabel-supplier tbody');
  if (!tbody) return;

  const filtered = getFilteredSuppliers();

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center">Belum ada supplier yang cocok</td></tr>';
    renderPaginationBar('supplier-pagination', 1, 0, SUPPLIER_PER_PAGE, 'changeSupplierPage');
    return;
  }

  const start = (currentSupplierPage - 1) * SUPPLIER_PER_PAGE;
  const pageItems = filtered.slice(start, start + SUPPLIER_PER_PAGE);

  tbody.innerHTML = pageItems.map(s => `
    <tr>
      <td><strong>${s.nama}</strong></td>
      <td>${s.kontak || '-'}</td>
      <td>${s.alamat || '-'}</td>
      <td><span class="badge ${s.is_active !== false ? 'aktif' : 'nonaktif'}">${s.is_active !== false ? 'Aktif' : 'Nonaktif'}</span></td>
      <td><button class="btn-sm" onclick="editSupplier(${s.id})">Edit</button> <button class="btn-danger btn-sm" onclick="hapusSupplier(${s.id})">Hapus</button></td>
    </tr>`).join('');

  renderPaginationBar('supplier-pagination', currentSupplierPage, filtered.length, SUPPLIER_PER_PAGE, 'changeSupplierPage');
}

function changeSupplierPage(delta) {
  const filtered = getFilteredSuppliers();
  const totalPages = Math.ceil(filtered.length / SUPPLIER_PER_PAGE);
  const target = currentSupplierPage + delta;
  if (target >= 1 && target <= totalPages) {
    currentSupplierPage = target;
    renderSupplierTable();
  }
}
window.changeSupplierPage = changeSupplierPage;

function populateReportSupplierOptions() {
  const sel = document.getElementById('filter-supplier');
  if (!sel) return;
  if (sel.tomselect) sel.tomselect.destroy();
  const currentVal = sel.value;
  sel.replaceChildren(new Option('Semua Supplier', 'all'));
  loadedSuppliers.forEach(s => {
    sel.add(new Option(s.nama, String(s.id)));
  });
  if (Array.from(sel.options).some(o => o.value === currentVal)) {
    sel.value = currentVal;
  } else {
    sel.value = 'all';
  }
  initTomSelect('filter-supplier');
  syncTomSelectVal('filter-supplier', sel.value);
}

function populateInvoiceSupplierOptions(selectedSupplierId = '') {
  const sel = document.getElementById('inv-supplier');
  if (!sel) return;
  if (sel.tomselect) sel.tomselect.destroy();
  sel.replaceChildren(new Option('-- Pilih Supplier --', ''));

  loadedSuppliers.filter(s => s.is_active !== false).forEach(s => {
    sel.add(new Option(s.nama, String(s.id)));
  });

  const selectedSupplier = loadedSuppliers.find(s => String(s.id) === String(selectedSupplierId));
  if (selectedSupplier && selectedSupplier.is_active === false) {
    sel.add(new Option(`${selectedSupplier.nama} (Nonaktif - data lama)`, String(selectedSupplier.id)));
  }

  sel.value = selectedSupplierId ? String(selectedSupplierId) : '';
  initTomSelect('inv-supplier');
  if (sel.value) {
    syncTomSelectVal('inv-supplier', sel.value);
  }
}

document.getElementById('form-supplier').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!ensureSupabaseReady()) return;

  const payload = {
    nama: document.getElementById('sup-nama').value.trim(),
    kontak: document.getElementById('sup-kontak').value.trim() || null,
    alamat: document.getElementById('sup-alamat').value.trim() || null,
    is_active: document.getElementById('sup-active').value === 'true'
  };

  const supplierId = document.getElementById('sup-id').value;
  const { error } = supplierId
    ? await db.from('suppliers').update(payload).eq('id', supplierId)
    : await db.from('suppliers').insert(payload);
  if (error) return toast('Gagal: ' + error.message, 'error');

  toast(supplierId ? 'Supplier berhasil diperbarui' : 'Supplier tersimpan ✓', 'success');
  e.target.reset();
  resetSupplierEdit();
  loadSuppliers();
  loadInvoices();
  loadPaymentHistory();
  loadDashboard();
  loadLaporan();
});

function resetSupplierEdit() {
  document.getElementById('sup-id').value = '';
  document.getElementById('sup-active').value = 'true';
  document.getElementById('btn-save-supplier').textContent = 'Simpan Supplier';
  document.getElementById('btn-cancel-supplier').hidden = true;
}

function editSupplier(id) {
  const supplier = loadedSuppliers.find(item => String(item.id) === String(id));
  if (!supplier) return toast('Supplier tidak ditemukan. Muat ulang daftar supplier.', 'error');

  document.getElementById('sup-id').value = supplier.id;
  document.getElementById('sup-nama').value = supplier.nama;
  document.getElementById('sup-kontak').value = supplier.kontak || '';
  document.getElementById('sup-alamat').value = supplier.alamat || '';
  document.getElementById('sup-active').value = String(supplier.is_active !== false);
  document.getElementById('btn-save-supplier').textContent = 'Perbarui Supplier';
  document.getElementById('btn-cancel-supplier').hidden = false;
}

window.editSupplier = editSupplier;
document.getElementById('btn-cancel-supplier').addEventListener('click', () => {
  document.getElementById('form-supplier').reset();
  resetSupplierEdit();
});

async function hapusSupplier(id) {
  if (!confirm('Hapus supplier ini? Semua faktur dan histori pembayaran terkait juga akan terhapus.')) return;
  if (!ensureSupabaseReady()) return;

  const { error } = await db.from('suppliers').delete().eq('id', id);
  if (error) return toast('Gagal: ' + error.message, 'error');
  toast('Supplier dihapus', 'success');

  loadSuppliers();
  loadInvoices();
  loadPaymentHistory();
  loadDashboard();
  loadLaporan();
}

// ====== DATA BARANG ======

// Ambil kategori dari localStorage (user-tambahan)
function getSavedCategories() {
  try { return JSON.parse(localStorage.getItem('saved_categories') || '[]'); }
  catch (e) { return []; }
}

function saveCategories(list) {
  localStorage.setItem('saved_categories', JSON.stringify(list));
}

// Semua kategori unik: dari localStorage + dari produk yang ada di DB
function getAllCategories() {
  const fromProducts = (loadedProducts || [])
    .map(p => p.kategori)
    .filter(k => k && k !== '-' && k.trim());
  const fromSaved = getSavedCategories();
  return Array.from(new Set([...fromSaved, ...fromProducts])).sort();
}

function updateCategorySuggestions() {
  const cats = getAllCategories();

  // Update dropdown select di form barang
  const categorySelect = document.getElementById('product-category');
  if (categorySelect) {
    if (categorySelect.tomselect) categorySelect.tomselect.destroy();
    const currentVal = categorySelect.value;
    categorySelect.replaceChildren(new Option('-- Pilih Kategori --', ''));
    cats.forEach(c => categorySelect.add(new Option(c, c)));
    if (Array.from(categorySelect.options).some(o => o.value === currentVal)) {
      categorySelect.value = currentVal;
    }
    initTomSelect('product-category', { create: true });
    if (categorySelect.value) {
      syncTomSelectVal('product-category', categorySelect.value);
    }
  }

  // Update chips di panel kelola kategori
  const chipsEl = document.getElementById('category-chips');
  if (chipsEl) {
    if (cats.length === 0) {
      chipsEl.innerHTML = '<span style="color:#94a3b8; font-size:12.5px;">Belum ada kategori. Tambahkan kategori baru di atas.</span>';
    } else {
      chipsEl.innerHTML = cats.map(c => `
        <span class="category-chip">
          ${c}
          <button type="button" class="chip-remove" onclick="hapusKategori('${c.replace(/'/g, "\\'")}')" title="Hapus kategori ini">×</button>
        </span>`).join('');
    }
  }

  // Update filter kategori di Laporan
  populateReportCategoryOptions();
}

function tambahKategori() {
  const input = document.getElementById('input-new-category');
  if (!input) return;
  const nama = input.value.trim();
  if (!nama) return toast('Ketik nama kategori terlebih dahulu.', 'error');

  const list = getSavedCategories();
  const allCats = getAllCategories();
  if (allCats.map(c => c.toLowerCase()).includes(nama.toLowerCase())) {
    return toast(`Kategori "${nama}" sudah ada.`, 'error');
  }
  list.push(nama);
  saveCategories(list);
  input.value = '';
  updateCategorySuggestions();
  toast(`Kategori "${nama}" ditambahkan ✓`, 'success');
}

function hapusKategori(nama) {
  const used = (loadedProducts || []).some(p => p.kategori === nama);
  if (used && !confirm(`Kategori "${nama}" dipakai oleh beberapa barang. Tetap hapus dari daftar?`)) return;

  const list = getSavedCategories().filter(c => c !== nama);
  saveCategories(list);
  updateCategorySuggestions();
  toast(`Kategori "${nama}" dihapus dari daftar.`, 'success');
}

window.tambahKategori = tambahKategori;
window.hapusKategori = hapusKategori;

async function loadProducts() {
  if (!ensureSupabaseReady()) return;

  const { data, error } = await db
    .from('products')
    .select('*')
    .order('nama', { ascending: true });
  if (error) return toast('Gagal load barang: ' + error.message, 'error');
  loadedProducts = data || [];

  currentProductPage = 1;
  renderProductTable();
  updateCategorySuggestions();
  populateInvoiceProductOptions();
}

function onProductSearch() {
  currentProductPage = 1;
  renderProductTable();
}
window.onProductSearch = onProductSearch;

function getFilteredProducts() {
  const query = (document.getElementById('search-product')?.value || '').toLowerCase().trim();
  if (!query) return loadedProducts;
  return loadedProducts.filter(p => {
    const statusStr = p.is_active ? 'aktif' : 'nonaktif';
    return (p.nama || '').toLowerCase().includes(query) ||
           (p.kategori || '').toLowerCase().includes(query) ||
           statusStr.includes(query);
  });
}

function renderProductTable() {
  const tbody = document.querySelector('#tabel-product tbody');
  if (!tbody) return;

  const filtered = getFilteredProducts();

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center">Belum ada barang yang cocok</td></tr>';
    renderPaginationBar('product-pagination', 1, 0, PRODUCT_PER_PAGE, 'changeProductPage');
    return;
  }

  const start = (currentProductPage - 1) * PRODUCT_PER_PAGE;
  const pageItems = filtered.slice(start, start + PRODUCT_PER_PAGE);

  tbody.innerHTML = pageItems.map(product => `
    <tr>
      <td><strong>${product.nama}</strong></td>
      <td>${product.kategori && product.kategori !== '-' ? product.kategori : '-'}</td>
      <td><span class="badge ${product.is_active ? 'aktif' : 'nonaktif'}">${product.is_active ? 'Aktif' : 'Nonaktif'}</span></td>
      <td><button class="btn-sm" onclick="editProduct(${product.id})">Edit</button> <button class="btn-danger btn-sm" onclick="hapusProduct(${product.id})">Hapus</button></td>
    </tr>`).join('');

  renderPaginationBar('product-pagination', currentProductPage, filtered.length, PRODUCT_PER_PAGE, 'changeProductPage');
}

function changeProductPage(delta) {
  const filtered = getFilteredProducts();
  const totalPages = Math.ceil(filtered.length / PRODUCT_PER_PAGE);
  const target = currentProductPage + delta;
  if (target >= 1 && target <= totalPages) {
    currentProductPage = target;
    renderProductTable();
  }
}
window.changeProductPage = changeProductPage;

function populateReportCategoryOptions() {
  const sel = document.getElementById('filter-category');
  if (!sel) return;
  if (sel.tomselect) sel.tomselect.destroy();
  const currentVal = sel.value;
  const cats = getAllCategories();
  sel.replaceChildren(new Option('Semua Kategori', 'all'));
  cats.forEach(c => sel.add(new Option(c, c)));
  if (Array.from(sel.options).some(o => o.value === currentVal)) {
    sel.value = currentVal;
  } else {
    sel.value = 'all';
  }
  initTomSelect('filter-category');
  syncTomSelectVal('filter-category', sel.value);
}

function populateInvoiceProductOptions(selectedProductId = '', legacyName = '') {
  const select = document.getElementById('inv-product');
  if (!select) return;
  if (select.tomselect) select.tomselect.destroy();
  select.replaceChildren(new Option('-- Pilih Barang Aktif --', ''));

  loadedProducts.filter(product => product.is_active).forEach(product => {
    const categoryInfo = product.kategori && product.kategori !== '-' ? ` (${product.kategori})` : '';
    select.add(new Option(`${product.nama}${categoryInfo}`, String(product.id)));
  });

  const selectedProduct = loadedProducts.find(product => String(product.id) === String(selectedProductId));
  if (selectedProduct && !selectedProduct.is_active) {
    select.add(new Option(`${selectedProduct.nama} (Nonaktif - faktur lama)`, String(selectedProduct.id)));
  } else if (legacyName && !selectedProductId) {
    select.add(new Option(`${legacyName} (Data faktur lama)`, 'legacy'));
  }

  select.value = selectedProductId ? String(selectedProductId) : legacyName ? 'legacy' : '';
  initTomSelect('inv-product');
  if (select.value) {
    syncTomSelectVal('inv-product', select.value);
  }
}

document.getElementById('form-product').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!ensureSupabaseReady()) return;

  const categoryVal = document.getElementById('product-category').value.trim() || '-';
  const productId = document.getElementById('product-id').value;
  const payload = {
    nama: document.getElementById('product-name').value.trim(),
    kategori: categoryVal,
    is_active: document.getElementById('product-active').value === 'true'
  };

  const result = productId
    ? await db.from('products').update(payload).eq('id', productId)
    : await db.from('products').insert(payload);
  if (result.error) return toast('Gagal menyimpan barang: ' + result.error.message, 'error');

  // Jika kategori baru, simpan ke saved_categories
  if (categoryVal && categoryVal !== '-') {
    const list = getSavedCategories();
    if (!getAllCategories().map(c => c.toLowerCase()).includes(categoryVal.toLowerCase())) {
      list.push(categoryVal);
      saveCategories(list);
    }
  }

  toast(productId ? 'Barang diperbarui ✓' : 'Barang ditambahkan ✓', 'success');
  event.target.reset();
  resetProductEdit();
  await loadProducts();
});

function resetProductEdit() {
  document.getElementById('product-id').value = '';
  syncTomSelectVal('product-category', '');
  document.getElementById('product-active').value = 'true';
  document.getElementById('btn-save-product').textContent = 'Simpan Barang';
  document.getElementById('btn-cancel-product').hidden = true;
}

function editProduct(id) {
  const product = loadedProducts.find(item => String(item.id) === String(id));
  if (!product) return toast('Barang tidak ditemukan.', 'error');
  document.getElementById('product-id').value = product.id;
  document.getElementById('product-name').value = product.nama;
  syncTomSelectVal('product-category', product.kategori && product.kategori !== '-' ? product.kategori : '');
  document.getElementById('product-active').value = String(product.is_active);
  document.getElementById('btn-save-product').textContent = 'Simpan Perubahan';
  document.getElementById('btn-cancel-product').hidden = false;
  // Scroll ke form
  document.getElementById('form-product')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

window.editProduct = editProduct;

async function hapusProduct(id) {
  if (!confirm('Hapus barang ini? Data faktur terkait akan tetap aman.')) return;
  if (!ensureSupabaseReady()) return;
  const { error } = await db.from('products').delete().eq('id', id);
  if (error) return toast('Gagal menghapus barang: ' + error.message, 'error');
  toast('Barang dihapus', 'success');

  loadProducts();
  loadInvoices();
}

window.hapusProduct = hapusProduct;

document.getElementById('btn-cancel-product').addEventListener('click', () => {
  document.getElementById('form-product').reset();
  resetProductEdit();
});

// ====== INVOICE ======

function updateInvoiceTotal() {
  const productSelect = document.getElementById('inv-product');
  const product = loadedProducts.find(item => String(item.id) === productSelect.value);

  if (product) document.getElementById('inv-nama-utang').value = product.nama;
  else if (productSelect.value !== 'legacy') document.getElementById('inv-nama-utang').value = '';
}

document.getElementById('inv-product').addEventListener('change', updateInvoiceTotal);

document.getElementById('form-invoice').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!ensureSupabaseReady()) return;

  const invoiceId = document.getElementById('inv-id').value;
  const selectedProductId = document.getElementById('inv-product').value;
  const selectedProduct = loadedProducts.find(item => String(item.id) === selectedProductId);
  const legacyProduct = selectedProductId === 'legacy';
  if (!selectedProduct && !legacyProduct) return toast('Pilih barang dari daftar barang aktif.', 'error');
  if (!invoiceId && selectedProduct && !selectedProduct.is_active) return toast('Barang nonaktif tidak bisa dipakai untuk faktur baru.', 'error');

  if (selectedProduct) {
    const { data: currentProduct, error: productError } = await db
      .from('products')
      .select('id, nama, is_active')
      .eq('id', selectedProduct.id)
      .single();
    if (productError) return toast('Gagal memeriksa status barang: ' + productError.message, 'error');
    if (!invoiceId && !currentProduct.is_active) return toast('Barang nonaktif tidak bisa dipakai untuk faktur baru.', 'error');
    document.getElementById('inv-nama-utang').value = currentProduct.nama;
  }

  const totalAmount = Number(document.getElementById('inv-total').value);
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) return toast('Total utang usaha harus lebih dari 0.', 'error');

  const syarat = document.getElementById('inv-syarat').value.trim();
  const parsed = parseSyaratPembayaran(syarat);
  const tglFaktur = document.getElementById('inv-tanggal').value;
  const jatuhTempo = document.getElementById('inv-jatuh-tempo').value;

  const payload = {
    nama_utang: document.getElementById('inv-nama-utang').value.trim(),
    product_id: selectedProduct ? Number(selectedProduct.id) : null,
    supplier_id: parseInt(document.getElementById('inv-supplier').value, 10),
    nomor_faktur: document.getElementById('inv-nomor').value.trim(),
    tanggal_faktur: tglFaktur,
    tanggal_jatuh_tempo: jatuhTempo,
    total_amount: totalAmount,
    syarat_pembayaran: syarat || null,
    diskon_persen: parsed.diskonPersen || 0,
    diskon_hari: parsed.diskonHari || 0,
    net_hari: parsed.netHari || null,
    keterangan: document.getElementById('inv-keterangan').value.trim() || null
  };

  const { error } = invoiceId
    ? await db.from('invoices').update(payload).eq('id', invoiceId)
    : await db.from('invoices').insert(payload);

  if (error) return toast('Gagal simpan faktur: ' + error.message, 'error');

  toast(invoiceId ? 'Faktur berhasil diperbarui ✓' : `Faktur tersimpan ✓ Jatuh tempo: ${formatTanggal(jatuhTempo)}`, 'success');
  e.target.reset();
  resetInvoiceEdit();
  loadInvoices();
  loadDashboard();
  loadLaporan();
});

function resetInvoiceEdit() {
  document.getElementById('inv-id').value = '';
  document.getElementById('btn-save-invoice').textContent = 'Simpan Faktur';
  document.getElementById('btn-cancel-invoice').hidden = true;
  syncTomSelectVal('inv-product', '');
  syncTomSelectVal('inv-supplier', '');
}

async function editInvoice(id) {
  const invoice = loadedInvoices.find(item => String(item.id) === String(id));
  if (!invoice) return toast('Faktur tidak ditemukan. Muat ulang daftar faktur.', 'error');
  if (loadedProducts.length === 0) await loadProducts();

  document.getElementById('inv-id').value = invoice.id;
  document.getElementById('inv-nama-utang').value = invoice.nama_utang || '';
  populateInvoiceProductOptions(invoice.product_id || '', invoice.product_id ? '' : invoice.nama_utang || '');
  syncTomSelectVal('inv-supplier', invoice.supplier_id);
  document.getElementById('inv-nomor').value = invoice.nomor_faktur;
  document.getElementById('inv-tanggal').value = invoice.tanggal_faktur;
  document.getElementById('inv-jatuh-tempo').value = invoice.tanggal_jatuh_tempo;
  document.getElementById('inv-total').value = invoice.total_amount || '';
  document.getElementById('inv-syarat').value = invoice.syarat_pembayaran || '';
  document.getElementById('inv-keterangan').value = invoice.keterangan || '';

  document.getElementById('btn-save-invoice').textContent = 'Perbarui Faktur';
  document.getElementById('btn-cancel-invoice').hidden = false;
  activateTab('invoice');
}

window.editInvoice = editInvoice;
document.getElementById('btn-cancel-invoice').addEventListener('click', () => {
  document.getElementById('form-invoice').reset();
  resetInvoiceEdit();
});

function loadInvoices() {
  if (!ensureSupabaseReady()) return;
  if (!invoicesLoadPromise) {
    invoicesLoadPromise = loadInvoicesData().finally(() => {
      invoicesLoadPromise = null;
    });
  }
  return invoicesLoadPromise;
}

async function loadInvoicesData() {
  const { data, error } = await db
    .from('invoices')
    .select('*, suppliers(nama), payments(*)')
    .order('id', { ascending: false });

  if (error) return toast('Gagal load faktur: ' + error.message, 'error');
  loadedInvoices = data || [];

  currentInvoicePage = 1;
  renderInvoiceTable();

  unpaidInvoices = (data || []).filter(inv => getInvoiceBalance(inv, inv.payments) > 0.009);
  const payInvEl = document.getElementById('pay-invoice');
  if (payInvEl) {
    if (payInvEl.tomselect) payInvEl.tomselect.destroy();
    payInvEl.innerHTML = '<option value="">-- Pilih nama utang usaha --</option>' + unpaidInvoices.map(inv => {
      const label = `${inv.nama_utang || 'Utang usaha'} | ${inv.suppliers?.nama || '-'} | ${inv.nomor_faktur} | Sisa ${formatRp(getInvoiceBalance(inv, inv.payments))}`;
      return `<option value="${inv.id}">${label}</option>`;
    }).join('');
    initTomSelect('pay-invoice');
  }
}

function onInvoiceSearch() {
  currentInvoicePage = 1;
  renderInvoiceTable();
}
window.onInvoiceSearch = onInvoiceSearch;

function getFilteredInvoices() {
  const query = (document.getElementById('search-invoice')?.value || '').toLowerCase().trim();
  if (!query) return loadedInvoices;
  return loadedInvoices.filter(inv => {
    const sisa = getInvoiceBalance(inv, inv.payments);
    const totalTerpakai = getInvoiceTotalApplied(inv.payments);
    const st = statusDinamis(inv, totalTerpakai, sisa);
    return (inv.nama_utang || '').toLowerCase().includes(query) ||
           (inv.suppliers?.nama || '').toLowerCase().includes(query) ||
           (inv.nomor_faktur || '').toLowerCase().includes(query) ||
           (inv.syarat_pembayaran || '').toLowerCase().includes(query) ||
           (inv.tanggal_faktur || '').includes(query) ||
           (inv.tanggal_jatuh_tempo || '').includes(query) ||
           st.label.toLowerCase().includes(query);
  });
}

function renderInvoiceTable() {
  const tbody = document.querySelector('#tabel-invoice tbody');
  if (!tbody) return;

  const filtered = getFilteredInvoices();

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="11" style="text-align:center">Belum ada faktur yang cocok</td></tr>';
    renderPaginationBar('invoice-pagination', 1, 0, INVOICE_PER_PAGE, 'changeInvoicePage');
    return;
  }

  const start = (currentInvoicePage - 1) * INVOICE_PER_PAGE;
  const pageItems = filtered.slice(start, start + INVOICE_PER_PAGE);

  tbody.innerHTML = pageItems.map(inv => {
    const totalTerpakai = getInvoiceTotalApplied(inv.payments);
    const sisa = getInvoiceBalance(inv, inv.payments);
    const st = statusDinamis(inv, totalTerpakai, sisa);

    return `
      <tr>
        <td><strong>${inv.nama_utang || '-'}</strong></td>
        <td>${inv.suppliers?.nama || '-'}</td>
        <td>${inv.nomor_faktur}</td>
        <td>${formatTanggal(inv.tanggal_faktur)}</td>
        <td>${formatTanggal(inv.tanggal_jatuh_tempo)}</td>
        <td>${formatRp(inv.total_amount)}</td>
        <td>${formatSyarat(inv.syarat_pembayaran)}</td>
        <td>${formatRp(sisa)}</td>
        <td><span class="badge ${st.cls}">${st.label}</span></td>
        <td>${inv.keterangan || '-'}</td>
        <td><button class="btn-sm" onclick="editInvoice(${inv.id})">Edit</button> <button class="btn-danger btn-sm" onclick="hapusInvoice(${inv.id})">Hapus</button></td>
      </tr>`;
  }).join('');

  renderPaginationBar('invoice-pagination', currentInvoicePage, filtered.length, INVOICE_PER_PAGE, 'changeInvoicePage');
}

function changeInvoicePage(delta) {
  const filtered = getFilteredInvoices();
  const totalPages = Math.ceil(filtered.length / INVOICE_PER_PAGE);
  const target = currentInvoicePage + delta;
  if (target >= 1 && target <= totalPages) {
    currentInvoicePage = target;
    renderInvoiceTable();
  }
}
window.changeInvoicePage = changeInvoicePage;

async function hapusInvoice(id) {
  if (!confirm('Hapus faktur ini?')) return;
  if (!ensureSupabaseReady()) return;

  const { error } = await db.from('invoices').delete().eq('id', id);
  if (error) return toast('Gagal: ' + error.message, 'error');
  toast('Faktur dihapus', 'success');

  loadInvoices();
  loadDashboard();
}

// ====== PAYMENT ======

function renderPaymentInfo() {
  const infoBox = document.getElementById('pay-info');
  const feeField = document.getElementById('pay-denda-field');
  const invoice = selectedPaymentInvoice;
  if (!invoice) {
    infoBox.hidden = true;
    feeField.hidden = true;
    document.getElementById('pay-total-denda').value = '';
    return;
  }

  const editingPaymentId = document.getElementById('pay-id').value;
  const payments = editingPaymentId
    ? (invoice.payments || []).filter(payment => String(payment.id) !== editingPaymentId)
    : invoice.payments;
  const dibayar = getInvoiceTotalPaid(payments);
  const sisa = getInvoiceBalance(invoice, payments);
  const tanggalBayar = document.getElementById('pay-tanggal').value;
  const telat = Boolean(tanggalBayar) && tanggalBayar > invoice.tanggal_jatuh_tempo;
  feeField.hidden = !telat;
  if (!telat) document.getElementById('pay-total-denda').value = '';
  const jumlahInput = Number(document.getElementById('pay-jumlah').value) || null;
  const pokokTersisa = Math.max(0, Number(invoice.total_amount) - getInvoiceTotalApplied(payments));
  const parsedTerms = parseSyaratPembayaran(invoice.syarat_pembayaran);
  const disk = tanggalBayar ? hitungDiskon(invoice, tanggalBayar, pokokTersisa, jumlahInput) : null;
  const sisaHari = diffDays(invoice.tanggal_jatuh_tempo);
  const diskonInfo = !disk || parsedTerms.diskonBertingkat.length === 0
    ? ''
    : disk.menungguJumlahBayar
      ? `<br>Diskon ${disk.diskonPersen}% berlaku pada nominal utang usaha yang dilunasi selama periode syarat.`
      : disk.berhak
        ? `<br>Utang usaha dilunasi: <b>${formatRp(disk.nominalUtangDilunasi)}</b> | Diskon: <b>${formatRp(disk.diskonRp)}</b> (${disk.diskonPersen}%)`
        : '<br>Pembayaran tidak berada pada periode diskon.';

  infoBox.innerHTML = `
    <strong>${invoice.nama_utang || 'Utang usaha'} — ${invoice.suppliers?.nama || '-'}</strong><br>
    No. faktur: ${invoice.nomor_faktur}<br>
    Total: ${formatRp(invoice.total_amount)} | Dibayar: ${formatRp(dibayar)} | Sisa: <b>${formatRp(sisa)}</b><br>
    Jatuh tempo: ${formatTanggal(invoice.tanggal_jatuh_tempo)} (${sisaHari >= 0 ? sisaHari + ' hari lagi' : 'TERLAMBAT ' + Math.abs(sisaHari) + ' hari'})<br>
    Syarat: <b>${formatSyarat(invoice.syarat_pembayaran)}</b>${diskonInfo}
  `;
  infoBox.hidden = false;
}

async function openPaymentForInvoice(invoiceId) {
  let invoice = unpaidInvoices.find(item => String(item.id) === String(invoiceId));
  if (!invoice) {
    await loadInvoices();
    invoice = unpaidInvoices.find(item => String(item.id) === String(invoiceId));
  }
  if (!invoice) return toast('Faktur ini sudah tidak memiliki sisa utang usaha.', 'error');

  document.getElementById('form-payment').reset();
  resetPaymentEdit();
  syncTomSelectVal('pay-invoice', String(invoice.id), false);
  const invoiceSelect = document.getElementById('pay-invoice');
  invoiceSelect.dispatchEvent(new Event('change', { bubbles: true }));
  activateTab('payment');
}

window.openPaymentForInvoice = openPaymentForInvoice;

document.getElementById('pay-invoice').addEventListener('change', (e) => {
  const selected = unpaidInvoices.find(inv => String(inv.id) === e.target.value);
  selectedPaymentInvoice = selected || null;
  if (!document.getElementById('pay-id').value) {
    document.getElementById('pay-total-denda').value = '';
  }
  renderPaymentInfo();
});

document.getElementById('pay-tanggal').addEventListener('change', renderPaymentInfo);
document.getElementById('pay-jumlah').addEventListener('input', renderPaymentInfo);

document.getElementById('form-payment').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!ensureSupabaseReady()) return;

  const invoiceId = document.getElementById('pay-invoice').value;
  const paymentId = document.getElementById('pay-id').value;
  const bayar = Number(document.getElementById('pay-jumlah').value);
  const tanggalBayar = document.getElementById('pay-tanggal').value;
  const metode = document.getElementById('pay-metode').value;
  const keterangan = document.getElementById('pay-keterangan').value.trim();

  if (!invoiceId || !bayar || !tanggalBayar) {
    return toast('Pilih faktur dan isi jumlah pembayaran.', 'error');
  }

  const { data: inv, error: invError } = await db
    .from('invoices')
    .select('*, suppliers(nama), payments(*)')
    .eq('id', invoiceId)
    .single();

  if (invError) return toast('Gagal load faktur: ' + invError.message, 'error');

  const previousPayments = paymentId
    ? (inv.payments || []).filter(payment => String(payment.id) !== paymentId)
    : inv.payments;
  const sisaSebelum = getInvoiceBalance(inv, previousPayments);
  const dendaBaru = tanggalBayar > inv.tanggal_jatuh_tempo
    ? Math.max(0, Number(document.getElementById('pay-total-denda').value) || 0)
    : 0;
  const totalTagihan = sisaSebelum + dendaBaru;
  if (bayar > totalTagihan + 0.01) {
    return toast(`Pembayaran melebihi sisa tagihan ${formatRp(totalTagihan)}.`, 'error');
  }
  const pokokTersisa = Math.max(0, Number(inv.total_amount) - getInvoiceTotalApplied(previousPayments));
  const disk = hitungDiskon(inv, tanggalBayar, pokokTersisa, bayar);

  const payload = {
    invoice_id: invoiceId,
    tanggal_bayar: tanggalBayar,
    jumlah_bayar: bayar,
    diskon_didapat: disk.berhak ? disk.diskonRp : 0,
    denda_dikenakan: dendaBaru,
    metode,
    keterangan: keterangan || null
  };

  const { error } = paymentId
    ? await db.from('payments').update(payload).eq('id', paymentId)
    : await db.from('payments').insert(payload);

  if (error) return toast('Gagal simpan pembayaran: ' + error.message, 'error');

  const sisaSesudah = Math.max(0, totalTagihan - bayar - (disk.berhak ? disk.diskonRp : 0));
  toast(paymentId ? 'Pembayaran berhasil diperbarui ✓' : sisaSesudah <= 0.01 && disk.diskonRp > 0
    ? `Pembayaran tersimpan. Faktur lunas dengan diskon ${formatRp(disk.diskonRp)} ✓`
    : 'Pembayaran tersimpan ✓', 'success');
  e.target.reset();
  syncTomSelectVal('pay-invoice', '');
  resetPaymentEdit();
  selectedPaymentInvoice = null;
  renderPaymentInfo();
  loadInvoices();
  loadPaymentHistory();
  loadDashboard();
  loadLaporan();
});

async function loadPaymentHistory() {
  if (!ensureSupabaseReady()) return;

  const { data, error } = await db
    .from('payments')
    .select('*, invoices(nama_utang, nomor_faktur, suppliers(nama))')
    .order('tanggal_bayar', { ascending: false });

  if (error) return toast('Gagal load riwayat pembayaran: ' + error.message, 'error');

  loadedPaymentHistory = data || [];
  currentPaymentPage = 1;
  renderPaymentTable();
}

function onPaymentSearch() {
  currentPaymentPage = 1;
  renderPaymentTable();
}
window.onPaymentSearch = onPaymentSearch;

function getFilteredPayments() {
  const query = (document.getElementById('search-payment')?.value || '').toLowerCase().trim();
  if (!query) return loadedPaymentHistory;
  return loadedPaymentHistory.filter(p => {
    const inv = p.invoices || {};
    return (inv.nama_utang || '').toLowerCase().includes(query) ||
           (inv.nomor_faktur || '').toLowerCase().includes(query) ||
           (inv.suppliers?.nama || '').toLowerCase().includes(query) ||
           (p.metode || '').toLowerCase().includes(query) ||
           (p.keterangan || '').toLowerCase().includes(query) ||
           (p.tanggal_bayar || '').includes(query);
  });
}

function renderPaymentTable() {
  const tbody = document.querySelector('#tabel-payment tbody');
  if (!tbody) return;

  const filtered = getFilteredPayments();

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center">Belum ada pembayaran yang cocok</td></tr>';
    renderPaginationBar('payment-pagination', 1, 0, PAYMENT_PER_PAGE, 'changePaymentPage');
    return;
  }

  const start = (currentPaymentPage - 1) * PAYMENT_PER_PAGE;
  const pageItems = filtered.slice(start, start + PAYMENT_PER_PAGE);

  tbody.innerHTML = pageItems.map(p => {
    const inv = p.invoices || {};
    const supplier = inv.suppliers?.nama || '-';
    const nomor = inv.nomor_faktur || '-';
    const namaUtang = inv.nama_utang || '-';

    return `
      <tr>
        <td>${formatTanggal(p.tanggal_bayar)}</td>
        <td>${namaUtang}</td>
        <td>${nomor}</td>
        <td>${supplier}</td>
        <td>${formatRp(p.jumlah_bayar)}</td>
        <td>${formatRp(p.diskon_didapat)}</td>
        <td>${formatRp(p.denda_dikenakan)}</td>
        <td>${p.metode || '-'}</td>
        <td>${p.keterangan || '-'}</td>
        <td><button class="btn-sm" onclick="editPayment(${p.id})">Edit</button> <button class="btn-danger btn-sm" onclick="hapusPembayaran(${p.id})">Hapus</button></td>
      </tr>`;
  }).join('');

  renderPaginationBar('payment-pagination', currentPaymentPage, filtered.length, PAYMENT_PER_PAGE, 'changePaymentPage');
}

function changePaymentPage(delta) {
  const filtered = getFilteredPayments();
  const totalPages = Math.ceil(filtered.length / PAYMENT_PER_PAGE);
  const target = currentPaymentPage + delta;
  if (target >= 1 && target <= totalPages) {
    currentPaymentPage = target;
    renderPaymentTable();
  }
}
window.changePaymentPage = changePaymentPage;

async function hapusPembayaran(id) {
  if (!confirm('Hapus transaksi pembayaran ini? Saldo utang usaha akan dihitung ulang.')) return;
  if (!ensureSupabaseReady()) return;

  const { error } = await db.from('payments').delete().eq('id', id);
  if (error) return toast('Gagal hapus pembayaran: ' + error.message, 'error');
  toast('Pembayaran dihapus', 'success');

  loadInvoices();
  loadPaymentHistory();
  loadDashboard();
  loadLaporan();
}

async function editPayment(id) {
  if (!ensureSupabaseReady()) return;

  const { data: payment, error } = await db.from('payments').select('*').eq('id', id).single();
  if (error) return toast('Gagal membuka pembayaran: ' + error.message, 'error');

  let invoice = loadedInvoices.find(item => String(item.id) === String(payment.invoice_id));
  if (!invoice) {
    const result = await db.from('invoices')
      .select('*, suppliers(nama), payments(id, jumlah_bayar, diskon_didapat, denda_dikenakan)')
      .eq('id', payment.invoice_id)
      .single();
    if (result.error) return toast('Gagal membuka faktur pembayaran: ' + result.error.message, 'error');
    invoice = result.data;
    loadedInvoices.push(invoice);
  }

  const invoiceSelect = document.getElementById('pay-invoice');
  if (!Array.from(invoiceSelect.options).some(option => option.value === String(invoice.id))) {
    if (invoiceSelect.tomselect) invoiceSelect.tomselect.destroy();
    const option = document.createElement('option');
    option.value = invoice.id;
    option.textContent = `${invoice.nama_utang || 'Utang usaha'} | ${invoice.suppliers?.nama || '-'} | ${invoice.nomor_faktur}`;
    invoiceSelect.append(option);
    initTomSelect('pay-invoice');
  }

  document.getElementById('pay-id').value = payment.id;
  syncTomSelectVal('pay-invoice', String(invoice.id));
  document.getElementById('pay-tanggal').value = payment.tanggal_bayar;
  document.getElementById('pay-jumlah').value = payment.jumlah_bayar;
  document.getElementById('pay-total-denda').value = payment.denda_dikenakan || '';
  document.getElementById('pay-metode').value = payment.metode || 'transfer';
  document.getElementById('pay-keterangan').value = payment.keterangan || '';

  selectedPaymentInvoice = invoice;
  document.getElementById('btn-save-payment').textContent = 'Perbarui Pembayaran';
  document.getElementById('btn-cancel-payment').hidden = false;
  renderPaymentInfo();
  activateTab('payment');
}

window.editPayment = editPayment;

function resetPaymentEdit() {
  document.getElementById('pay-id').value = '';
  document.getElementById('btn-save-payment').textContent = 'Simpan Pembayaran';
  document.getElementById('btn-cancel-payment').hidden = true;
}

document.getElementById('btn-cancel-payment').addEventListener('click', () => {
  document.getElementById('form-payment').reset();
  syncTomSelectVal('pay-invoice', '');
  selectedPaymentInvoice = null;
  resetPaymentEdit();
  renderPaymentInfo();
});

// ====== DASHBOARD ======
// ====== DASHBOARD: NOTIFIKASI & RIWAYAT AKTIVITAS ======
let cachedNotifications = [];
let currentNotifPage = 1;
const NOTIF_PER_PAGE = 5;

let cachedActivities = [];
let currentActivityPage = 1;
const ACTIVITY_PER_PAGE = 5;

async function logActivity(type, description) {
  const item = { id: Date.now(), type, description, created_at: new Date().toISOString() };
  
  // 1. Simpan ke local storage selalu (sebagai cache / offline fallback)
  try {
    const list = JSON.parse(localStorage.getItem('local_activity_logs') || '[]');
    list.unshift(item);
    if (list.length > 100) list.length = 100;
    localStorage.setItem('local_activity_logs', JSON.stringify(list));
  } catch (err) {}

  // 2. Simpan ke Supabase jika tabel activity_logs tersedia
  if (db) {
    try {
      const { error } = await db.from('activity_logs').insert({ type, description });
      if (error && error.code !== 'PGRST205') {
        console.warn('Gagal menyimpan activity log ke Supabase:', error.message);
      }
    } catch (err) {}
  }

  await loadActivityLogs();
}

async function loadDashboard() {
  if (!ensureSupabaseReady()) return;

  const { data, error } = await db
    .from('invoices')
    .select('*, suppliers(nama), payments(jumlah_bayar, diskon_didapat, denda_dikenakan)');

  if (error) return toast('Gagal load dashboard: ' + error.message, 'error');

  const batasDekatTempo = 7;
  const batasDekatDiskon = 7;
  const notifications = [];

  data.forEach(invoice => {
    const balance = getInvoiceBalance(invoice, invoice.payments);
    if (balance <= 0.009) return;

    const daysToDue = diffDays(invoice.tanggal_jatuh_tempo);
    const parsed = parseSyaratPembayaran(invoice.syarat_pembayaran);
    const discountAnchor = parsed.hasEom
      ? hitungTanggalJatuhTempo(invoice.tanggal_faktur, { jatuhTempoMode: 'eom' })
      : invoice.tanggal_faktur;
    const daysFromDiscountAnchor = -diffDays(discountAnchor);
    const activeDiscount = parsed.diskonBertingkat.find(tier =>
      daysFromDiscountAnchor >= 0 && daysFromDiscountAnchor <= tier.diskonHari
    );
    const discountDeadline = activeDiscount
      ? addDays(discountAnchor, activeDiscount.diskonHari)
      : null;
    const daysToDiscountDeadline = discountDeadline ? diffDays(discountDeadline) : null;
    const details = {
      invoice,
      balance,
      dueDate: formatTanggal(invoice.tanggal_jatuh_tempo),
      discountDate: discountDeadline ? formatTanggal(discountDeadline) : '-'
    };

    if (daysToDue < 0) {
      notifications.push({
        ...details,
        kind: 'overdue',
        sortOrder: daysToDue,
        label: 'Terlambat',
        noticeDate: details.dueDate,
        message: `Jatuh tempo lewat ${Math.abs(daysToDue)} hari`
      });
    } else if (daysToDue <= batasDekatTempo) {
      notifications.push({
        ...details,
        kind: 'due-soon',
        sortOrder: daysToDue,
        label: 'Jatuh tempo',
        noticeDate: details.dueDate,
        message: daysToDue === 0 ? 'Jatuh tempo hari ini' : `Jatuh tempo dalam ${daysToDue} hari`
      });
    }

    if (activeDiscount && daysToDiscountDeadline <= batasDekatDiskon) {
      notifications.push({
        ...details,
        kind: 'discount-soon',
        sortOrder: Math.max(0, daysToDiscountDeadline) - 0.5,
        label: `Diskon ${activeDiscount.diskonPersen}%`,
        noticeDate: details.discountDate,
        message: daysToDiscountDeadline === 0
          ? 'Batas diskon berakhir hari ini'
          : `Batas diskon berakhir dalam ${daysToDiscountDeadline} hari`
      });
    }
  });

  notifications.sort((first, second) => first.sortOrder - second.sortOrder);
  cachedNotifications = notifications;
  document.getElementById('notification-count').textContent = notifications.length;
  currentNotifPage = 1;
  renderDashboardNotificationsPage();

  loadActivityLogs();
}

function renderDashboardNotificationsPage() {
  const feed = document.getElementById('dashboard-notifications');
  if (!feed) return;

  if (cachedNotifications.length === 0) {
    feed.innerHTML = '<div class="notification-empty"><strong>Tidak ada yang mendesak</strong><br>Utang usaha belum lunas yang mendekati jatuh tempo atau batas diskon akan muncul di sini.</div>';
    document.getElementById('notif-pagination').innerHTML = '';
    return;
  }

  const start = (currentNotifPage - 1) * NOTIF_PER_PAGE;
  const pageItems = cachedNotifications.slice(start, start + NOTIF_PER_PAGE);

  feed.innerHTML = pageItems.map(notification => `
    <article class="notification-item ${notification.kind}">
      <span aria-hidden="true"></span>
      <div class="notification-copy">
        <div class="notification-topline">
          <span class="notification-label">${notification.label}</span>
          <time>${notification.noticeDate}</time>
        </div>
        <h3>${notification.invoice.nama_utang || 'Utang usaha tanpa nama'}</h3>
        <p>${notification.invoice.suppliers?.nama || '-'} · Faktur ${notification.invoice.nomor_faktur}</p>
        <p>${notification.message}</p>
      </div>
      <div class="notification-balance"><span>Sisa utang usaha</span><strong>${formatRp(notification.balance)}</strong></div>
      <button class="notification-action" type="button" onclick="openPaymentForInvoice(${Number(notification.invoice.id)})">Catat pembayaran</button>
    </article>`).join('');

  const totalPages = Math.ceil(cachedNotifications.length / NOTIF_PER_PAGE);
  const pContainer = document.getElementById('notif-pagination');
  if (totalPages <= 1) {
    pContainer.innerHTML = '';
  } else {
    pContainer.innerHTML = `
      <div class="pagination-wrap">
        <button type="button" class="btn btn-secondary btn-sm" onclick="changeNotifPage(-1)" ${currentNotifPage <= 1 ? 'disabled' : ''}>&larr; Sebelumnya</button>
        <span class="pagination-info">Halaman <strong>${currentNotifPage}</strong> dari <strong>${totalPages}</strong> (Total: ${cachedNotifications.length})</span>
        <button type="button" class="btn btn-secondary btn-sm" onclick="changeNotifPage(1)" ${currentNotifPage >= totalPages ? 'disabled' : ''}>Selanjutnya &rarr;</button>
      </div>`;
  }
}

function changeNotifPage(delta) {
  const totalPages = Math.ceil(cachedNotifications.length / NOTIF_PER_PAGE);
  const target = currentNotifPage + delta;
  if (target >= 1 && target <= totalPages) {
    currentNotifPage = target;
    renderDashboardNotificationsPage();
  }
}
window.changeNotifPage = changeNotifPage;

async function resetActivityLogs() {
  cachedActivities = [];
  try {
    localStorage.removeItem('local_activity_logs');
  } catch (e) {}
  if (db) {
    try {
      await db.from('activity_logs').delete().gte('id', 0);
    } catch (e) {}
  }
  const countEl = document.getElementById('activity-count');
  if (countEl) countEl.textContent = 0;
  currentActivityPage = 1;
  renderDashboardActivitiesPage();
  toast('Riwayat aktivitas berhasil dibersihkan ✓', 'success');
}
window.resetActivityLogs = resetActivityLogs;

async function loadActivityLogs() {
  let logs = [];

  if (db) {
    try {
      const { data, error } = await db
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && Array.isArray(data) && data.length > 0) {
        logs = data;
        try {
          localStorage.setItem('local_activity_logs', JSON.stringify(logs));
        } catch (e) {}
      }
    } catch (err) {}
  }

  // Jika di database tidak ada activity_logs dan data transaksi (invoices) juga kosong,
  // bersihkan cache lokal agar data lama tidak muncul kembali.
  if (logs.length === 0 && db) {
    let sourceInvoices = loadedInvoices;
    if (!sourceInvoices || sourceInvoices.length === 0) {
      try {
        const res = await db.from('invoices').select('*, suppliers(nama), payments(*)').order('id', { ascending: false });
        if (!res.error && res.data) {
          sourceInvoices = res.data;
        }
      } catch (err) {}
    }

    if (!sourceInvoices || sourceInvoices.length === 0) {
      // Database benar-benar kosong: bersihkan local storage
      try {
        localStorage.removeItem('local_activity_logs');
      } catch (e) {}
      logs = [];
    } else {
      // Jika ada faktur di DB, baru kita turunkan riwayat dari faktur tersebut
      const derivedLogs = [];
      sourceInvoices.forEach(inv => {
        const supName = inv.suppliers?.nama || 'Supplier';
        derivedLogs.push({
          id: 'inv-' + inv.id,
          type: 'Tambah Faktur',
          description: `Menambahkan Faktur #${inv.nomor_faktur} (${inv.nama_utang || 'Utang'}) dari ${supName} - Total: ${formatRp(inv.total_amount)}`,
          created_at: inv.created_at || inv.tanggal_faktur || new Date().toISOString()
        });
        (inv.payments || []).forEach(p => {
          derivedLogs.push({
            id: 'pay-' + p.id,
            type: 'Tambah Pembayaran',
            description: `Mencatat pembayaran ${formatRp(p.jumlah_bayar)} via ${p.metode || 'transfer'} untuk Faktur #${inv.nomor_faktur} (${inv.nama_utang || ''})`,
            created_at: p.created_at || p.tanggal_bayar || new Date().toISOString()
          });
        });
      });

      derivedLogs.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      logs = derivedLogs;
      try {
        localStorage.setItem('local_activity_logs', JSON.stringify(logs));
      } catch (e) {}
    }
  }

  if (logs.length === 0 && !db) {
    try {
      logs = JSON.parse(localStorage.getItem('local_activity_logs') || '[]');
    } catch (err) {
      logs = [];
    }
  }

  cachedActivities = logs;
  const countEl = document.getElementById('activity-count');
  if (countEl) countEl.textContent = cachedActivities.length;
  currentActivityPage = 1;
  renderDashboardActivitiesPage();
}

function renderDashboardActivitiesPage() {
  const feed = document.getElementById('dashboard-activities');
  if (!feed) return;

  if (cachedActivities.length === 0) {
    feed.innerHTML = '<div class="notification-empty">Belum ada riwayat aktivitas penambahan, edit, atau hapus transaksi.</div>';
    document.getElementById('activity-pagination').innerHTML = '';
    return;
  }

  const start = (currentActivityPage - 1) * ACTIVITY_PER_PAGE;
  const pageItems = cachedActivities.slice(start, start + ACTIVITY_PER_PAGE);

  feed.innerHTML = pageItems.map(act => {
    let cls = 'edit';
    const typeLower = (act.type || '').toLowerCase();
    if (typeLower.includes('tambah')) cls = 'tambah';
    else if (typeLower.includes('hapus')) cls = 'hapus';

    return `
      <div class="activity-item ${cls}">
        <div class="activity-main">
          <div class="activity-topline">
            <span class="activity-badge">${act.type || 'Aktivitas'}</span>
          </div>
          <div class="activity-desc">${act.description}</div>
        </div>
        <div class="activity-time">${formatWaktu(act.created_at)}</div>
      </div>`;
  }).join('');

  const totalPages = Math.ceil(cachedActivities.length / ACTIVITY_PER_PAGE);
  const pContainer = document.getElementById('activity-pagination');
  if (totalPages <= 1) {
    pContainer.innerHTML = '';
  } else {
    pContainer.innerHTML = `
      <div class="pagination-wrap">
        <button type="button" class="btn btn-secondary btn-sm" onclick="changeActivityPage(-1)" ${currentActivityPage <= 1 ? 'disabled' : ''}>&larr; Sebelumnya</button>
        <span class="pagination-info">Halaman <strong>${currentActivityPage}</strong> dari <strong>${totalPages}</strong> (Total: ${cachedActivities.length})</span>
        <button type="button" class="btn btn-secondary btn-sm" onclick="changeActivityPage(1)" ${currentActivityPage >= totalPages ? 'disabled' : ''}>Selanjutnya &rarr;</button>
      </div>`;
  }
}

function changeActivityPage(delta) {
  const totalPages = Math.ceil(cachedActivities.length / ACTIVITY_PER_PAGE);
  const target = currentActivityPage + delta;
  if (target >= 1 && target <= totalPages) {
    currentActivityPage = target;
    renderDashboardActivitiesPage();
  }
}
window.changeActivityPage = changeActivityPage;



function formatWaktu(isoStr) {
  if (!isoStr) return '-';
  try {
    const d = new Date(isoStr);
    const dateStr = d.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    return `${dateStr} ${timeStr}`;
  } catch (e) {
    return isoStr;
  }
}

function hitungHariAntartanggal(tanggalAwal, tanggalAkhir) {
  const [tahunAwal, bulanAwal, hariAwal] = tanggalAwal.split('-').map(Number);
  const [tahunAkhir, bulanAkhir, hariAkhir] = tanggalAkhir.split('-').map(Number);
  const awal = Date.UTC(tahunAwal, bulanAwal - 1, hariAwal);
  const akhir = Date.UTC(tahunAkhir, bulanAkhir - 1, hariAkhir);
  return Math.round((akhir - awal) / 86400000);
}

function getInvoiceSettlementDate(invoice, payments = []) {
  let balance = Number(invoice.total_amount || 0);
  const orderedPayments = [...(payments || [])].sort((first, second) =>
    String(first.tanggal_bayar).localeCompare(String(second.tanggal_bayar))
  );

  for (const payment of orderedPayments) {
    balance += Number(payment.denda_dikenakan || 0);
    balance -= Number(payment.jumlah_bayar || 0) + Number(payment.diskon_didapat || 0);
    if (balance <= 0.009) return payment.tanggal_bayar;
  }
  return null;
}

function getReportDayMetrics(invoice, payments, balance) {
  const settlementDate = balance <= 0.009 ? getInvoiceSettlementDate(invoice, payments) : null;
  if (settlementDate) {
    const settlementOffset = hitungHariAntartanggal(invoice.tanggal_jatuh_tempo, settlementDate);
    return {
      sisaHari: Math.max(0, -settlementOffset),
      hariLewatTempo: Math.max(0, settlementOffset)
    };
  }

  const daysToDue = diffDays(invoice.tanggal_jatuh_tempo);
  return {
    sisaHari: balance > 0.009 ? Math.max(0, daysToDue) : 0,
    hariLewatTempo: balance > 0.009 ? Math.max(0, -daysToDue) : 0
  };
}

// ====== LAPORAN DENGAN FILTER & PENGELOMPOKAN ======
function setLaporanPeriod(periodType) {
  const startInput = document.getElementById('filter-start-date');
  const endInput = document.getElementById('filter-end-date');
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth(); // 0-indexed

  if (periodType === 'all') {
    startInput.value = '';
    endInput.value = '';
  } else if (periodType === 'this_month') {
    const firstDay = new Date(Date.UTC(year, month, 1)).toISOString().split('T')[0];
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).toISOString().split('T')[0];
    startInput.value = firstDay;
    endInput.value = lastDay;
  } else if (periodType === 'last_month') {
    const firstDay = new Date(Date.UTC(year, month - 1, 1)).toISOString().split('T')[0];
    const lastDay = new Date(Date.UTC(year, month, 0)).toISOString().split('T')[0];
    startInput.value = firstDay;
    endInput.value = lastDay;
  } else if (periodType === 'this_year') {
    startInput.value = `${year}-01-01`;
    endInput.value = `${year}-12-31`;
  }

  loadLaporan();
}

function resetLaporanFilter() {
  if (document.getElementById('filter-status')) document.getElementById('filter-status').value = 'all';
  syncTomSelectVal('filter-supplier', 'all');
  syncTomSelectVal('filter-category', 'all');
  if (document.getElementById('filter-date-type')) document.getElementById('filter-date-type').value = 'tanggal_faktur';
  if (document.getElementById('filter-start-date')) document.getElementById('filter-start-date').value = '';
  if (document.getElementById('filter-end-date')) document.getElementById('filter-end-date').value = '';
  loadLaporan();
}

window.setLaporanPeriod = setLaporanPeriod;
window.resetLaporanFilter = resetLaporanFilter;

function onLaporanSearch() {
  currentLaporanPage = 1;
  loadLaporan();
}
window.onLaporanSearch = onLaporanSearch;

async function loadLaporan() {
  if (!ensureSupabaseReady()) return;

  const { data, error } = await db
    .from('invoices')
    .select('*, suppliers(id, nama), products(id, nama, kategori), payments(*)')
    .order('tanggal_jatuh_tempo', { ascending: true });

  if (error) {
    console.error('Laporan error:', error);
    return toast('Gagal load laporan: ' + error.message, 'error');
  }

  const filterStatus   = document.getElementById('filter-status')?.value   || 'all';
  const filterSupplier = document.getElementById('filter-supplier')?.value || 'all';
  const filterCategory = document.getElementById('filter-category')?.value || 'all';
  const filterDateType = document.getElementById('filter-date-type')?.value || 'tanggal_faktur';
  const startDate      = document.getElementById('filter-start-date')?.value || '';
  const endDate        = document.getElementById('filter-end-date')?.value   || '';
  const searchKeyword  = (document.getElementById('search-laporan')?.value || '').toLowerCase().trim();

  const rows = (data || []).filter(inv => {
    const sisa = getInvoiceBalance(inv, inv.payments);

    // 1. Filter Status
    if (filterStatus === 'belum_lunas' && sisa <= 0.009) return false;
    if (filterStatus === 'lunas'       && sisa >  0.009) return false;
    if (filterStatus === 'jatuh_tempo' && (sisa <= 0.009 || diffDays(inv.tanggal_jatuh_tempo) >= 0)) return false;

    // 2. Filter Supplier
    if (filterSupplier !== 'all') {
      const invSupId = inv.supplier_id || inv.suppliers?.id;
      if (String(invSupId) !== String(filterSupplier)) return false;
    }

    // 3. Filter Kategori Barang
    if (filterCategory !== 'all') {
      const prodKategori = inv.products?.kategori || '-';
      if (prodKategori !== filterCategory) return false;
    }

    // 4. Filter Tanggal
    const targetDate = inv[filterDateType];
    if (targetDate) {
      if (startDate && targetDate < startDate) return false;
      if (endDate   && targetDate > endDate)   return false;
    }

    // 5. Filter Kata Kunci Pencarian
    if (searchKeyword) {
      const totalTerpakai = getInvoiceTotalApplied(inv.payments);
      const st = statusDinamis(inv, totalTerpakai, sisa);
      const matches = (inv.nama_utang || '').toLowerCase().includes(searchKeyword) ||
                      (inv.nomor_faktur || '').toLowerCase().includes(searchKeyword) ||
                      (inv.suppliers?.nama || '').toLowerCase().includes(searchKeyword) ||
                      (inv.syarat_pembayaran || '').toLowerCase().includes(searchKeyword) ||
                      (inv.tanggal_faktur || '').includes(searchKeyword) ||
                      (inv.tanggal_jatuh_tempo || '').includes(searchKeyword) ||
                      st.label.toLowerCase().includes(searchKeyword);
      if (!matches) return false;
    }

    return true;
  });

  cachedFilteredLaporanRows = rows;

  // Summary cards
  let sumAmount = 0, sumPaid = 0, sumBalance = 0;
  rows.forEach(inv => {
    sumAmount  += Number(inv.total_amount || 0);
    sumPaid    += getInvoiceTotalPaid(inv.payments);
    sumBalance += getInvoiceBalance(inv, inv.payments);
  });

  const countEl   = document.getElementById('rep-total-count');
  const amountEl  = document.getElementById('rep-total-amount');
  const paidEl    = document.getElementById('rep-total-paid');
  const balanceEl = document.getElementById('rep-total-balance');
  if (countEl)   countEl.textContent   = rows.length;
  if (amountEl)  amountEl.textContent  = formatRp(sumAmount);
  if (paidEl)    paidEl.textContent    = formatRp(sumPaid);
  if (balanceEl) balanceEl.textContent = formatRp(sumBalance);

  currentLaporanPage = 1;
  renderLaporanTable();
}

function renderLaporanTable() {
  const tbody = document.querySelector('#tabel-laporan tbody');
  if (!tbody) return;

  if (cachedFilteredLaporanRows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="14" style="text-align:center;padding:24px;color:#64748b;">Tidak ada data laporan untuk filter/pencarian yang dipilih.</td></tr>';
    renderPaginationBar('laporan-pagination', 1, 0, LAPORAN_PER_PAGE, 'changeLaporanPage');
    return;
  }

  const start = (currentLaporanPage - 1) * LAPORAN_PER_PAGE;
  const pageItems = cachedFilteredLaporanRows.slice(start, start + LAPORAN_PER_PAGE);

  tbody.innerHTML = pageItems.map(inv => {
    const totalDibayar  = getInvoiceTotalPaid(inv.payments);
    const totalTerpakai = getInvoiceTotalApplied(inv.payments);
    const totalDiskon   = getInvoiceTotalDiscount(inv.payments);
    const totalDenda    = getInvoiceTotalLateFee(inv.payments);
    const sisa = getInvoiceBalance(inv, inv.payments);
    const st   = statusDinamis(inv, totalTerpakai, sisa);
    const { sisaHari, hariLewatTempo } = getReportDayMetrics(inv, inv.payments, sisa);

    return `
      <tr>
        <td><strong>${inv.nama_utang || '-'}</strong></td>
        <td>${inv.nomor_faktur}</td>
        <td>${inv.suppliers?.nama || '-'}</td>
        <td>${formatTanggal(inv.tanggal_faktur)}</td>
        <td>${formatTanggal(inv.tanggal_jatuh_tempo)}</td>
        <td>${formatRp(inv.total_amount)}</td>
        <td>${formatRp(totalDibayar)}</td>
        <td>${formatRp(totalDiskon)}</td>
        <td>${formatRp(totalDenda)}</td>
        <td><strong>${formatRp(sisa)}</strong></td>
        <td>${formatSyarat(inv.syarat_pembayaran)}</td>
        <td><span class="badge ${st.cls}">${st.label}</span></td>
        <td>${sisaHari}</td>
        <td style="${hariLewatTempo > 0 ? 'color:red;font-weight:bold;' : ''}">${hariLewatTempo}</td>
      </tr>`;
  }).join('');

  renderPaginationBar('laporan-pagination', currentLaporanPage, cachedFilteredLaporanRows.length, LAPORAN_PER_PAGE, 'changeLaporanPage');
}

function changeLaporanPage(delta) {
  const totalPages = Math.ceil(cachedFilteredLaporanRows.length / LAPORAN_PER_PAGE);
  const target = currentLaporanPage + delta;
  if (target >= 1 && target <= totalPages) {
    currentLaporanPage = target;
    renderLaporanTable();
  }
}
window.changeLaporanPage = changeLaporanPage;

function bindLaporanEvents() {
  document.getElementById('filter-status')?.addEventListener('change', loadLaporan);
  document.getElementById('filter-supplier')?.addEventListener('change', loadLaporan);
  document.getElementById('filter-category')?.addEventListener('change', loadLaporan);
  document.getElementById('filter-date-type')?.addEventListener('change', loadLaporan);
  document.getElementById('filter-start-date')?.addEventListener('change', loadLaporan);
  document.getElementById('filter-end-date')?.addEventListener('change', loadLaporan);
  document.getElementById('search-laporan')?.addEventListener('input', loadLaporan);
}

// ====== EXPORT EXCEL DENGAN TABEL RAPI & STYLING ======
document.getElementById('btn-export')?.addEventListener('click', async () => {
  if (!ensureSupabaseReady()) return;

  const { data, error } = await db
    .from('invoices')
    .select('*, suppliers(id, nama, kontak), products(id, nama, kategori), payments(*)');

  if (error) return toast('Gagal export data: ' + error.message, 'error');

  const filterStatus = document.getElementById('filter-status')?.value || 'all';
  const filterSupplier = document.getElementById('filter-supplier')?.value || 'all';
  const filterCategory = document.getElementById('filter-category')?.value || 'all';
  const filterDateType = document.getElementById('filter-date-type')?.value || 'tanggal_faktur';
  const startDate = document.getElementById('filter-start-date')?.value || '';
  const endDate = document.getElementById('filter-end-date')?.value || '';

  const filterLabelMap = {
    all: 'Semua Status',
    belum_lunas: 'Belum Lunas',
    lunas: 'Lunas',
    jatuh_tempo: 'Jatuh Tempo'
  };
  const filterLabel = filterLabelMap[filterStatus] || 'Semua';
  const dateTypeLabel = filterDateType === 'tanggal_jatuh_tempo' ? 'Tanggal Jatuh Tempo' : 'Tanggal Faktur';
  const periodLabel = startDate && endDate
    ? `${formatTanggal(startDate)} s/d ${formatTanggal(endDate)} (${dateTypeLabel})`
    : startDate
      ? `Mulai ${formatTanggal(startDate)} (${dateTypeLabel})`
      : endDate
        ? `Sampai ${formatTanggal(endDate)} (${dateTypeLabel})`
        : `Semua Periode (${dateTypeLabel})`;

  const rows = (data || []).filter(inv => {
    const sisa = getInvoiceBalance(inv, inv.payments);
    if (filterStatus === 'belum_lunas' && sisa <= 0.009) return false;
    if (filterStatus === 'lunas' && sisa > 0.009) return false;
    if (filterStatus === 'jatuh_tempo' && (sisa <= 0.009 || diffDays(inv.tanggal_jatuh_tempo) >= 0)) return false;

    if (filterSupplier !== 'all') {
      const invSupId = inv.supplier_id || inv.suppliers?.id;
      if (String(invSupId) !== String(filterSupplier)) return false;
    }

    if (filterCategory !== 'all') {
      const prodKategori = inv.products?.kategori || '-';
      if (prodKategori !== filterCategory) return false;
    }

    const targetDate = inv[filterDateType];
    if (targetDate) {
      if (startDate && targetDate < startDate) return false;
      if (endDate && targetDate > endDate) return false;
    }
    return true;
  });

  if (rows.length === 0) {
    return toast('Tidak ada data untuk diekspor pada filter ini.', 'error');
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Toko Elektronik Maju';
  workbook.calcProperties.fullCalcOnLoad = true;
  const moneyFormat = '#,##0.00;[Red](#,##0.00)';

  let grandTotal = 0;
  let grandDibayar = 0;
  let grandDiskon = 0;
  let grandDenda = 0;
  let grandSisa = 0;

  rows.forEach(invoice => {
    const totalDibayar = getInvoiceTotalPaid(invoice.payments);
    const totalDiskon = getInvoiceTotalDiscount(invoice.payments);
    const totalDenda = getInvoiceTotalLateFee(invoice.payments);
    const sisa = getInvoiceBalance(invoice, invoice.payments);
    grandTotal += Number(invoice.total_amount || 0);
    grandDibayar += totalDibayar;
    grandDiskon += totalDiskon;
    grandDenda += totalDenda;
    grandSisa += sisa;
  });

  const reportTitle = 'LAPORAN HISTORIS UTANG USAHA - TOKO ELEKTRONIK MAJU';
  const reportDetails = `Periode: ${periodLabel} | Status: ${filterLabel} | Tanggal Ekspor: ${formatTanggal(todayStr())} | Total Baris: ${rows.length} Faktur`;
  const worksheet = workbook.addWorksheet('Laporan Utang Usaha', { views: [{ state: 'frozen', ySplit: 4 }] });
  const headers = ['No', 'Nama Barang', 'No Faktur', 'Supplier', 'Tgl Faktur', 'Jatuh Tempo', 'Total (Rp)', 'Dibayar (Rp)', 'Diskon (Rp)', 'Denda (Rp)', 'Sisa (Rp)', 'Syarat', 'Status', 'Hari Sisa', 'Lewat Tempo'];
  worksheet.columns = [8, 28, 17, 22, 15, 16, 18, 18, 16, 16, 18, 16, 18, 13, 15].map(width => ({ width }));

  worksheet.mergeCells(1, 1, 1, headers.length);
  worksheet.getCell(1, 1).value = reportTitle;
  worksheet.getCell(1, 1).font = { name: 'Arial', size: 15, bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.getCell(1, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
  worksheet.getCell(1, 1).alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getRow(1).height = 28;

  worksheet.mergeCells(2, 1, 2, headers.length);
  worksheet.getCell(2, 1).value = reportDetails;
  worksheet.getCell(2, 1).font = { name: 'Arial', size: 9, color: { argb: 'FF334155' } };
  worksheet.getCell(2, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF4FA' } };
  worksheet.getCell(2, 1).alignment = { vertical: 'middle' };
  worksheet.getRow(2).height = 22;
  worksheet.addRow([]);

  const headerRow = worksheet.addRow(headers);
  headerRow.height = 24;
  headerRow.eachCell((reportCell) => {
    reportCell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
    reportCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    reportCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });

  rows.forEach((invoice, index) => {
    const totalDibayar = getInvoiceTotalPaid(invoice.payments);
    const totalTerpakai = getInvoiceTotalApplied(invoice.payments);
    const totalDiskon = getInvoiceTotalDiscount(invoice.payments);
    const totalDenda = getInvoiceTotalLateFee(invoice.payments);
    const sisa = getInvoiceBalance(invoice, invoice.payments);
    const status = statusDinamis(invoice, totalTerpakai, sisa);
    const { sisaHari, hariLewatTempo } = getReportDayMetrics(invoice, invoice.payments, sisa);
    const excelRow = index + 5;
    const reportRow = worksheet.addRow([
      index + 1,
      invoice.nama_utang || '-',
      invoice.nomor_faktur || '-',
      invoice.suppliers?.nama || '-',
      new Date(`${invoice.tanggal_faktur}T00:00:00.000Z`),
      new Date(`${invoice.tanggal_jatuh_tempo}T00:00:00.000Z`),
      Number(invoice.total_amount || 0),
      totalDibayar,
      totalDiskon,
      totalDenda,
      { formula: `G${excelRow}-H${excelRow}-I${excelRow}+J${excelRow}`, result: sisa },
      String(formatSyarat(invoice.syarat_pembayaran)),
      { formula: `IF(K${excelRow}<=0.009,"LUNAS",IF(F${excelRow}<TODAY(),"JATUH TEMPO","AKTIF"))`, result: status.label },
      sisa > 0.009 ? { formula: `MAX(0,F${excelRow}-TODAY())`, result: sisaHari } : sisaHari,
      sisa > 0.009 ? { formula: `MAX(0,TODAY()-F${excelRow})`, result: hariLewatTempo } : hariLewatTempo
    ]);

    reportRow.eachCell((reportCell, columnNumber) => {
      reportCell.border = {
        top: { style: 'thin', color: { argb: 'FFDCE3EC' } },
        bottom: { style: 'thin', color: { argb: 'FFDCE3EC' } },
        left: { style: 'thin', color: { argb: 'FFDCE3EC' } },
        right: { style: 'thin', color: { argb: 'FFDCE3EC' } }
      };
      if (index % 2 === 1) reportCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF6F8FB' } };
      if (columnNumber === 1 || (columnNumber >= 5 && columnNumber <= 6) || columnNumber >= 12) {
        reportCell.alignment = { horizontal: 'center', vertical: 'middle' };
      }
      if (columnNumber >= 7 && columnNumber <= 11) {
        reportCell.numFmt = moneyFormat;
        reportCell.alignment = { horizontal: 'right', vertical: 'middle' };
      }
    });

    reportRow.getCell(2).font = { bold: true };
    reportRow.getCell(5).numFmt = 'dd/mm/yyyy';
    reportRow.getCell(6).numFmt = 'dd/mm/yyyy';
    reportRow.getCell(11).font = { bold: true };
    reportRow.getCell(12).numFmt = '@';
    reportRow.getCell(13).font = { bold: true, color: { argb: status.cls === 'lunas' ? 'FF166534' : status.cls === 'jatuh_tempo' ? 'FF991B1B' : 'FF1E40AF' } };
    if (status.cls === 'lunas') reportRow.getCell(13).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
    if (status.cls === 'jatuh_tempo') reportRow.getCell(13).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
  });

  const firstDataRow = 5;
  const lastDataRow = firstDataRow + rows.length - 1;
  const totalRowNumber = lastDataRow + 1;
  worksheet.mergeCells(totalRowNumber, 1, totalRowNumber, 6);
  const totalRow = worksheet.getRow(totalRowNumber);
  totalRow.getCell(1).value = 'TOTAL KESELURUHAN';
  totalRow.getCell(1).alignment = { horizontal: 'center' };
  totalRow.getCell(1).font = { bold: true };
  const cachedTotals = [grandTotal, grandDibayar, grandDiskon, grandDenda, grandSisa];
  cachedTotals.forEach((cachedValue, index) => {
    const columnNumber = index + 7;
    const columnLetter = String.fromCharCode(64 + columnNumber);
    const totalCell = totalRow.getCell(columnNumber);
    totalCell.value = { formula: `SUM(${columnLetter}${firstDataRow}:${columnLetter}${lastDataRow})`, result: cachedValue };
    totalCell.numFmt = moneyFormat;
    totalCell.font = { bold: true };
    totalCell.alignment = { horizontal: 'right' };
  });
  for (let columnNumber = 1; columnNumber <= headers.length; columnNumber += 1) {
    const totalCell = totalRow.getCell(columnNumber);
    totalCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
    totalCell.border = { top: { style: 'medium', color: { argb: 'FF315F9C' } } };
  }
  for (let columnNumber = 12; columnNumber <= headers.length; columnNumber += 1) {
    totalRow.getCell(columnNumber).value = '-';
    totalRow.getCell(columnNumber).alignment = { horizontal: 'center' };
  }

  const excelBuffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `laporan_utang_${todayStr()}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  toast('Laporan Excel berhasil diunduh ✓', 'success');
});

document.getElementById('btn-export-pdf')?.addEventListener('click', () => {
  const jsPDF = window.jspdf?.jsPDF;
  if (!jsPDF || typeof jsPDF.API.autoTable !== 'function') {
    return toast('Fitur PDF belum termuat. Periksa koneksi internet lalu muat ulang.', 'error');
  }

  if (!cachedFilteredLaporanRows || cachedFilteredLaporanRows.length === 0) {
    return toast('Tidak ada data laporan untuk diekspor ke PDF.', 'error');
  }

  const title = 'Laporan Detail Utang Usaha — Toko Elektronik Maju';
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  pdf.setFontSize(15);
  pdf.text(title, 12, 14);
  pdf.setFontSize(9);
  pdf.text(`Tanggal cetak: ${formatTanggal(todayStr())}`, 12, 20);

  const head = [['Nama Utang', 'No Faktur', 'Supplier', 'Tgl Faktur', 'Jatuh Tempo', 'Total', 'Dibayar', 'Diskon', 'Denda', 'Sisa', 'Syarat', 'Status', 'Sisa Hari', 'Lewat Tempo']];

  const body = cachedFilteredLaporanRows.map(inv => {
    const totalDibayar  = getInvoiceTotalPaid(inv.payments);
    const totalTerpakai = getInvoiceTotalApplied(inv.payments);
    const totalDiskon   = getInvoiceTotalDiscount(inv.payments);
    const totalDenda    = getInvoiceTotalLateFee(inv.payments);
    const sisa = getInvoiceBalance(inv, inv.payments);
    const st   = statusDinamis(inv, totalTerpakai, sisa);
    const { sisaHari, hariLewatTempo } = getReportDayMetrics(inv, inv.payments, sisa);

    return [
      inv.nama_utang || '-',
      inv.nomor_faktur || '-',
      inv.suppliers?.nama || '-',
      formatTanggal(inv.tanggal_faktur),
      formatTanggal(inv.tanggal_jatuh_tempo),
      formatRp(inv.total_amount),
      formatRp(totalDibayar),
      formatRp(totalDiskon),
      formatRp(totalDenda),
      formatRp(sisa),
      formatSyarat(inv.syarat_pembayaran),
      st.label,
      String(sisaHari),
      String(hariLewatTempo)
    ];
  });

  pdf.autoTable({
    head: head,
    body: body,
    startY: 25,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2.5, overflow: 'linebreak' },
    headStyles: { fillColor: [30, 58, 138] },
    margin: { left: 10, right: 10 }
  });
  pdf.save(`laporan_utang_${todayStr()}.pdf`);
  toast('Laporan PDF berhasil diunduh ✓', 'success');
});

async function resetSemuaTransaksi() {
  if (!confirm('Apakah Anda yakin ingin mengosongkan SELURUH data Faktur, Pembayaran, dan Riwayat Aktivitas?')) return;
  if (!ensureSupabaseReady()) return;

  toast('Mengosongkan seluruh data transaksi...', '');

  try {
    await db.from('payments').delete().gte('id', 0);
  } catch (e) {}

  try {
    await db.from('invoices').delete().gte('id', 0);
  } catch (e) {}

  try {
    await db.from('activity_logs').delete().gte('id', 0);
  } catch (e) {}

  try {
    localStorage.removeItem('local_activity_logs');
  } catch (e) {}

  toast('Seluruh data transaksi dan riwayat aktivitas berhasil dikosongkan ✓', 'success');

  await loadInvoices();
  await loadPaymentHistory();
  await loadDashboard();
  await loadLaporan();
}
window.resetSemuaTransaksi = resetSemuaTransaksi;

// ====== INISIALISASI APLIKASI ======
async function initApp() {
  bindTabs();
  bindLaporanEvents();
  activateTab('dashboard');

  if (!db) {
    toast('Supabase belum dikonfigurasi. Isi URL dan anon key di script.js terlebih dahulu.', 'error');
    return;
  }

  loadSuppliers();
  loadProducts();
  loadInvoices();
  loadPaymentHistory();
  loadDashboard();
  loadLaporan();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}