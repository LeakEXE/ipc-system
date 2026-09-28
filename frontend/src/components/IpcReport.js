import React, { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { useMinIpcPerGrade, minIpcFor, isBelowMinIpc } from '../utils/minIpc';
import './IpcReport.css';

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

function IpcReport({ studentId, onClose }) {
  const minIpc = useMinIpcPerGrade();
  const [studentData, setStudentData] = useState(null);
  const [ipcData, setIpcData] = useState(null);
  const [schoolConfig, setSchoolConfig] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReportData();
    fetchSchoolConfig();
  }, [studentId]);

  const fetchReportData = async () => {
    try {
      // Fetch student data
      const studentResponse = await api.get(`/users/${studentId}`);

      // Fetch IPC card data (includes breakdown)
      const ipcResponse = await api.get(`/reports/ipc-card/${studentId}`);

      // Extract wali kelas data from IPC card response
      const waliKelasData = ipcResponse.data.wali || { nama: null, nip: null };

      // Merge wali kelas data into student data
      const studentDataWithWali = {
        ...studentResponse.data,
        wali_kelas_nama: waliKelasData.nama,
        wali_kelas_nip: waliKelasData.nip
      };

      setStudentData(studentDataWithWali);
      setIpcData(ipcResponse.data.points);
    } catch (error) {
      console.error('Error fetching report data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);

  const fetchSchoolConfig = async () => {
    try {
      const response = await api.get('/school-config');
      setSchoolConfig(response.data);
    } catch (error) {
      console.error('Error fetching school config:', error);
      setSchoolConfig({
        school_name: 'SMK Negeri Bali Mandara',
        principal_name: '',
        principal_nip: ''
      });
    }
  };

  // Use the breakdown total from backend for consistency
  const calculatedTotal = ipcData ? (
    (Number(ipcData.point_awal) || 80) +
    (Number(ipcData.prestasi) || 0) +
    (Number(ipcData.tanggung_jawab) || 0) +
    (Number(ipcData.disiplin) || 0) +
    (Number(ipcData.kepedulian) || 0) +
    (Number(ipcData.kemandirian) || 0) +
    (Number(ipcData.spiritual) || 0) +
    (Number(ipcData.kejujuran) || 0) +
    (Number(ipcData.kepercayaan_diri) || 0) +
    (Number(ipcData.organisasi) || 0) +
    (Number(ipcData.kepanitiaan) || 0) +
    (Number(ipcData.event) || 0) -
    (Number(ipcData.pelanggaran_ringan) || 0) -
    (Number(ipcData.pelanggaran_sedang) || 0) -
    (Number(ipcData.pelanggaran_berat) || 0)
  ) : 0;

  // Format total with negative indicator
  const formatTotal = (value) => {
    if (value < 0) {
      return `${value} (MINUS)`;
    }
    return value;
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>;
  }

  if (!studentData || !ipcData) {
    return <div className="card">Data tidak tersedia</div>;
  }

  const total = calculatedTotal;

  return (
    <div className="ipc-report-container">
      <div className="ipc-report">
        {/* Header */}
        <div className="report-header">
          <img src="./public/logo.png" alt="Logo" />
        </div>

        <div className="report-divider"></div>

        {/* Title */}
        <div className="report-title">
          <h2>INDIVIDUAL POINT CARD</h2>
          <p>Tahun Ajaran {formatTahunPelajaran()}</p>
        </div>

        {/* Student Information */}
        <div className="student-info">
          <div className="info-row">
            <span className="info-label">Nama:</span>
            <span className="info-value">{studentData.nama}</span>
          </div>
          <div className="info-row">
            <span className="info-label">NIS:</span>
            <span className="info-value">{studentData.nis || '-'}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Kelas:</span>
            <span className="info-value">{studentData.kelas}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Grha:</span>
            <span className="info-value">{studentData.grha}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Wali Kelas:</span>
            <span className="info-value">{studentData.wali_kelas_nama || studentData.wali_kelas || 'Wali Kelas Belum Ditentukan'}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Semester:</span>
            <span className="info-value">{formatTahunPelajaran()}</span>
          </div>
        </div>

        {/* IPC Points Table */}
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
                <td className="point-value">{ipcData?.point_awal || 80}</td>
              </tr>

              <tr className="section-header">
                <td colSpan="2">II Prestasi</td>
              </tr>
              <tr>
                <td><strong>Jumlah Prestasi</strong></td>
                <td className="point-value subtotal"><strong>{Number(ipcData?.prestasi) || 0}</strong></td>
              </tr>

              <tr className="section-header">
                <td colSpan="2">III Perkembangan Karakter</td>
              </tr>
              <tr>
                <td>1. Tanggung Jawab</td>
                <td className="point-value">{ipcData?.tanggung_jawab || 0}</td>
              </tr>
              <tr>
                <td>2. Disiplin</td>
                <td className="point-value">{ipcData?.disiplin || 0}</td>
              </tr>
              <tr>
                <td>3. Kepedulian</td>
                <td className="point-value">{ipcData?.kepedulian || 0}</td>
              </tr>
              <tr>
                <td>4. Kemandirian</td>
                <td className="point-value">{ipcData?.kemandirian || 0}</td>
              </tr>
              <tr>
                <td>5. Spiritual</td>
                <td className="point-value">{ipcData?.spiritual || 0}</td>
              </tr>
              <tr>
                <td>6. Kejujuran</td>
                <td className="point-value">{ipcData?.kejujuran || 0}</td>
              </tr>
              <tr>
                <td>7. Kepercayaan Diri</td>
                <td className="point-value">{ipcData?.kepercayaan_diri || 0}</td>
              </tr>
              <tr className="subtotal-row">
                <td><strong>Jumlah Perkembangan Karakter</strong></td>
                <td className="point-value subtotal"><strong>{(Number(ipcData?.tanggung_jawab) || 0) + (Number(ipcData?.disiplin) || 0) + (Number(ipcData?.kepedulian) || 0) + (Number(ipcData?.kemandirian) || 0) + (Number(ipcData?.spiritual) || 0) + (Number(ipcData?.kejujuran) || 0) + (Number(ipcData?.kepercayaan_diri) || 0)}</strong></td>
              </tr>

              <tr className="section-header">
                <td colSpan="2">IV Organisasi</td>
              </tr>
              <tr>
                <td></td>
                <td className="point-value">{ipcData?.organisasi || 0}</td>
              </tr>

              <tr className="section-header">
                <td colSpan="2">V Kepanitiaan</td>
              </tr>
              <tr>
                <td></td>
                <td className="point-value">{ipcData?.kepanitiaan || 0}</td>
              </tr>

              <tr className="section-header">
                <td colSpan="2">VI Event</td>
              </tr>
              <tr>
                <td></td>
                <td className="point-value">{ipcData?.event || 0}</td>
              </tr>

              <tr className="subtotal-row">
                <td><strong>Jumlah Keaktifan</strong></td>
                <td className="point-value subtotal"><strong>{(Number(ipcData?.organisasi) || 0) + (Number(ipcData?.kepanitiaan) || 0) + (Number(ipcData?.event) || 0)}</strong></td>
              </tr>

              <tr className="section-header">
                <td colSpan="2">VII Pelanggaran</td>
              </tr>
              <tr>
                <td>1. Ringan</td>
                <td className="point-value negative">{ipcData?.pelanggaran_ringan || 0}</td>
              </tr>
              <tr>
                <td>2. Sedang</td>
                <td className="point-value negative">{ipcData?.pelanggaran_sedang || 0}</td>
              </tr>
              <tr>
                <td>3. Berat</td>
                <td className="point-value negative">{ipcData?.pelanggaran_berat || 0}</td>
              </tr>
              <tr className="subtotal-row">
                <td><strong>Jumlah Pelanggaran</strong></td>
                <td className="point-value subtotal negative"><strong>{(Number(ipcData?.pelanggaran_ringan) || 0) + (Number(ipcData?.pelanggaran_sedang) || 0) + (Number(ipcData?.pelanggaran_berat) || 0)}</strong></td>
              </tr>

              <tr className="total-row">
                <td><strong>TOTAL POINT IPC</strong></td>
                <td className={`point-value total ${total < 0 || isBelowMinIpc(total, minIpcFor(minIpc, studentData?.kelas)) ? 'total-minus' : ''}`}><strong>{formatTotal(total)}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Signatures */}
        <div className="signatures">
          <div className="signature-block">
            <p>Kubutambahan, {formatPrintDate()}</p>
            <p className="signature-title">Kepala {schoolConfig?.school_name || 'SMK Negeri Bali Mandara'}</p>
            <div className="signature-space"></div>
            <p className="signature-name">{schoolConfig?.principal_name || ''}</p>
            <p className="signature-nip">{schoolConfig?.principal_nip ? `NIP. ${schoolConfig.principal_nip}` : ''}</p>
          </div>
          <div className="signature-block">
            <p>Kubutambahan, {formatPrintDate()}</p>
            <p className="signature-title">Wali Kelas</p>
            <div className="signature-space"></div>
            <p className="signature-name">{studentData.wali_kelas_nama || studentData.wali_kelas || 'Wali Kelas Belum Ditentukan'}</p>
            <p className="signature-nip">{studentData.wali_kelas_nip ? `NIP. ${studentData.wali_kelas_nip}` : ''}</p>
          </div>
        </div>
      </div>

      {/* Print Button */}
      <div className="report-actions">
        <button className="btn btn-primary" onClick={handlePrint}>Cetak Laporan</button>
        <button className="btn btn-danger" onClick={onClose}>Tutup</button>
      </div>
    </div>
  );
}

export default IpcReport;
