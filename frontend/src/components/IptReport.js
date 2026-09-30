import React, { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { useMinIptPerGrade, minIptFor, isBelowMinIpt } from '../utils/minIpt';
import './IptReport.css';

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

function IptReport({ studentId, onClose }) {
  const minIpt = useMinIptPerGrade();
  const [studentData, setStudentData] = useState(null);
  const [iptData, setIptData] = useState(null);
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

      // Fetch IPT card data (includes breakdown)
      const iptResponse = await api.get(`/reports/ipt-card/${studentId}`);

      // Extract wali kelas data from IPT card response
      const waliKelasData = iptResponse.data.wali || { nama: null, nip: null };

      // Merge wali kelas data into student data
      const studentDataWithWali = {
        ...studentResponse.data,
        wali_kelas_nama: waliKelasData.nama,
        wali_kelas_nip: waliKelasData.nip
      };

      setStudentData(studentDataWithWali);
      setIptData(iptResponse.data.points);
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
  const calculatedTotal = iptData ? (
    (Number(iptData.point_awal) || 80) +
    (Number(iptData.prestasi) || 0) +
    (Number(iptData.tanggung_jawab) || 0) +
    (Number(iptData.disiplin) || 0) +
    (Number(iptData.kepedulian) || 0) +
    (Number(iptData.kemandirian) || 0) +
    (Number(iptData.spiritual) || 0) +
    (Number(iptData.kejujuran) || 0) +
    (Number(iptData.kepercayaan_diri) || 0) +
    (Number(iptData.organisasi) || 0) +
    (Number(iptData.kepanitiaan) || 0) +
    (Number(iptData.event) || 0) -
    (Number(iptData.pelanggaran_ringan) || 0) -
    (Number(iptData.pelanggaran_sedang) || 0) -
    (Number(iptData.pelanggaran_berat) || 0)
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

  if (!studentData || !iptData) {
    return <div className="card">Data tidak tersedia</div>;
  }

  const total = calculatedTotal;

  return (
    <div className="ipt-report-container">
      <div className="ipt-report">
        {/* Header */}
        <div className="report-header">
          <img src="./public/logo.png" alt="Logo" />
        </div>

        <div className="report-divider"></div>

        {/* Title */}
        <div className="report-title">
          <h2>INDIVIDUAL POINT TALENT</h2>
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

        {/* IPT Points Table */}
        <div className="ipt-table-container">
          <table className="ipt-table">
            <thead>
              <tr>
                <th colSpan="2">Point IPT</th>
              </tr>
            </thead>
            <tbody>
              <tr className="section-header">
                <td colSpan="2">I Point Awal</td>
              </tr>
              <tr>
                <td></td>
                <td className="point-value">{iptData?.point_awal || 80}</td>
              </tr>

              <tr className="section-header">
                <td colSpan="2">II Prestasi</td>
              </tr>
              <tr>
                <td><strong>Jumlah Prestasi</strong></td>
                <td className="point-value subtotal"><strong>{Number(iptData?.prestasi) || 0}</strong></td>
              </tr>

              <tr className="section-header">
                <td colSpan="2">III Perkembangan Karakter</td>
              </tr>
              <tr>
                <td>1. Tanggung Jawab</td>
                <td className="point-value">{iptData?.tanggung_jawab || 0}</td>
              </tr>
              <tr>
                <td>2. Disiplin</td>
                <td className="point-value">{iptData?.disiplin || 0}</td>
              </tr>
              <tr>
                <td>3. Kepedulian</td>
                <td className="point-value">{iptData?.kepedulian || 0}</td>
              </tr>
              <tr>
                <td>4. Kemandirian</td>
                <td className="point-value">{iptData?.kemandirian || 0}</td>
              </tr>
              <tr>
                <td>5. Spiritual</td>
                <td className="point-value">{iptData?.spiritual || 0}</td>
              </tr>
              <tr>
                <td>6. Kejujuran</td>
                <td className="point-value">{iptData?.kejujuran || 0}</td>
              </tr>
              <tr>
                <td>7. Kepercayaan Diri</td>
                <td className="point-value">{iptData?.kepercayaan_diri || 0}</td>
              </tr>
              <tr className="subtotal-row">
                <td><strong>Jumlah Perkembangan Karakter</strong></td>
                <td className="point-value subtotal"><strong>{(Number(iptData?.tanggung_jawab) || 0) + (Number(iptData?.disiplin) || 0) + (Number(iptData?.kepedulian) || 0) + (Number(iptData?.kemandirian) || 0) + (Number(iptData?.spiritual) || 0) + (Number(iptData?.kejujuran) || 0) + (Number(iptData?.kepercayaan_diri) || 0)}</strong></td>
              </tr>

              <tr className="section-header">
                <td colSpan="2">IV Organisasi</td>
              </tr>
              <tr>
                <td></td>
                <td className="point-value">{iptData?.organisasi || 0}</td>
              </tr>

              <tr className="section-header">
                <td colSpan="2">V Kepanitiaan</td>
              </tr>
              <tr>
                <td></td>
                <td className="point-value">{iptData?.kepanitiaan || 0}</td>
              </tr>

              <tr className="section-header">
                <td colSpan="2">VI Event</td>
              </tr>
              <tr>
                <td></td>
                <td className="point-value">{iptData?.event || 0}</td>
              </tr>

              <tr className="subtotal-row">
                <td><strong>Jumlah Keaktifan</strong></td>
                <td className="point-value subtotal"><strong>{(Number(iptData?.organisasi) || 0) + (Number(iptData?.kepanitiaan) || 0) + (Number(iptData?.event) || 0)}</strong></td>
              </tr>

              <tr className="section-header">
                <td colSpan="2">VII Pelanggaran</td>
              </tr>
              <tr>
                <td>1. Ringan</td>
                <td className="point-value negative">{iptData?.pelanggaran_ringan || 0}</td>
              </tr>
              <tr>
                <td>2. Sedang</td>
                <td className="point-value negative">{iptData?.pelanggaran_sedang || 0}</td>
              </tr>
              <tr>
                <td>3. Berat</td>
                <td className="point-value negative">{iptData?.pelanggaran_berat || 0}</td>
              </tr>
              <tr className="subtotal-row">
                <td><strong>Jumlah Pelanggaran</strong></td>
                <td className="point-value subtotal negative"><strong>{(Number(iptData?.pelanggaran_ringan) || 0) + (Number(iptData?.pelanggaran_sedang) || 0) + (Number(iptData?.pelanggaran_berat) || 0)}</strong></td>
              </tr>

              <tr className="total-row">
                <td><strong>TOTAL POINT IPT</strong></td>
                <td className={`point-value total ${total < 0 || isBelowMinIpt(total, minIptFor(minIpt, studentData?.kelas)) ? 'total-minus' : ''}`}><strong>{formatTotal(total)}</strong></td>
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

export default IptReport;
