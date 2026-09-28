import React from 'react';
import { getIpcPrintBranding } from './ipcPrintBranding';

function formatTahunPelajaran(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  if (month >= 7) {
    return `${year}/${year + 1}`;
  }
  return `${year - 1}/${year}`;
}

function formatPrintDate(date = new Date()) {
  const options = { day: 'numeric', month: 'long', year: 'numeric' };
  return date.toLocaleDateString('id-ID', options);
}

function IpcPrintSheet({ student, wali, points, ipcTotal, printDate = new Date(), schoolConfig = {} }) {
  const branding = getIpcPrintBranding(schoolConfig);
  const breakdown = points || {
    point_awal: student?.ipc_awal ?? 80,
    prestasi: 0,
    tanggung_jawab: 0,
    disiplin: 0,
    kepedulian: 0,
    kemandirian: 0,
    spiritual: 0,
    kejujuran: 0,
    kepercayaan_diri: 0,
    organisasi: 0,
    kepanitiaan: 0,
    event: 0,
    pelanggaran_ringan: 0,
    pelanggaran_sedang: 0,
    pelanggaran_berat: 0
  };

  // Calculate total using the same formula as backend for consistency
  const calculatedTotal =
    (Number(breakdown.point_awal) || 80) +
    (Number(breakdown.prestasi) || 0) +
    (Number(breakdown.tanggung_jawab) || 0) +
    (Number(breakdown.disiplin) || 0) +
    (Number(breakdown.kepedulian) || 0) +
    (Number(breakdown.kemandirian) || 0) +
    (Number(breakdown.spiritual) || 0) +
    (Number(breakdown.kejujuran) || 0) +
    (Number(breakdown.kepercayaan_diri) || 0) +
    (Number(breakdown.organisasi) || 0) +
    (Number(breakdown.kepanitiaan) || 0) +
    (Number(breakdown.event || 0)) -
    (Number(breakdown.pelanggaran_ringan) || 0) -
    (Number(breakdown.pelanggaran_sedang) || 0) -
    (Number(breakdown.pelanggaran_berat) || 0);

  const total = ipcTotal ?? calculatedTotal ?? student?.ipc_total ?? breakdown.point_awal;

  return (
    <div className="ipc-print-sheet">
      <header className="report-header">
        <img src="/header.png" alt="SMK Negeri Bali Mandara Header" className="header-image" />
      </header>

      <div className="report-title">
        <h3>INDIVIDUAL POINT CARD</h3>
        <h3>SMK NEGERI BALI MANDARA</h3>
        <p>Tahun Ajaran {formatTahunPelajaran(printDate)}</p>
      </div>

      <section className="student-info">
        <div className="info-column-left">
          <div className="info-row">
            <span className="info-label">Nama:</span>
            <span className="info-value">{student?.nama || '-'}</span>
          </div>
          <div className="info-row">
            <span className="info-label">NIS:</span>
            <span className="info-value">{student?.nis || '-'}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Wali Kelas:</span>
            <span className="info-value">{wali?.nama || 'Wali Kelas Belum Ditentukan'}</span>
          </div>
        </div>
        <div className="info-column-right">
          <div className="info-row">
            <span className="info-label">Kelas:</span>
            <span className="info-value">{student?.kelas || '-'}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Grha:</span>
            <span className="info-value">{student?.grha || '-'}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Semester:</span>
            <span className="info-value">{formatTahunPelajaran(printDate)}</span>
          </div>
        </div>
      </section>

      <div className="ipc-table-container">
        <table className="ipc-table">
          <thead>
            <tr>
              <th colSpan="2">Point IPC</th>
            </tr>
          </thead>
          <tbody>
            <tr className="section-header">
              <td colSpan="2">I Point Awal</td>
            </tr>
            <tr>
              <td></td>
              <td className="point-value">{breakdown.point_awal}</td>
            </tr>

            <tr className="section-header">
              <td colSpan="2">II Prestasi</td>
            </tr>
            <tr>
              <td><strong>Jumlah Prestasi</strong></td>
              <td className="point-value subtotal"><strong>{Number(breakdown.prestasi) || 0}</strong></td>
            </tr>

            <tr className="section-header">
              <td colSpan="2">III Perkembangan Karakter</td>
            </tr>
            <tr>
              <td>1. Tanggung Jawab</td>
              <td className="point-value">{breakdown.tanggung_jawab}</td>
            </tr>
            <tr>
              <td>2. Disiplin</td>
              <td className="point-value">{breakdown.disiplin}</td>
            </tr>
            <tr>
              <td>3. Kepedulian</td>
              <td className="point-value">{breakdown.kepedulian}</td>
            </tr>
            <tr>
              <td>4. Kemandirian</td>
              <td className="point-value">{breakdown.kemandirian}</td>
            </tr>
            <tr>
              <td>5. Spiritual</td>
              <td className="point-value">{breakdown.spiritual}</td>
            </tr>
            <tr>
              <td>6. Kejujuran</td>
              <td className="point-value">{breakdown.kejujuran}</td>
            </tr>
            <tr>
              <td>7. Kepercayaan Diri</td>
              <td className="point-value">{breakdown.kepercayaan_diri}</td>
            </tr>
            <tr className="subtotal-row">
              <td><strong>Jumlah Perkembangan Karakter</strong></td>
              <td className="point-value subtotal"><strong>{(Number(breakdown.tanggung_jawab) || 0) + (Number(breakdown.disiplin) || 0) + (Number(breakdown.kepedulian) || 0) + (Number(breakdown.kemandirian) || 0) + (Number(breakdown.spiritual) || 0) + (Number(breakdown.kejujuran) || 0) + (Number(breakdown.kepercayaan_diri) || 0)}</strong></td>
            </tr>

            <tr className="section-header">
              <td colSpan="2">IV Organisasi</td>
            </tr>
            <tr>
              <td></td>
              <td className="point-value">{breakdown.organisasi}</td>
            </tr>

            <tr className="section-header">
              <td colSpan="2">V Kepanitiaan</td>
            </tr>
            <tr>
              <td></td>
              <td className="point-value">{breakdown.kepanitiaan}</td>
            </tr>

            <tr className="section-header">
              <td colSpan="2">VI Event</td>
            </tr>
            <tr>
              <td></td>
              <td className="point-value">{breakdown.event}</td>
            </tr>

            <tr className="subtotal-row">
              <td><strong>Jumlah Keaktifan</strong></td>
              <td className="point-value subtotal"><strong>{(Number(breakdown.organisasi) || 0) + (Number(breakdown.kepanitiaan) || 0) + (Number(breakdown.event) || 0)}</strong></td>
            </tr>

            <tr className="section-header">
              <td colSpan="2">VII Pelanggaran</td>
            </tr>
            <tr>
              <td>1. Ringan</td>
              <td className="point-value negative">{breakdown.pelanggaran_ringan}</td>
            </tr>
            <tr>
              <td>2. Sedang</td>
              <td className="point-value negative">{breakdown.pelanggaran_sedang}</td>
            </tr>
            <tr>
              <td>3. Berat</td>
              <td className="point-value negative">{breakdown.pelanggaran_berat}</td>
            </tr>
            <tr className="subtotal-row">
              <td><strong>Jumlah Pelanggaran</strong></td>
              <td className="point-value subtotal negative"><strong>{(Number(breakdown.pelanggaran_ringan) || 0) + (Number(breakdown.pelanggaran_sedang) || 0) + (Number(breakdown.pelanggaran_berat) || 0)}</strong></td>
            </tr>

            <tr className="total-row">
              <td><strong>TOTAL POINT IPC</strong></td>
              <td className="point-value total"><strong>{total}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>

      <section className="signatures">
        <div className="signature-block">
          <p>Kubutambahan, {formatPrintDate(printDate)}</p>
          <p className="signature-title">{branding.kepalaSekolah.titleLine}</p>
          <div className="signature-space"></div>
          <p className="signature-name">{branding.kepalaSekolah.nama}</p>
          <p className="signature-nip">{branding.kepalaSekolah.nip ? `NIP. ${branding.kepalaSekolah.nip}` : ''}</p>
        </div>
        <div className="signature-block">
          <p>Kubutambahan, {formatPrintDate(printDate)}</p>
          <p className="signature-title">Wali Kelas</p>
          <div className="signature-space"></div>
          <p className="signature-name">{wali?.nama || 'Wali Kelas Belum Ditentukan'}</p>
          <p className="signature-nip">{wali?.nip ? `NIP. ${wali.nip}` : ''}</p>
        </div>
      </section>
    </div>
  );
}

export default IpcPrintSheet;
export { formatTahunPelajaran, formatPrintDate };
