import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import API_BASE_URL from '../config';
import { toTitleCase } from '../utils/perilaku';
import { formatDisplayText } from '../utils/formatDisplayText';
import { StatusIcon } from './icons';
import { Camera, Inbox } from 'lucide-react';

function ApprovalsV2() {
  const PAGE_BG = 'var(--bg-secondary)';
  const CARD = 'var(--bg-primary)';
  const BORDER = 'var(--border-color)';
  const TEXT = 'var(--ink)';
  const MUTED = 'var(--slate)';
  const BLUE = 'var(--blue)';
  const BLUE_DARK = 'var(--blue-dark)';
  const AMBER = 'var(--warning-color)';
  const AMBER_BG = 'var(--amber-bg)';
  const GREEN = 'var(--success-color)';
  const GREEN_DARK = '#059669';
  const RED = 'var(--danger-color)';
  const RED_DARK = 'var(--danger-dark)';
  const RADIUS = 'var(--card-radius)';
  const [activeTab, setActiveTab] = useState('prestasi');
  const [approvals, setApprovals] = useState({
    prestasi: [],
    event: [],
    organisasi: [],
    kepanitiaan: [],
    pelanggaran: [],
    perilaku: [],
    biodata: [],
    student_creation: []
  });
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState(null);
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState('');
  // Enlarged photo popup (same pattern as DriveViewer: URL string or null)
  const [previewImage, setPreviewImage] = useState(null);
  const [previewError, setPreviewError] = useState(false);

  useEffect(() => {
    fetchApprovals();
  }, []);

  const fetchApprovals = async () => {
    try {
      const [approvalsRes, biodataRes, studentCreationRes] = await Promise.all([
        api.get('/approvals-v2/all'),
        api.get('/users/biodata-approvals'),
        api.get('/users/student-creation-approvals')
      ]);
      setApprovals({
        ...approvalsRes.data,
        biodata: biodataRes.data || [],
        student_creation: studentCreationRes.data || []
      });
    } catch (error) {
      console.error('Error fetching approvals:', error);
      setMessage('Gagal memuat data approvals');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (type, id) => {
    try {
      if (type === 'biodata') {
        await api.put(`/users/biodata-approvals/${id}`, {
          status: 'approved',
          notes: notes || 'Disetujui'
        });
      } else if (type === 'student_creation') {
        await api.put(`/users/student-creation-approvals/${id}`, {
          status: 'approved',
          notes: notes || 'Disetujui'
        });
      } else {
        await api.put(`/approvals-v2/superadmin/${type}/${id}`, {
          status: 'approved',
          notes: notes || 'Disetujui'
        });
      }
      
      const typeLabels = {
        biodata: 'Update biodata',
        student_creation: 'Pembuatan akun siswa',
        prestasi: 'Prestasi',
        event: 'Event',
        organisasi: 'Organisasi',
        kepanitiaan: 'Kepanitiaan',
        pelanggaran: 'Pelanggaran',
        perilaku: 'Perilaku'
      };
      setMessage(`${typeLabels[type] || type} berhasil disetujui!`);
      setSelectedItem(null);
      setNotes('');
      fetchApprovals();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Gagal menyetujui');
    }
  };

  const handleReject = async (type, id) => {
    try {
      if (type === 'biodata') {
        await api.put(`/users/biodata-approvals/${id}`, {
          status: 'rejected',
          notes: notes || 'Ditolak'
        });
      } else if (type === 'student_creation') {
        await api.put(`/users/student-creation-approvals/${id}`, {
          status: 'rejected',
          notes: notes || 'Ditolak'
        });
      } else {
        await api.put(`/approvals-v2/superadmin/${type}/${id}`, {
          status: 'rejected',
          notes: notes || 'Ditolak'
        });
      }
      
      const typeLabels = {
        biodata: 'Update biodata',
        student_creation: 'Pembuatan akun siswa',
        prestasi: 'Prestasi',
        event: 'Event',
        organisasi: 'Organisasi',
        kepanitiaan: 'Kepanitiaan',
        pelanggaran: 'Pelanggaran',
        perilaku: 'Perilaku'
      };
      setMessage(`${typeLabels[type] || type} ditolak`);
      setSelectedItem(null);
      setNotes('');
      fetchApprovals();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Gagal menolak');
    }
  };


  const getApprovalStatus = (item) => item.superadmin_status || item.status || 'pending';

  const renderTable = (data, type) => {
    if (data.length === 0) {
      return (
        <div style={{
          padding: "60px 20px",
          textAlign: "center",
          color: MUTED
        }}>
          <span style={{ display: 'inline-flex', color: 'var(--muted-light)' }}><Inbox size={34} /></span>
          <strong style={{ color: TEXT, display: "block", marginBottom: "4px", fontSize: "15px" }}>Belum ada pengajuan {type}</strong>
          Pengajuan baru akan muncul di sini untuk ditinjau.
        </div>
      );
    }

    const columns = {
      prestasi: ['Diajukan Oleh', 'Nama', 'NIS', 'Lomba', 'Juara', 'Kategori', 'Foto', 'Status', 'Aksi'],
      event: ['Diajukan Oleh', 'Nama', 'NIS', 'Event', 'Tingkat', 'Foto', 'Status', 'Aksi'],
      organisasi: ['Diajukan Oleh', 'Nama', 'NIS', 'Organisasi', 'Jabatan', 'Foto', 'Status', 'Aksi'],
      kepanitiaan: ['Diajukan Oleh', 'Nama', 'NIS', 'Kepanitiaan', 'Jabatan', 'Foto', 'Status', 'Aksi'],
      pelanggaran: ['Diajukan Oleh', 'Nama', 'NIS', 'Keterangan', 'Jenis', 'Foto', 'Status', 'Aksi'],
      perilaku: ['Diajukan Oleh', 'Nama', 'NIS', 'Karakter', 'Status', 'Aksi'],
    };

    const getPhotoUrl = (path, uploadFolder = 'approvals') => {
      if (!path) return null;
      if (path.startsWith('http://') || path.startsWith('https://')) {
        return path;
      }
      let cleanPath = path;
      // Handle organized paths (uploads/approved/type/filename)
      if (path.includes('approved')) {
        cleanPath = path.replace(/\\/g, '/');
        if (!cleanPath.startsWith('/')) {
          cleanPath = `/${cleanPath}`;
        }
      } else if (path.includes('\\') || path.includes(':')) {
        cleanPath = path.split('\\').pop();
        cleanPath = `/uploads/${uploadFolder}/${cleanPath}`;
      } else if (!cleanPath.startsWith('/')) {
        // Paths saved by the backend are already relative to the uploads root
        // (e.g. "uploads/event/filename.jpg") — just root them, don't nest
        // them under the fallback folder again.
        cleanPath = cleanPath.startsWith('uploads/')
          ? `/${cleanPath}`
          : `/uploads/${uploadFolder}/${cleanPath}`;
      }
      return `${API_BASE_URL.replace('/api', '')}${cleanPath}`;
    };

    const getItemPhoto = (item, itemType) => {
      // `foto` is the actual column name returned by the approvals API
      // (`foto_path` kept as fallback for legacy rows).
      const foto = item.foto || item.foto_path;
      if (!foto) return null;
      if (itemType === 'pelanggaran') {
        return getPhotoUrl(foto, 'pelanggaran');
      }
      return getPhotoUrl(foto);
    };

    const usesApprovalStatus = !['biodata', 'student_creation'].includes(type);

    // Get data columns for mobile cards (exclude diajukan, nama, nis, foto, status, aksi)
    const dataCols = columns[type].filter(c => 
      c !== 'Diajukan Oleh' && c !== 'Nama' && c !== 'NIS' && c !== 'Foto' && c !== 'Status' && c !== 'Aksi'
    );

    const getFieldLabel = (col) => {
      const labelMap = {
        'Lomba': 'Lomba',
        'Juara': 'Juara',
        'Kategori': 'Kategori',
        'Event': 'Event',
        'Tingkat': 'Tingkat',
        'Organisasi': 'Organisasi',
        'Jabatan': 'Jabatan',
        'Kepanitiaan': 'Kepanitiaan',
        'Keterangan': 'Keterangan',
        'Jenis': 'Jenis',
        'Karakter': 'Karakter'
      };
      return labelMap[col] || col;
    };

    const getFieldValue = (item, col, type) => {
      if (type === 'prestasi') {
        if (col === 'Lomba') return item.nama_lomba;
        if (col === 'Juara') return formatDisplayText(item.juara);
        if (col === 'Kategori') return formatDisplayText(item.kategori);
      }
      if (type === 'event') {
        if (col === 'Event') return item.nama_event;
        if (col === 'Tingkat') return formatDisplayText(item.tingkat);
      }
      if (type === 'organisasi') {
        if (col === 'Organisasi') return item.kategori_organisasi;
        if (col === 'Jabatan') return item.jabatan_organisasi;
      }
      if (type === 'kepanitiaan') {
        if (col === 'Kepanitiaan') return item.kategori_kepanitiaan;
        if (col === 'Jabatan') return item.jabatan_kepanitiaan;
      }
      if (type === 'pelanggaran') {
        if (col === 'Keterangan') return item.keterangan;
        if (col === 'Jenis') return item.jenis_pelanggaran;
      }
      if (type === 'perilaku') {
        if (col === 'Karakter') return toTitleCase(item.karakter_siswa);
      }
      return '';
    };

    const renderMobileCard = (item) => {
      const status = getApprovalStatus(item);
      const isPending = status === 'pending';

      return (
        <div key={item.id} style={{
          borderBottom: `1px solid ${BORDER}`,
          padding: '16px',
          animation: 'fadeSlide 0.28s ease'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '10px',
            marginBottom: '10px'
          }}>
            <div>
              <div style={{ fontWeight: '700', fontSize: '15px', color: TEXT }}>{item.nama}</div>
              <div style={{ fontWeight: '500', fontSize: '12.5px', color: MUTED, marginTop: '2px' }}>
                NIS {item.nis} · diajukan oleh {item.user_name || 'Unknown'}
              </div>
            </div>
            {isPending ? (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '999px',
                fontSize: '12.5px',
                fontWeight: '700',
                whiteSpace: 'nowrap',
                background: AMBER_BG,
                color: '#a86a05'
              }}>
                <span style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: AMBER,
                  animation: 'blink 1.4s ease-in-out infinite'
                }}></span>
                MENUNGGU
              </span>
            ) : status === 'approved' ? (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '999px',
                fontSize: '12.5px',
                fontWeight: '700',
                whiteSpace: 'nowrap',
                background: '#e5f7ee',
                color: GREEN_DARK
              }}><StatusIcon status="approved" /> DISETUJUI</span>
            ) : (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '999px',
                fontSize: '12.5px',
                fontWeight: '700',
                whiteSpace: 'nowrap',
                background: '#fdeaea',
                color: RED_DARK
              }}><StatusIcon status="rejected" /> DITOLAK</span>
            )}
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '8px 14px',
            marginBottom: '12px'
          }}>
            {dataCols.map(col => (
              <div key={col}>
                <div style={{
                  fontSize: '10.5px',
                  textTransform: 'uppercase',
                  letterSpacing: '.03em',
                  color: MUTED,
                  fontWeight: '700',
                  marginBottom: '2px'
                }}>{getFieldLabel(col)}</div>
                <div style={{ fontSize: '13.5px', color: TEXT }}>{getFieldValue(item, col, type)}</div>
              </div>
            ))}
            {usesApprovalStatus && type !== 'perilaku' && (
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{
                  fontSize: '10.5px',
                  textTransform: 'uppercase',
                  letterSpacing: '.03em',
                  color: MUTED,
                  fontWeight: '700',
                  marginBottom: '2px'
                }}>Foto</div>
                <div style={{ fontSize: '13.5px' }}>
                  {getItemPhoto(item, type) ? (
                    <button
                      onClick={() => { setPreviewError(false); setPreviewImage(getItemPhoto(item, type)); }}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        color: BLUE,
                        fontWeight: '600',
                        fontSize: '13.5px',
                        fontFamily: 'inherit',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <Camera size={14} /> Foto Bukti
                    </button>
                  ) : (
                    <span style={{ color: MUTED }}>-</span>
                  )}
                </div>
              </div>
            )}
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            flexWrap: 'wrap'
          }}>
            {isPending ? (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button 
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 14px',
                    fontSize: '13px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    color: '#fff',
                    background: GREEN,
                    boxShadow: '0 4px 10px -4px rgba(22,168,117,.5)',
                    transition: 'filter 0.15s ease, transform 0.1s ease, box-shadow 0.15s ease'
                  }}
                  onClick={() => setSelectedItem({ ...item, type })}
                >
                  <StatusIcon status="approved" /> Setuju
                </button>
                <button 
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 14px',
                    fontSize: '13px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    color: '#fff',
                    background: RED,
                    boxShadow: '0 4px 10px -4px rgba(227,72,72,.5)',
                    transition: 'filter 0.15s ease, transform 0.1s ease, box-shadow 0.15s ease'
                  }}
                  onClick={() => setSelectedItem({ ...item, type, action: 'reject' })}
                >
                  <StatusIcon status="rejected" /> Tolak
                </button>
              </div>
            ) : (
              <span style={{ color: MUTED, fontSize: "12.5px" }}>Selesai diproses</span>
            )}
          </div>
        </div>
      );
    };

    return (
      <>
        <style>{`
          @keyframes fadeSlide {
            from { opacity: 0; transform: translateY(6px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes approvalFade {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes blink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.25; }
          }
          @media (max-width: 768px) {
            .desktop-table { display: none !important; }
            .mobile-cards { display: block !important; }
          }
          @media (min-width: 769px) {
            .mobile-cards { display: none !important; }
            .desktop-table { display: table !important; }
          }
          /* Photo popup: leave room for the fixed sidebar on desktop
             (280px wide, 240px at <=1024px, in-flow below 769px) */
          .approval-photo-overlay { left: 0; }
          @media (min-width: 769px) and (max-width: 1024px) {
            .approval-photo-overlay { left: 240px; }
          }
          @media (min-width: 1025px) {
            .approval-photo-overlay { left: 280px; }
          }
          @media (max-width: 480px) {
            .mobile-cards .req-fields {
              grid-template-columns: 1fr !important;
            }
          }
        `}</style>

        <table className="desktop-table" style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "14px"
        }}>
          <thead>
            <tr>
              {columns[type].map(col => (
                <th key={col} style={{
                  textAlign: "left",
                  textTransform: "uppercase",
                  letterSpacing: ".03em",
                  fontSize: "11.5px",
                  color: MUTED,
                  fontWeight: "700",
                  background: "#f8f9fc",
                  padding: "14px 18px",
                  borderBottom: `1px solid ${BORDER}`,
                  whiteSpace: "nowrap"
                }}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map(item => (
              <tr key={item.id} style={{
                transition: "background 0.15s ease"
              }}>
                <td style={{
                  padding: "16px 18px",
                  borderBottom: `1px solid ${BORDER}`,
                  verticalAlign: "middle",
                  color: MUTED
                }}>{item.user_name || 'Unknown'}</td>
                <td style={{
                  padding: "16px 18px",
                  borderBottom: `1px solid ${BORDER}`,
                  verticalAlign: "middle",
                  fontWeight: "600",
                  color: TEXT
                }}>{item.nama}</td>
                <td style={{
                  padding: "16px 18px",
                  borderBottom: `1px solid ${BORDER}`,
                  verticalAlign: "middle",
                  color: TEXT
                }}>{item.nis}</td>
                {type === 'prestasi' && (
                  <>
                    <td style={{
                      padding: "16px 18px",
                      borderBottom: `1px solid ${BORDER}`,
                      verticalAlign: "middle",
                      color: TEXT
                    }}>{item.nama_lomba}</td>
                    <td style={{
                      padding: "16px 18px",
                      borderBottom: `1px solid ${BORDER}`,
                      verticalAlign: "middle",
                      color: TEXT
                    }}>{formatDisplayText(item.juara)}</td>
                    <td style={{
                      padding: "16px 18px",
                      borderBottom: `1px solid ${BORDER}`,
                      verticalAlign: "middle",
                      color: TEXT
                    }}>{formatDisplayText(item.kategori)}</td>
                  </>
                )}
                {type === 'event' && (
                  <>
                    <td style={{
                      padding: "16px 18px",
                      borderBottom: `1px solid ${BORDER}`,
                      verticalAlign: "middle",
                      color: TEXT
                    }}>{item.nama_event}</td>
                    <td style={{
                      padding: "16px 18px",
                      borderBottom: `1px solid ${BORDER}`,
                      verticalAlign: "middle",
                      color: TEXT
                    }}>{formatDisplayText(item.tingkat)}</td>
                  </>
                )}
                {type === 'organisasi' && (
                  <>
                    <td style={{
                      padding: "16px 18px",
                      borderBottom: `1px solid ${BORDER}`,
                      verticalAlign: "middle",
                      color: TEXT
                    }}>{item.kategori_organisasi}</td>
                    <td style={{
                      padding: "16px 18px",
                      borderBottom: `1px solid ${BORDER}`,
                      verticalAlign: "middle",
                      color: TEXT
                    }}>{item.jabatan_organisasi}</td>
                  </>
                )}
                {type === 'kepanitiaan' && (
                  <>
                    <td style={{
                      padding: "16px 18px",
                      borderBottom: `1px solid ${BORDER}`,
                      verticalAlign: "middle",
                      color: TEXT
                    }}>{item.kategori_kepanitiaan}</td>
                    <td style={{
                      padding: "16px 18px",
                      borderBottom: `1px solid ${BORDER}`,
                      verticalAlign: "middle",
                      color: TEXT
                    }}>{item.jabatan_kepanitiaan}</td>
                  </>
                )}
                {type === 'pelanggaran' && (
                  <>
                    <td style={{
                      padding: "16px 18px",
                      borderBottom: `1px solid ${BORDER}`,
                      verticalAlign: "middle",
                      color: TEXT
                    }}>{item.keterangan}</td>
                    <td style={{
                      padding: "16px 18px",
                      borderBottom: `1px solid ${BORDER}`,
                      verticalAlign: "middle",
                      color: TEXT
                    }}>{item.jenis_pelanggaran}</td>
                  </>
                )}
                {type === 'perilaku' && (
                  <td style={{
                    padding: "16px 18px",
                    borderBottom: `1px solid ${BORDER}`,
                    verticalAlign: "middle",
                    color: TEXT
                  }}>{toTitleCase(item.karakter_siswa)}</td>
                )}
                {type === 'biodata' && (
                  <>
                    <td>{item.student_name}</td>
                    <td>{item.nis_lama}</td>
                    <td>{item.nis_baru}</td>
                    <td>
                      <small>
                        {item.nama_baru !== item.nama_lama && <div>Nama: {item.nama_lama} → {item.nama_baru}</div>}
                        {item.kelas_baru !== item.kelas_lama && <div>Kelas: {item.kelas_lama} → {item.kelas_baru}</div>}
                        {item.jurusan_baru !== item.jurusan_lama && <div>Jurusan: {item.jurusan_lama} → {item.jurusan_baru}</div>}
                        {item.tahun_pelajaran_baru !== item.tahun_pelajaran_lama && <div>Tahun Pelajaran: {item.tahun_pelajaran_lama} → {item.tahun_pelajaran_baru}</div>}
                        {item.grha_baru !== item.grha_lama && <div>Grha: {item.grha_lama} → {item.grha_baru}</div>}
                      </small>
                    </td>
                    <td>{item.requested_by_name}</td>
                    <td>
                      {item.superadmin_status === 'pending' ? (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 12px',
                          borderRadius: '999px',
                          fontSize: '12.5px',
                          fontWeight: '700',
                          whiteSpace: 'nowrap',
                          background: AMBER_BG,
                          color: '#a86a05'
                        }}>
                          <span style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: AMBER,
                            animation: 'blink 1.4s ease-in-out infinite'
                          }}></span>
                          MENUNGGU
                        </span>
                      ) : item.superadmin_status === 'approved' ? (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 12px',
                          borderRadius: '999px',
                          fontSize: '12.5px',
                          fontWeight: '700',
                          whiteSpace: 'nowrap',
                          background: '#e5f7ee',
                          color: GREEN_DARK
                        }}><StatusIcon status="approved" /> DISETUJUI</span>
                      ) : (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 12px',
                          borderRadius: '999px',
                          fontSize: '12.5px',
                          fontWeight: '700',
                          whiteSpace: 'nowrap',
                          background: '#fdeaea',
                          color: RED_DARK
                        }}><StatusIcon status="rejected" /> DITOLAK</span>
                      )}
                    </td>
                  </>
                )}
                {type === 'student_creation' && (
                  <>
                    <td>{item.nama}</td>
                    <td>{item.nis}</td>
                    <td>{item.kelas}</td>
                    <td>{item.requested_by_name}</td>
                    <td>
                      {item.superadmin_status === 'pending' ? (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 12px',
                          borderRadius: '999px',
                          fontSize: '12.5px',
                          fontWeight: '700',
                          whiteSpace: 'nowrap',
                          background: AMBER_BG,
                          color: '#a86a05'
                        }}>
                          <span style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: AMBER,
                            animation: 'blink 1.4s ease-in-out infinite'
                          }}></span>
                          MENUNGGU
                        </span>
                      ) : item.superadmin_status === 'approved' ? (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 12px',
                          borderRadius: '999px',
                          fontSize: '12.5px',
                          fontWeight: '700',
                          whiteSpace: 'nowrap',
                          background: '#e5f7ee',
                          color: GREEN_DARK
                        }}><StatusIcon status="approved" /> DISETUJUI</span>
                      ) : (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 12px',
                          borderRadius: '999px',
                          fontSize: '12.5px',
                          fontWeight: '700',
                          whiteSpace: 'nowrap',
                          background: '#fdeaea',
                          color: RED_DARK
                        }}><StatusIcon status="rejected" /> DITOLAK</span>
                      )}
                    </td>
                  </>
                )}
                {usesApprovalStatus && type !== 'perilaku' && (
                  <td style={{
                    padding: "16px 18px",
                    borderBottom: `1px solid ${BORDER}`,
                    verticalAlign: "middle"
                  }}>
                    {getItemPhoto(item, type) ? (
                      <div>
                        <img
                          src={getItemPhoto(item, type)}
                          alt="Foto Bukti"
                          style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '5px', cursor: 'pointer' }}
                          onClick={() => { setPreviewError(false); setPreviewImage(getItemPhoto(item, type)); }}
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            e.currentTarget.insertAdjacentHTML('afterend', '<span style="color:#6b7280;font-size:12.5px">Foto tidak ditemukan</span>');
                          }}
                          title="Klik untuk memperbesar"
                        />
                      </div>
                    ) : (
                      <span style={{ color: MUTED }}>-</span>
                    )}
                  </td>
                )}
                {usesApprovalStatus && (
                  <td style={{
                    padding: "16px 18px",
                    borderBottom: `1px solid ${BORDER}`,
                    verticalAlign: "middle"
                  }}>
                    {getApprovalStatus(item) === 'pending' ? (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 12px',
                        borderRadius: '999px',
                        fontSize: '12.5px',
                        fontWeight: '700',
                        whiteSpace: 'nowrap',
                        background: AMBER_BG,
                        color: '#a86a05'
                      }}>
                        <span style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          background: AMBER,
                          animation: 'blink 1.4s ease-in-out infinite'
                        }}></span>
                        MENUNGGU
                      </span>
                    ) : getApprovalStatus(item) === 'approved' ? (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 12px',
                        borderRadius: '999px',
                        fontSize: '12.5px',
                        fontWeight: '700',
                        whiteSpace: 'nowrap',
                        background: '#e5f7ee',
                        color: GREEN_DARK
                      }}><StatusIcon status="approved" /> DISETUJUI</span>
                    ) : (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 12px',
                        borderRadius: '999px',
                        fontSize: '12.5px',
                        fontWeight: '700',
                        whiteSpace: 'nowrap',
                        background: '#fdeaea',
                        color: RED_DARK
                      }}><StatusIcon status="rejected" /> DITOLAK</span>
                    )}
                  </td>
                )}
                <td style={{
                  padding: "16px 18px",
                  borderBottom: `1px solid ${BORDER}`,
                  verticalAlign: "middle"
                }}>
                  {type === 'biodata' || type === 'student_creation' ? (
                    item.superadmin_status === 'approved' ? (
                      <span style={{ color: MUTED, fontSize: "12.5px" }}>Selesai diproses</span>
                    ) : item.superadmin_status === 'rejected' ? (
                      <span style={{ color: MUTED, fontSize: "12.5px" }}>Selesai diproses</span>
                    ) : (
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button 
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '8px 14px',
                            fontSize: '13px',
                            fontWeight: '700',
                            cursor: 'pointer',
                            color: '#fff',
                            background: GREEN,
                            boxShadow: '0 4px 10px -4px rgba(22,168,117,.5)',
                            transition: 'filter 0.15s ease, transform 0.1s ease, box-shadow 0.15s ease'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.filter = 'brightness(1.06)'}
                          onMouseLeave={(e) => e.currentTarget.style.filter = 'brightness(1)'}
                          onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.96)'}
                          onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
                          onClick={() => setSelectedItem({ ...item, type, id: item.id })} 
                        >
                          <StatusIcon status="approved" /> Setuju
                        </button>
                        <button 
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '8px 14px',
                            fontSize: '13px',
                            fontWeight: '700',
                            cursor: 'pointer',
                            color: '#fff',
                            background: RED,
                            boxShadow: '0 4px 10px -4px rgba(227,72,72,.5)',
                            transition: 'filter 0.15s ease, transform 0.1s ease, box-shadow 0.15s ease'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.filter = 'brightness(1.06)'}
                          onMouseLeave={(e) => e.currentTarget.style.filter = 'brightness(1)'}
                          onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.96)'}
                          onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
                          onClick={() => setSelectedItem({ ...item, type, id: item.id, action: 'reject' })} 
                        >
                          <StatusIcon status="rejected" /> Tolak
                        </button>
                      </div>
                    )
                  ) : getApprovalStatus(item) === 'approved' ? (
                    <span style={{ color: MUTED, fontSize: "12.5px" }}>Selesai diproses</span>
                  ) : getApprovalStatus(item) === 'rejected' ? (
                    <span style={{ color: MUTED, fontSize: "12.5px" }}>Selesai diproses</span>
                  ) : (
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button 
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          border: 'none',
                          borderRadius: '8px',
                          padding: '8px 14px',
                          fontSize: '13px',
                          fontWeight: '700',
                          cursor: 'pointer',
                          color: '#fff',
                          background: GREEN,
                          boxShadow: '0 4px 10px -4px rgba(22,168,117,.5)',
                          transition: 'filter 0.15s ease, transform 0.1s ease, box-shadow 0.15s ease'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.filter = 'brightness(1.06)'}
                        onMouseLeave={(e) => e.currentTarget.style.filter = 'brightness(1)'}
                        onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.96)'}
                        onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
                        onClick={() => setSelectedItem({ ...item, type })} 
                      >
                        <StatusIcon status="approved" /> Setuju
                      </button>
                      <button 
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          border: 'none',
                          borderRadius: '8px',
                          padding: '8px 14px',
                          fontSize: '13px',
                          fontWeight: '700',
                          cursor: 'pointer',
                          color: '#fff',
                          background: RED,
                          boxShadow: '0 4px 10px -4px rgba(227,72,72,.5)',
                          transition: 'filter 0.15s ease, transform 0.1s ease, box-shadow 0.15s ease'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.filter = 'brightness(1.06)'}
                        onMouseLeave={(e) => e.currentTarget.style.filter = 'brightness(1)'}
                        onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.96)'}
                        onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
                        onClick={() => setSelectedItem({ ...item, type, action: 'reject' })} 
                      >
                        <StatusIcon status="rejected" /> Tolak
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mobile-cards">
          {data.map(item => renderMobileCard(item))}
        </div>
      </>
    );
  };

  if (loading) {
    return (
      <div style={{
        fontFamily: "var(--font-sans)",
        background: PAGE_BG,
        padding: "4px 4px 40px"
      }}>
        <div className="inline-loading"><div className="spinner" style={{ margin: '0 auto 12px' }}></div><strong>Memuat data...</strong></div>
      </div>
    );
  }

  const tabs = [
    { key: 'prestasi', label: 'Prestasi', count: approvals.prestasi.length },
    { key: 'event', label: 'Event', count: approvals.event.length },
    { key: 'organisasi', label: 'Organisasi', count: approvals.organisasi.length },
    { key: 'kepanitiaan', label: 'Kepanitiaan', count: approvals.kepanitiaan.length },
    { key: 'pelanggaran', label: 'Pelanggaran', count: approvals.pelanggaran?.length || 0 },
    { key: 'perilaku', label: 'Perilaku', count: approvals.perilaku?.length || 0 },
  ];

  return (
    <div style={{
      fontFamily: "var(--font-sans)",
      background: PAGE_BG,
      padding: "4px 4px 40px"
    }}>
      <h1 style={{
        fontSize: "26px",
        fontWeight: "700",
        margin: "4px 0 20px",
        letterSpacing: "-0.01em",
        color: TEXT
      }}>Approvals</h1>

      {message && (
        <div style={{
          background: message.includes('disetujui') ? '#e5f7ee' : message.includes('ditolak') ? '#fdeaea' : '#e8f0fe',
          color: message.includes('disetujui') ? GREEN_DARK : message.includes('ditolak') ? RED_DARK : BLUE_DARK,
          padding: "12px 18px",
          borderRadius: "10px",
          marginBottom: "18px",
          fontSize: "13.5px",
          fontWeight: "600"
        }}>{message}</div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '18px' }}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            style={{
              position: 'relative',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '11px 18px',
              borderRadius: '10px',
              border: `1px solid ${activeTab === tab.key ? BLUE : BORDER}`,
              background: activeTab === tab.key ? BLUE : '#eceff3',
              color: activeTab === tab.key ? '#fff' : TEXT,
              fontSize: '14.5px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'background 0.18s ease, color 0.18s ease, transform 0.12s ease, box-shadow 0.18s ease',
              userSelect: 'none',
              boxShadow: activeTab === tab.key ? '0 6px 16px -6px rgba(47,95,232,.55)' : 'none'
            }}
            onMouseEnter={(e) => {
              if (activeTab !== tab.key) {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 4px 10px -4px rgba(20,25,40,.18)';
              }
            }}
            onMouseLeave={(e) => {
              if (activeTab !== tab.key) {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }
            }}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
            {tab.count > 0 && (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: '20px',
                height: '20px',
                padding: '0 6px',
                borderRadius: '999px',
                background: RED,
                color: '#fff',
                fontSize: '12px',
                fontWeight: '700'
              }}>{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      <div style={{
        background: CARD,
        border: `1px solid ${BORDER}`,
        borderRadius: RADIUS,
        boxShadow: '0 1px 2px rgba(20,25,40,.04), 0 8px 24px -12px rgba(20,25,40,.10)',
        overflow: 'hidden'
      }}>
        {renderTable(approvals[activeTab], activeTab)}
      </div>

      {selectedItem && (
        <div className="app-modal-overlay" style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1500,
          animation: 'approvalFade 0.2s ease'
        }}>
          <div style={{
            background: CARD,
            border: `1px solid ${BORDER}`,
            borderRadius: RADIUS,
            boxShadow: '0 12px 30px -10px rgba(0,0,0,.4)',
            width: '500px',
            maxWidth: '90%',
            padding: '24px',
            animation: 'fadeSlide 0.28s ease'
          }}>
            <h3 style={{
              fontSize: '18px',
              fontWeight: '700',
              margin: '0 0 16px',
              color: TEXT
            }}>
              {selectedItem.action === 'reject' ? 'Tolak Pengajuan' : 'Setujui Pengajuan'}
            </h3>
            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: '600',
                color: TEXT,
                marginBottom: '8px'
              }}>Catatan:</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Tambahkan catatan (opsional)"
                rows="3"
                style={{
                  width: '100%',
                  padding: '12px',
                  border: `1px solid ${BORDER}`,
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                  outline: 'none',
                  transition: 'border-color 0.15s ease'
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = BLUE}
                onBlur={(e) => e.currentTarget.style.borderColor = BORDER}
              />
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              {selectedItem.action === 'reject' ? (
                <button 
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '10px 18px',
                    fontSize: '14px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    color: '#fff',
                    background: RED,
                    boxShadow: '0 4px 10px -4px rgba(227,72,72,.5)',
                    transition: 'filter 0.15s ease, transform 0.1s ease'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.filter = 'brightness(1.06)'}
                  onMouseLeave={(e) => e.currentTarget.style.filter = 'brightness(1)'}
                  onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.96)'}
                  onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
                  onClick={() => handleReject(selectedItem.type, selectedItem.id)}
                >
                  <StatusIcon status="rejected" /> Tolak
                </button>
              ) : (
                <button 
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '10px 18px',
                    fontSize: '14px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    color: '#fff',
                    background: GREEN,
                    boxShadow: '0 4px 10px -4px rgba(22,168,117,.5)',
                    transition: 'filter 0.15s ease, transform 0.1s ease'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.filter = 'brightness(1.06)'}
                  onMouseLeave={(e) => e.currentTarget.style.filter = 'brightness(1)'}
                  onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.96)'}
                  onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
                  onClick={() => handleApprove(selectedItem.type, selectedItem.id)}
                >
                  <StatusIcon status="approved" /> Setuju
                </button>
              )}
              <button 
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  border: `1px solid ${BORDER}`,
                  borderRadius: '8px',
                  padding: '10px 18px',
                  fontSize: '14px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  color: TEXT,
                  background: '#eceff3',
                  transition: 'filter 0.15s ease, transform 0.1s ease'
                }}
                onMouseEnter={(e) => e.currentTarget.style.filter = 'brightness(1.06)'}
                onMouseLeave={(e) => e.currentTarget.style.filter = 'brightness(1)'}
                onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.96)'}
                onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
                onClick={() => { setSelectedItem(null); setNotes(''); }}
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}
      {previewImage && (
        <div
          className="approval-photo-overlay"
          onClick={() => setPreviewImage(null)}
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            cursor: 'pointer',
            animation: 'approvalFade 0.2s ease'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '90%',
              maxHeight: '90%',
              position: 'relative',
              cursor: 'default'
            }}
          >
            {!previewError ? (
              <img
                src={previewImage}
                alt="Foto Bukti"
                style={{
                  maxWidth: '100%',
                  maxHeight: '90vh',
                  borderRadius: '8px',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
                }}
                onError={() => setPreviewError(true)}
              />
            ) : (
              <div style={{
                background: CARD,
                borderRadius: '8px',
                padding: '24px 32px',
                color: TEXT,
                fontSize: '14px',
                fontWeight: '600'
              }}>
                Foto tidak dapat dimuat
              </div>
            )}
            <button
              onClick={() => setPreviewImage(null)}
              style={{
                position: 'absolute',
                top: '-40px',
                right: 0,
                background: 'white',
                color: 'black',
                border: 'none',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                fontSize: '20px',
                lineHeight: '32px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ApprovalsV2;
