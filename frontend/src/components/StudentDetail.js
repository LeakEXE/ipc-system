import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import API_BASE_URL from '../config';
import { useMinIpcPerGrade, minIpcFor, isBelowMinIpc } from '../utils/minIpc';
import { formatDisplayText } from '../utils/formatDisplayText';
import StudentRecordsHistory from './StudentRecordsHistory';
import { User } from 'lucide-react';

function StudentDetail({ student, onClose }) {
    const minIpc = useMinIpcPerGrade();
    const [records, setRecords] = useState(null);
    const [ipcHistory, setIpcHistory] = useState([]);
    const [ipcCard, setIpcCard] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

    useEffect(() => {
        const handleResize = () => {
            setIsMobile(window.innerWidth <= 768);
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        if (!student?.id) return;

        const fetchData = async () => {
            try {
                const [recordsRes, historyRes] = await Promise.all([
                    api.get(`/users/${student.id}/records`),
                    api.get(`/users/${student.id}/ipc-history`)
                ]);
                setRecords(recordsRes.data);
                setIpcHistory(historyRes.data || []);
                const ipcCardRes = await api.get(`/reports/ipc-card/${student.id}`);
                setIpcCard(ipcCardRes.data);
            } catch (err) {
                setError(err.response?.data?.message || 'Gagal memuat detail siswa');
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [student?.id]);

    const avatarUrl = student?.foto
        ? `${API_BASE_URL.replace('/api', '')}${student.foto}`
        : null;
    const ipcGroups = [
        { title: 'Dasar', rows: [['Point Awal', 'point_awal']] },
        { title: 'Prestasi', rows: [['Prestasi', 'prestasi']] },
        {
            title: 'Perkembangan Karakter',
            rows: [
                ['Tanggung Jawab', 'tanggung_jawab'], ['Disiplin', 'disiplin'],
                ['Kepedulian', 'kepedulian'], ['Kemandirian', 'kemandirian'],
                ['Spiritual', 'spiritual'], ['Kejujuran', 'kejujuran'],
                ['Kepercayaan Diri', 'kepercayaan_diri']
            ]
        },
        { title: 'Keaktifan', rows: [['Organisasi', 'organisasi'], ['Kepanitiaan', 'kepanitiaan'], ['Event', 'event']] },
        { title: 'Pelanggaran', rows: [['Ringan', 'pelanggaran_ringan'], ['Sedang', 'pelanggaran_sedang'], ['Berat', 'pelanggaran_berat']] }
    ];

    return (
        <div className="app-modal-overlay" style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            zIndex: 1500,
            overflow: 'auto',
            padding: 20
        }}>
            <div style={{
                maxWidth: 900,
                margin: isMobile ? '20px auto' : '80px auto 0 auto',
                background: 'var(--bg-primary, #fff)',
                borderRadius: 12,
                padding: 24,
                minHeight: 200
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                    <h2 style={{ margin: 0 }}>Detail Siswa</h2>
                    <button type="button" className="btn btn-secondary" onClick={onClose}>Tutup</button>
                </div>

                {loading ? (
                    <div className="loading"><div className="spinner"></div></div>
                ) : error ? (
                    <div className="alert alert-danger">{error}</div>
                ) : (
                    <>
                        <div className="card" style={{ marginBottom: 20 }}>
                            <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                                <div style={{
                                    width: 80,
                                    height: 80,
                                    borderRadius: '50%',
                                    overflow: 'hidden',
                                    background: '#f0f0f0',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0
                                }}>
                                    {avatarUrl ? (
                                        <img src={avatarUrl} alt={student.nama} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                        <span style={{ display: 'inline-flex', color: '#94a3b8' }}><User size={36} /></span>
                                    )}
                                </div>
                                <div>
                                    <h3 style={{ margin: '0 0 8px 0' }}>{student.nama}</h3>
                                    <p style={{ margin: '4px 0', color: '#666' }}>NIS: {student.nis || '-'}</p>
                                    <p style={{ margin: '4px 0', color: '#666' }}>
                                        {student.kelas || '-'} · {student.grha || '-'}
                                    </p>
                                    <p style={{ margin: '8px 0 0 0' }}>
                                        <strong>IPC:</strong>{' '}
                                        <span style={{ 
                                            fontSize: 20, 
                                            color: (student.ipc_total ?? 0) < 0 || isBelowMinIpc(student.ipc_total ?? 0, minIpcFor(minIpc, student?.kelas)) ? '#dc2626' : 'var(--blue)', 
                                            fontWeight: 'bold' 
                                        }}>
                                            {(student.ipc_total ?? 0) < 0 ? `${student.ipc_total ?? 0} (MINUS)` : (student.ipc_total ?? 0)}
                                        </span>
                                    </p>
                                </div>
                            </div>
                        </div>

                        {records && (
                            <StudentRecordsHistory
                                records={records}
                                title="Riwayat Prestasi & Kegiatan"
                                showAllTabs
                            />
                        )}

                        <div className="card">
                            <h3>Detail IPC</h3>
                            {ipcCard?.points ? (
                                <div style={{ display: 'grid', gap: 16 }}>
                                    {ipcGroups.map((group) => (
                                        <div key={group.title}>
                                            <strong style={{ display: 'block', marginBottom: 8 }}>{group.title}</strong>
                                            <div style={{ display: 'grid', gap: 6 }}>
                                                {group.rows.map(([label, key]) => {
                                                    const value = Number(ipcCard.points[key]) || 0;
                                                    const displayValue = group.title === 'Pelanggaran' ? -value : value;
                                                    return (
                                                        <div key={key} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: 4 }}>
                                                            <span>{label}</span>
                                                            <strong style={{ color: displayValue < 0 ? '#dc2626' : 'inherit' }}>
                                                                {displayValue > 0 ? '+' : ''}{displayValue}
                                                            </strong>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-muted">Detail IPC belum tersedia</p>
                            )}
                        </div>

                        <div className="card">
                            <h3>Riwayat IPC</h3>
                            {ipcHistory.length > 0 ? (
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th>Jenis</th>
                                            <th>Perubahan</th>
                                            <th>IPC</th>
                                            {!isMobile && <th>Keterangan</th>}
                                            {!isMobile && <th>Tanggal</th>}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {ipcHistory.map((row) => (
                                            <tr key={row.id}>
                                                <td>{formatDisplayText(row.jenis_perubahan)}</td>
                                                <td style={{ color: row.point_change >= 0 ? 'green' : 'red' }}>
                                                    {row.point_change >= 0 ? '+' : ''}{row.point_change}
                                                </td>
                                                <td>{row.ipc_sebelum} → {row.ipc_sesudah}</td>
                                                {!isMobile && <td>{formatDisplayText(row.keterangan)}</td>}
                                                {!isMobile && <td>{new Date(row.created_at).toLocaleDateString('id-ID')}</td>}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : (
                                <p className="text-muted">Belum ada riwayat IPC</p>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

export default StudentDetail;
