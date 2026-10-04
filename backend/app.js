/* ============================================================
   app.js — Logika Akuntansi & Business Logic
   Berisi parsing syarat pembayaran, kalkulasi diskon,
   jatuh tempo, dan helper lainnya.
   ============================================================ */

/**
 * Parse syarat pembayaran akuntansi.
 * Contoh:
 *   "n/30"        -> { diskonPersen:0, diskonHari:0, netHari:30 }
 *   "2/10 n/30"   -> { diskonPersen:2, diskonHari:10, netHari:30 }
 *   "3/15 n/60"   -> { diskonPersen:3, diskonHari:15, netHari:60 }
 */
function parseSyaratPembayaran(syarat) {
  const clean = (syarat || '').trim().toLowerCase().replace(/,/g, ' ').replace(/\s+/g, ' ');
  if (!clean) {
    return {
      diskonPersen: 0,
      diskonHari: 0,
      diskonBertingkat: [],
      netHari: 0,
      hasEom: false,
      jatuhTempoMode: 'invoice_days',
      format: ''
    };
  }
  const diskonBertingkat = [...clean.matchAll(/(\d+(?:[.,]\d+)?)\s*\/\s*(\d+)/g)]
    .map(match => ({ diskonPersen: Number(match[1].replace(',', '.')), diskonHari: parseInt(match[2], 10) }));
  const percentMatch = clean.match(/(\d+(?:[.,]\d+)?)\s*%/);
  const freeDiscountDays = clean.match(/(?:diskon|dalam|within)[^\d]*(\d+)\s*(?:hari|hr|days?)/);
  const netMatch = clean.match(/(?:\bn\b|\bnet\b)\s*\/?\s*(\d+)/);
  const dueDaysMatch = clean.match(/(?:jatuh\s*tempo|tempo)[^\d]*(\d+)\s*(?:hari|hr|h|days?)/);
  const hasEom = /\beom\b|akhir\s*bulan/.test(clean);
  const immediate = /\bcod\b|cash\s+on\s+delivery|due\s+on\s+receipt|langsung/.test(clean);
  const diskonPersen = diskonBertingkat[0]?.diskonPersen || (percentMatch ? Number(percentMatch[1].replace(',', '.')) : 0);
  const diskonHari = diskonBertingkat[0]?.diskonHari || (freeDiscountDays ? parseInt(freeDiscountDays[1], 10) : 0);
  if (diskonPersen > 0 && diskonHari > 0 && diskonBertingkat.length === 0) {
    diskonBertingkat.push({ diskonPersen, diskonHari });
  }
  const netHari = netMatch ? parseInt(netMatch[1], 10) : dueDaysMatch ? parseInt(dueDaysMatch[1], 10) : (hasEom || immediate ? 0 : 0);
  const jatuhTempoMode = hasEom ? (netMatch ? 'days_after_eom' : 'eom') : 'invoice_days';

  return {
    diskonPersen,
    diskonHari,
    diskonBertingkat,
    netHari,
    hasEom,
    jatuhTempoMode,
    format: clean
  };
}

/** Tambah hari ke tanggal (YYYY-MM-DD) */
function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

/** Tanggal jatuh tempo sesuai jumlah hari atau akhir bulan (EOM). */
function hitungTanggalJatuhTempo(tanggalFaktur, syarat) {
  const parsed = typeof syarat === 'string' ? parseSyaratPembayaran(syarat) : syarat;
  if (parsed.jatuhTempoMode === 'eom' || parsed.jatuhTempoMode === 'days_after_eom') {
    const date = new Date(tanggalFaktur + 'T00:00:00Z');
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + 1);
    date.setUTCDate(0);
    const endOfMonth = date.toISOString().split('T')[0];
    return parsed.jatuhTempoMode === 'days_after_eom' ? addDays(endOfMonth, parsed.netHari) : endOfMonth;
  }
  return addDays(tanggalFaktur, parsed.netHari);
}

/** Tanggal hari ini berdasarkan zona waktu Indonesia Barat. */
function tanggalHariIni() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

/** Selisih hari dari kalender Indonesia ke tanggal tertentu */
function diffDays(dateStr) {
  const [yearToday, monthToday, dayToday] = tanggalHariIni().split('-').map(Number);
  const today = Date.UTC(yearToday, monthToday - 1, dayToday);
  const [year, month, day] = dateStr.split('-').map(Number);
  return Math.round((Date.UTC(year, month - 1, day) - today) / 86400000);
}

/** Format Rupiah */
function formatRp(n) {
  return 'Rp ' + Number(n || 0).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/** Format tanggal Indonesia */
function formatTanggal(str) {
  if (!str) return '-';
  const [year, month, day] = String(str).split('-');
  if (!year || !month || !day) return '-';
  return `${day}/${month}/${year}`;
}

/**
 * Hitung diskon yang berhak didapat jika bayar pada tanggal tertentu.
 * Return: nominal pokok yang dilunasi, diskon, dan saldo setelah pembayaran.
 */
function hitungDiskon(invoice, tanggalBayar, sisaUtang = invoice.total_amount, jumlahBayar = null) {
  const parsed = parseSyaratPembayaran(invoice.syarat_pembayaran);
  const tanggalAcuanDiskon = parsed.hasEom
    ? hitungTanggalJatuhTempo(invoice.tanggal_faktur, { jatuhTempoMode: 'eom' })
    : invoice.tanggal_faktur;
  const tglFaktur = new Date(tanggalAcuanDiskon + 'T00:00:00Z');
  const tglBayar  = new Date(tanggalBayar + 'T00:00:00Z');
  const hariKe = Math.round((tglBayar - tglFaktur) / 86400000);
  const tier = parsed.diskonBertingkat.find(item => hariKe >= 0 && hariKe <= item.diskonHari);
  const diskonPersen = tier?.diskonPersen || parsed.diskonPersen;
  const diskonHari = tier?.diskonHari || parsed.diskonHari;
  if (diskonPersen > 0 && hariKe >= 0 && hariKe <= diskonHari) {
    const tarif = diskonPersen / 100;
    const sisaSebelum = Math.max(0, Number(sisaUtang) || 0);
    const diskonPenuh = Math.round(sisaSebelum * tarif * 100) / 100;
    const bayar = jumlahBayar === null ? null : Math.max(0, Number(jumlahBayar) || 0);
    if (bayar === null) {
      return {
        berhak: true,
        diskonRp: 0,
        nominalUtangDilunasi: 0,
        sisaSetelahDiskon: sisaSebelum,
        hariKe,
        diskonPersen,
        diskonHari,
        menungguJumlahBayar: true
      };
    }

    const bayarUntukLunas = Math.round((sisaSebelum - diskonPenuh) * 100) / 100;
    const nominalUtangDilunasi = bayar >= bayarUntukLunas - 0.01
      ? sisaSebelum
      : Math.min(sisaSebelum, Math.round((bayar / (1 - tarif)) * 100) / 100);
    const diskonRp = Math.round(nominalUtangDilunasi * tarif * 100) / 100;

    return {
      berhak: true,
      diskonRp,
      nominalUtangDilunasi,
      sisaSetelahDiskon: Math.max(0, Math.round((sisaSebelum - nominalUtangDilunasi) * 100) / 100),
      hariKe,
      diskonPersen,
      diskonHari
    };
  }
  const sisaSebelum = Math.max(0, Number(sisaUtang) || 0);
  const nominalUtangDilunasi = Math.min(sisaSebelum, Math.max(0, Number(jumlahBayar) || 0));
  return {
    berhak: false,
    diskonRp: 0,
    nominalUtangDilunasi,
    sisaSetelahDiskon: Math.max(0, Math.round((sisaSebelum - nominalUtangDilunasi) * 100) / 100),
    hariKe,
    diskonPersen,
    diskonHari
  };
}

/**
 * Tentukan status dinamis invoice berdasarkan tanggal hari ini.
 */
function statusDinamis(invoice, totalTerpakai, sisaUtang = Number(invoice.total_amount) - totalTerpakai) {
  if (sisaUtang <= 0.009) return { label: 'LUNAS', cls: 'lunas' };

  const sisaHari = diffDays(invoice.tanggal_jatuh_tempo);
  if (sisaHari < 0) return { label: 'JATUH TEMPO', cls: 'jatuh_tempo' };

  return { label: 'AKTIF', cls: 'aktif' };
}

/** Export array of objects ke CSV (bisa dibuka Excel) */
function exportToCSV(filename, rows, headers) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [];
  lines.push(headers.map(esc).join(','));
  rows.forEach(r => lines.push(r.map(esc).join(',')));
  const csv = '\uFEFF' + lines.join('\n'); // BOM agar Excel baca UTF-8
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

window.AppLogic = {
  parseSyaratPembayaran,
  addDays,
  hitungTanggalJatuhTempo,
  tanggalHariIni,
  diffDays,
  formatRp,
  formatTanggal,
  hitungDiskon,
  statusDinamis,
  exportToCSV
};