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
let selectedPaymentInvoice = null;
let invoicesLoadPromise = null;

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
  const tabOrder = ['dashboard', 'supplier', 'invoice', 'payment', 'laporan'];
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
  loadedSuppliers = data;

  const tbody = document.querySelector('#tabel-supplier tbody');
  tbody.innerHTML = data.map(s => `
    <tr>
      <td><strong>${s.nama}</strong></td><td>${s.kontak || '-'}</td><td>${s.alamat || '-'}</td>
      <td><button class="btn-sm" onclick="editSupplier(${s.id})">Edit</button> <button class="btn-danger btn-sm" onclick="hapusSupplier(${s.id})">Hapus</button></td>
    </tr>`).join('') || '<tr><td colspan="4" style="text-align:center">Belum ada supplier</td></tr>';

  const sel = document.getElementById('inv-supplier');
  sel.innerHTML = '<option value="">-- Pilih Supplier --</option>' +
    data.map(s => `<option value="${s.id}">${s.nama}</option>`).join('');
}

document.getElementById('form-supplier').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!ensureSupabaseReady()) return;

  const payload = {
    nama: document.getElementById('sup-nama').value.trim(),
    kontak: document.getElementById('sup-kontak').value.trim() || null,
    alamat: document.getElementById('sup-alamat').value.trim() || null
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

// ====== INVOICE ======

document.getElementById('form-invoice').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!ensureSupabaseReady()) return;

  const syarat = document.getElementById('inv-syarat').value.trim();
  const parsed = parseSyaratPembayaran(syarat);
  const tglFaktur = document.getElementById('inv-tanggal').value;
  const jatuhTempo = document.getElementById('inv-jatuh-tempo').value;

  const payload = {
    nama_utang: document.getElementById('inv-nama-utang').value.trim(),
    supplier_id: parseInt(document.getElementById('inv-supplier').value, 10),
    nomor_faktur: document.getElementById('inv-nomor').value.trim(),
    tanggal_faktur: tglFaktur,
    tanggal_jatuh_tempo: jatuhTempo,
    total_amount: parseFloat(document.getElementById('inv-total').value),
    syarat_pembayaran: syarat || null,
    diskon_persen: parsed.diskonPersen || 0,
    diskon_hari: parsed.diskonHari || 0,
    net_hari: parsed.netHari || null,
    keterangan: document.getElementById('inv-keterangan').value.trim() || null
  };

  const invoiceId = document.getElementById('inv-id').value;
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
}

async function editInvoice(id) {
  const invoice = loadedInvoices.find(item => String(item.id) === String(id));
  if (!invoice) return toast('Faktur tidak ditemukan. Muat ulang daftar faktur.', 'error');

  document.getElementById('inv-id').value = invoice.id;
  document.getElementById('inv-nama-utang').value = invoice.nama_utang || '';
  document.getElementById('inv-supplier').value = invoice.supplier_id;
  document.getElementById('inv-nomor').value = invoice.nomor_faktur;
  document.getElementById('inv-tanggal').value = invoice.tanggal_faktur;
  document.getElementById('inv-jatuh-tempo').value = invoice.tanggal_jatuh_tempo;
  document.getElementById('inv-total').value = invoice.total_amount;
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
  loadedInvoices = data;

  const tbody = document.querySelector('#tabel-invoice tbody');
  tbody.innerHTML = data.map(inv => {
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
        <td><button class="btn-sm" onclick="editInvoice(${inv.id})">Edit</button> <button class="btn-danger btn-sm" onclick="hapusInvoice(${inv.id})">Hapus</button></td>
      </tr>`;
  }).join('') || '<tr><td colspan="10" style="text-align:center">Belum ada faktur</td></tr>';

  unpaidInvoices = data.filter(inv => getInvoiceBalance(inv, inv.payments) > 0.009);
  document.getElementById('pay-invoice').innerHTML = '<option value="">-- Pilih nama utang usaha --</option>' + unpaidInvoices.map(inv => {
    const label = `${inv.nama_utang || 'Utang usaha'} | ${inv.suppliers?.nama || '-'} | ${inv.nomor_faktur} | Sisa ${formatRp(getInvoiceBalance(inv, inv.payments))}`;
    return `<option value="${inv.id}">${label}</option>`;
  }).join('');
}

async function hapusInvoice(id) {
  if (!confirm('Hapus faktur ini?')) return;
  if (!ensureSupabaseReady()) return;

  const { error } = await db.from('invoices').delete().eq('id', id);
  if (error) return toast('Gagal: ' + error.message, 'error');
  toast('Faktur dihapus', 'success');
  loadInvoices();
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
  const invoiceSelect = document.getElementById('pay-invoice');
  invoiceSelect.value = String(invoice.id);
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
  document.getElementById('pay-invoice').value = '';
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

  const tbody = document.querySelector('#tabel-payment tbody');
  tbody.innerHTML = data.map(p => {
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
  }).join('') || '<tr><td colspan="10" style="text-align:center">Belum ada pembayaran</td></tr>';
}

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
    const option = document.createElement('option');
    option.value = invoice.id;
    option.textContent = `${invoice.nama_utang || 'Utang usaha'} | ${invoice.suppliers?.nama || '-'} | ${invoice.nomor_faktur}`;
    invoiceSelect.append(option);
  }

  document.getElementById('pay-id').value = payment.id;
  invoiceSelect.value = invoice.id;
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
  document.getElementById('pay-invoice').value = '';
  selectedPaymentInvoice = null;
  resetPaymentEdit();
  renderPaymentInfo();
});

// ====== DASHBOARD ======
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
  document.getElementById('notification-count').textContent = notifications.length;
  const feed = document.getElementById('dashboard-notifications');
  feed.innerHTML = notifications.map(notification => `
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
    </article>`).join('') || '<div class="notification-empty"><strong>Tidak ada yang mendesak</strong><br>Utang usaha belum lunas yang mendekati jatuh tempo atau batas diskon akan muncul di sini.</div>';
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

// ====== LAPORAN DENGAN FILTER PERIODE TANGGAL ======
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
  document.getElementById('filter-status').value = 'all';
  document.getElementById('filter-date-type').value = 'tanggal_faktur';
  document.getElementById('filter-start-date').value = '';
  document.getElementById('filter-end-date').value = '';
  loadLaporan();
}

window.setLaporanPeriod = setLaporanPeriod;
window.resetLaporanFilter = resetLaporanFilter;

async function loadLaporan() {
  if (!ensureSupabaseReady()) return;

  // Menggunakan payments(*) agar aman dan tidak error meskipun skema kolom bertambah
  const { data, error } = await db
    .from('invoices')
    .select('*, suppliers(nama), payments(*)')
    .order('tanggal_jatuh_tempo', { ascending: true });

  if (error) {
    console.error('Laporan error:', error);
    return toast('Gagal load laporan: ' + error.message, 'error');
  }

  const filterStatus = document.getElementById('filter-status').value;
  const filterDateType = document.getElementById('filter-date-type')?.value || 'tanggal_faktur';
  const startDate = document.getElementById('filter-start-date')?.value || '';
  const endDate = document.getElementById('filter-end-date')?.value || '';

  const rows = (data || []).filter(inv => {
    const totalTerpakai = getInvoiceTotalApplied(inv.payments);
    const sisa = getInvoiceBalance(inv, inv.payments);

    // 1. Filter Status
    if (filterStatus === 'belum_lunas' && sisa <= 0.009) return false;
    if (filterStatus === 'lunas' && sisa > 0.009) return false;
    if (filterStatus === 'jatuh_tempo' && (sisa <= 0.009 || diffDays(inv.tanggal_jatuh_tempo) >= 0)) return false;

    // 2. Filter Periode Tanggal
    const targetDate = inv[filterDateType];
    if (targetDate) {
      if (startDate && targetDate < startDate) return false;
      if (endDate && targetDate > endDate) return false;
    }

    return true;
  });

  // Hitung Summary Metrics
  let sumAmount = 0;
  let sumPaid = 0;
  let sumBalance = 0;

  rows.forEach(inv => {
    sumAmount += Number(inv.total_amount || 0);
    sumPaid += getInvoiceTotalPaid(inv.payments);
    sumBalance += getInvoiceBalance(inv, inv.payments);
  });

  const countEl = document.getElementById('rep-total-count');
  const amountEl = document.getElementById('rep-total-amount');
  const paidEl = document.getElementById('rep-total-paid');
  const balanceEl = document.getElementById('rep-total-balance');

  if (countEl) countEl.textContent = rows.length;
  if (amountEl) amountEl.textContent = formatRp(sumAmount);
  if (paidEl) paidEl.textContent = formatRp(sumPaid);
  if (balanceEl) balanceEl.textContent = formatRp(sumBalance);

  // Render Tabel
  const tbody = document.querySelector('#tabel-laporan tbody');
  if (!tbody) return;

  tbody.innerHTML = rows.map(inv => {
    const totalDibayar = getInvoiceTotalPaid(inv.payments);
    const totalTerpakai = getInvoiceTotalApplied(inv.payments);
    const totalDiskon = getInvoiceTotalDiscount(inv.payments);
    const totalDenda = getInvoiceTotalLateFee(inv.payments);
    const sisa = getInvoiceBalance(inv, inv.payments);
    const st = statusDinamis(inv, totalTerpakai, sisa);
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
        <td style="${hariLewatTempo > 0 ? 'color:red; font-weight:bold;' : ''}">${hariLewatTempo}</td>
      </tr>`;
  }).join('') || '<tr><td colspan="14" style="text-align:center; padding: 24px; color: #64748b;">Tidak ada data laporan untuk filter dan periode yang dipilih.</td></tr>';
}

function bindLaporanEvents() {
  document.getElementById('filter-status')?.addEventListener('change', loadLaporan);
  document.getElementById('filter-date-type')?.addEventListener('change', loadLaporan);
  document.getElementById('filter-start-date')?.addEventListener('change', loadLaporan);
  document.getElementById('filter-end-date')?.addEventListener('change', loadLaporan);
}

// ====== EXPORT EXCEL DENGAN TABEL RAPI & STYLING ======
document.getElementById('btn-export')?.addEventListener('click', async () => {
  if (!ensureSupabaseReady()) return;

  const { data, error } = await db
    .from('invoices')
    .select('*, suppliers(nama), payments(*)');

  if (error) return toast('Gagal export data: ' + error.message, 'error');

  const filterStatus = document.getElementById('filter-status').value;
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
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Toko Elektronik Maju';
  workbook.calcProperties.fullCalcOnLoad = true;
  const worksheet = workbook.addWorksheet('Laporan Utang Usaha', { views: [{ state: 'frozen', ySplit: 4 }] });
  const headers = ['No', 'Nama Utang Usaha', 'No Faktur', 'Supplier', 'Tgl Faktur', 'Jatuh Tempo', 'Total (Rp)', 'Dibayar (Rp)', 'Diskon (Rp)', 'Denda (Rp)', 'Sisa (Rp)', 'Syarat', 'Status', 'Hari Sisa', 'Lewat Tempo'];
  const moneyFormat = '#,##0.00;[Red](#,##0.00)';
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

  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  pdf.setFontSize(16);
  pdf.text('Laporan Utang Usaha — Toko Elektronik Maju', 12, 14);
  pdf.setFontSize(9);
  pdf.text(`Tanggal cetak: ${formatTanggal(todayStr())}`, 12, 20);
  pdf.autoTable({
    html: '#tabel-laporan',
    startY: 25,
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 2, overflow: 'linebreak' },
    headStyles: { fillColor: [30, 58, 138] },
    margin: { left: 10, right: 10 }
  });
  pdf.save(`laporan_utang_${todayStr()}.pdf`);
  toast('Laporan PDF berhasil diunduh', 'success');
});

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