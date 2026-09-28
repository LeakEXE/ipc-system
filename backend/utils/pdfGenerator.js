const fs = require('fs');
const path = require('path');

/**
 * Escape teks agar aman dimasukkan ke HTML (mencegah broken layout
 * kalau ada nama siswa yang mengandung karakter <, >, &, dsb).
 */
function esc(val) {
  if (val === undefined || val === null) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Isi semua {{placeholder}} di template dengan data siswa.
 * @param {string} template - isi file raport-ipc.html
 * @param {object} data - object key harus sama dengan nama placeholder
 */
function renderTemplate(template, data) {
  return template.replace(/{{\s*([\w_]+)\s*}}/g, (match, key) => {
    return data[key] !== undefined && data[key] !== null ? data[key] : '';
  });
}

/**
 * Render template dengan support untuk loops ({{#each}})
 * @param {string} template - isi file template
 * @param {object} data - object key harus sama dengan nama placeholder
 * @returns {string} template yang sudah di-render
 */
function renderTemplateWithLoops(template, data) {
  // Handle {{#each}} loops
  template = template.replace(/{{#each\s+([\w_]+)}}([\s\S]*?){{\/each}}/g, (match, arrayKey, loopContent) => {
    const array = data[arrayKey];
    if (!Array.isArray(array)) return '';
    
    return array.map((item, index) => {
      // Replace {{@index}} with 1-based index
      let itemContent = loopContent.replace(/{{@index}}/g, index + 1);
      
      // Replace {{key}} with item[key]
      itemContent = itemContent.replace(/{{\s*([\w_]+)\s*}}/g, (match, key) => {
        return item[key] !== undefined && item[key] !== null ? item[key] : '';
      });
      
      return itemContent;
    }).join('');
  });
  
  // Handle simple {{placeholder}} replacements
  template = template.replace(/{{\s*([\w_]+)\s*}}/g, (match, key) => {
    return data[key] !== undefined && data[key] !== null ? data[key] : '';
  });
  
  return template;
}

/**
 * Bangun 1 baris <tr> untuk 1 siswa untuk leger IPC.
 */
function buildRow(siswa, no) {
  return `
  <tr>
    <td>${no}</td>
    <td class="nama">${esc(siswa.nama)}</td>
    <td>${esc(siswa.nis)}</td>
    <td>${esc(siswa.kelas)}</td>
    <td>${esc(siswa.ghra)}</td>

    <td class="grp-prestasi col-jml">${siswa.jumlahPrestasi ?? 0}</td>

    <td class="grp-karakter">${siswa.tanggungJawab ?? 0}</td>
    <td class="grp-karakter">${siswa.disiplin ?? 0}</td>
    <td class="grp-karakter">${siswa.kepedulian ?? 0}</td>
    <td class="grp-karakter">${siswa.kemandirian ?? 0}</td>
    <td class="grp-karakter">${siswa.spiritual ?? 0}</td>
    <td class="grp-karakter">${siswa.kejujuran ?? 0}</td>
    <td class="grp-karakter">${siswa.kepercayaanDiri ?? 0}</td>
    <td class="grp-karakter col-jml">${siswa.jumlahKarakter ?? 0}</td>

    <td class="grp-keaktifan">${siswa.organisasi ?? 0}</td>
    <td class="grp-keaktifan">${siswa.kepanitiaan ?? 0}</td>
    <td class="grp-keaktifan">${siswa.event ?? 0}</td>
    <td class="grp-keaktifan col-jml">${siswa.jumlahKeaktifan ?? 0}</td>

    <td class="grp-pelanggaran">${siswa.ringan ?? 0}</td>
    <td class="grp-pelanggaran">${siswa.sedang ?? 0}</td>
    <td class="grp-pelanggaran">${siswa.berat ?? 0}</td>
    <td class="grp-pelanggaran col-jml">${siswa.jumlahPelanggaran ?? 0}</td>

    <td class="col-total">${siswa.totalPoint ?? 0}</td>
  </tr>`;
}

/**
 * Pilih class ukuran font tabel berdasarkan jumlah siswa,
 * supaya tabel tetap rapi/muat baik kelas kecil maupun besar.
 */
function pilihDensityClass(jumlahSiswa) {
  if (jumlahSiswa > 40) return 'dense-50';
  if (jumlahSiswa > 30) return 'dense-40';
  if (jumlahSiswa > 20) return 'dense-30';
  return '';
}

/**
 * Generate PDF untuk Individual Point Card menggunakan puppeteer
 * @param {object} data - data siswa untuk diisi ke template
 * @param {string} outputPath - path output PDF
 */
async function generateRaportIPC(data, outputPath) {
  const puppeteer = require('puppeteer');
  
  const templatePath = path.join(__dirname, '..', 'templates', 'raport-ipc.html');
  const cssPath = path.join(__dirname, '..', 'templates', 'raport-ipc.css');

  let html = fs.readFileSync(templatePath, 'utf8');
  const css = fs.readFileSync(cssPath, 'utf8');

  // inline-kan CSS supaya puppeteer tidak perlu resolve path terpisah
  html = html.replace(
    '<link rel="stylesheet" href="raport-ipc.css">',
    `<style>${css}</style>` 
  );

  // ubah logo jadi base64 supaya ikut ke-embed di HTML (tidak broken saat PDF)
  // Cek apakah logo_path sudah base64 atau file path
  if (data.logo_path && !data.logo_path.startsWith('data:')) {
    try {
      const logoPath = path.join(__dirname, '..', 'public', data.logo_path);
      if (fs.existsSync(logoPath)) {
        const logoBuffer = fs.readFileSync(logoPath);
        const ext = path.extname(logoPath).toLowerCase();
        const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';
        data.logo_path = `data:${mimeType};base64,${logoBuffer.toString('base64')}`;
      }
    } catch (error) {
      console.log('Logo not found, using placeholder');
      data.logo_path = ''; // Kosongkan jika tidak ada
    }
  }

  html = renderTemplate(html, data);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  await page.pdf({
    path: outputPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' }
  });

  await browser.close();
}

/**
 * Generate PDF buffer untuk Individual Point Card menggunakan puppeteer
 * @param {object} data - data siswa untuk diisi ke template
 * @returns {Buffer} PDF buffer
 */
async function generateRaportIPCBuffer(data) {
  const puppeteer = require('puppeteer');
  
  const templatePath = path.join(__dirname, '..', 'templates', 'raport-ipc.html');
  const cssPath = path.join(__dirname, '..', 'templates', 'raport-ipc.css');

  let html = fs.readFileSync(templatePath, 'utf8');
  const css = fs.readFileSync(cssPath, 'utf8');

  // inline-kan CSS supaya puppeteer tidak perlu resolve path terpisah
  html = html.replace(
    '<link rel="stylesheet" href="raport-ipc.css">',
    `<style>${css}</style>` 
  );

  // ubah logo jadi base64 supaya ikut ke-embed di HTML (tidak broken saat PDF)
  // Cek apakah logo_path sudah base64 atau file path
  if (data.logo_path && !data.logo_path.startsWith('data:')) {
    try {
      const logoPath = path.join(__dirname, '..', 'public', data.logo_path);
      if (fs.existsSync(logoPath)) {
        const logoBuffer = fs.readFileSync(logoPath);
        const ext = path.extname(logoPath).toLowerCase();
        const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';
        data.logo_path = `data:${mimeType};base64,${logoBuffer.toString('base64')}`;
      }
    } catch (error) {
      console.log('Logo not found, using placeholder');
      data.logo_path = ''; // Kosongkan jika tidak ada
    }
  }

  html = renderTemplate(html, data);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });

  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' }
  });

  await browser.close();
  return pdfBuffer;
}

/**
 * Format tanggal ke format Indonesia
 * @param {Date} date - tanggal
 * @returns {string} tanggal dalam format Indonesia
 */
function formatDateIndo(date = new Date()) {
  const options = { day: 'numeric', month: 'long', year: 'numeric' };
  return date.toLocaleDateString('id-ID', options);
}

/**
 * Generate PDF buffer untuk Leger IPC Per Kelas menggunakan puppeteer
 * @param {object} dataKelas - data kelas untuk diisi ke template
 * @param {Array} listSiswa - array data siswa
 * @returns {Buffer} PDF buffer
 */
async function generateLegerIPCBuffer(dataKelas, listSiswa) {
  const puppeteer = require('puppeteer');
  
  const templatePath = path.join(__dirname, '..', 'templates', 'leger-ipc.html');
  const cssPath = path.join(__dirname, '..', 'templates', 'leger-ipc.css');

  let html = fs.readFileSync(templatePath, 'utf8');
  const css = fs.readFileSync(cssPath, 'utf8');

  // inline-kan CSS supaya puppeteer tidak perlu resolve path terpisah
  html = html.replace(
    '<link rel="stylesheet" href="leger-ipc.css">',
    `<style>${css}</style>` 
  );

  // kop surat -> base64 supaya ikut ke-embed di PDF (1 file gambar utuh)
  const embedImage = (relPath) => {
    try {
      const full = path.join(__dirname, '..', 'public', relPath);
      const buf = fs.readFileSync(full);
      const ext = path.extname(full).slice(1) || 'png';
      return `data:image/${ext};base64,${buf.toString('base64')}`;
    } catch (e) {
      console.log('Logo not found:', e.message);
      return '';
    }
  };
  dataKelas.kop_surat_path = embedImage(dataKelas.kop_surat_path_file || 'header.png');

  // isi info kelas & tanda tangan
  html = renderTemplate(html, dataKelas);

  // isi baris siswa (semua siswa, CSS akan handle pagination otomatis)
  const rowsHtml = listSiswa.map((s, i) => buildRow(s, i + 1)).join('\n');
  html = html.replace('<!--ROWS-->', rowsHtml);

  // tambahkan class density ke <table class="leger"> sesuai jumlah siswa
  const densityClass = pilihDensityClass(listSiswa.length);
  if (densityClass) {
    html = html.replace('class="leger"', `class="leger ${densityClass}"`);
  }

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });

  const pdfBuffer = await page.pdf({
    format: 'A4',
    landscape: true,
    printBackground: true,
    margin: { top: '7mm', bottom: '7mm', left: '8mm', right: '8mm' }
  });

  await browser.close();
  return pdfBuffer;
}

module.exports = { generateRaportIPC, generateRaportIPCBuffer, generateLegerIPCBuffer, renderTemplate, renderTemplateWithLoops, formatDateIndo, esc, buildRow, pilihDensityClass };
