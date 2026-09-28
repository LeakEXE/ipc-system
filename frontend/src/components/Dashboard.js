import React, { useState, useEffect, useMemo } from 'react';
import api from '../utils/api';
import API_BASE_URL from '../config';
import { useMinIpcPerGrade, minIpcFor, isBelowMinIpc } from '../utils/minIpc';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import './Dashboard.css';
import { Megaphone, Target, Users, GraduationCap, BarChart3, Trophy, Award } from 'lucide-react';
import { MedalIcon } from './icons';

const COLORS = ['#2563eb', '#14b8a6', '#16a34a', '#f59e0b', '#8b5cf6', '#ef4444'];
const TOOLTIP_STYLE = {
  backgroundColor: 'white',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  fontSize: '12px'
};

function initials(name) {
  if (!name) return '?';
  return String(name).split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

function fotoUrl(path) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const base = API_BASE_URL.replace('/api', '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

function StudentAvatar({ foto, nama, className }) {
  const [failed, setFailed] = useState(false);
  const url = fotoUrl(foto);
  if (url && !failed) {
    return <img src={url} alt={nama || 'Foto siswa'} onError={() => setFailed(true)} />;
  }
  return <span>{initials(nama)}</span>;
}

function Dashboard() {
  const minIpc = useMinIpcPerGrade();

  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [user, setUser] = useState(null);
  const [showLabels, setShowLabels] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [schoolConfig, setSchoolConfig] = useState(null);

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      try {
        setUser(JSON.parse(userData));
      } catch {
        setUser(null);
      }
    }
    fetchStats(false);
    fetchSchoolConfig();
    fetchFreshUser();

    const interval = setInterval(() => fetchStats(false), 30000);
    const schoolConfigInterval = setInterval(fetchSchoolConfig, 30000);
    const clockInterval = setInterval(() => setCurrentTime(new Date()), 1000);

    return () => {
      clearInterval(interval);
      clearInterval(schoolConfigInterval);
      clearInterval(clockInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchStats = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const response = await api.get('/dashboard/stats');
      setStats(response.data);
    } catch (error) {
      console.error('Error fetching stats:', error);
      setStats(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchSchoolConfig = async () => {
    try {
      const response = await api.get('/school-config');
      setSchoolConfig(response.data);
    } catch (error) {
      console.error('Error fetching school config:', error);
      setSchoolConfig({
        school_name: 'SMK Negeri Bali Mandara',
        school_description: 'Sistem Individual Point Card (IPC) • Panel Admin',
        principal_name: 'Nama Kepala Sekolah',
        principal_nip: '',
        logo_url: null
      });
    }
  };

  const fetchFreshUser = async () => {
    try {
      const response = await api.get('/profile');
      if (response.data) {
        setUser((prev) => {
          const merged = { ...(prev || {}), ...response.data };
          try {
            const stored = localStorage.getItem('user');
            const parsed = stored ? JSON.parse(stored) : {};
            localStorage.setItem('user', JSON.stringify({ ...parsed, ...response.data }));
          } catch {
            // ignore storage errors
          }
          return merged;
        });
      }
    } catch {
      // keep stored user on failure (401 handled by api interceptor)
    }
  };

  const handleRefresh = () => {
    if (!refreshing) fetchStats(true);
  };

  const activityData = useMemo(() => ([
    { name: 'Prestasi', value: stats?.total_prestasi || 0, fill: '#2563eb' },
    { name: 'Organisasi', value: stats?.total_organisasi || 0, fill: '#14b8a6' },
    { name: 'Kepanitiaan', value: stats?.total_kepanitiaan || 0, fill: '#8b5cf6' },
    { name: 'Event', value: stats?.total_event || 0, fill: '#f59e0b' },
    { name: 'Pelanggaran', value: stats?.total_pelanggaran || 0, fill: '#ef4444' }
  ]), [stats]);

  const maxKelas = useMemo(() => Math.max(1, ...(stats?.by_kelas || []).map((x) => Number(x.count) || 0)), [stats]);
  const maxGrha = useMemo(() => Math.max(1, ...(stats?.by_grha || []).map((x) => Number(x.count) || 0)), [stats]);
  const maxPelanggaran = useMemo(() => Math.max(1, ...(stats?.pelanggaran_by_grha || []).map((x) => Number(x.count) || 0)), [stats]);

  const topStudents = useMemo(() => stats?.top_ipc_students || [], [stats]);
  const top3 = useMemo(() => topStudents.slice(0, 3), [topStudents]);

  if (loading) {
    return (
      <div className="dash-page">
        <div className="dash-loading">
          <div className="spinner" style={{ margin: '0 auto 12px' }}></div>
          <strong>Memuat data...</strong>
        </div>
      </div>
    );
  }

  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const clockDate = `${days[currentTime.getDay()]}, ${currentTime.getDate()} ${months[currentTime.getMonth()]} ${currentTime.getFullYear()}`;
  const clockTime = currentTime.toLocaleTimeString('id-ID');
  const roleLabel = user?.role === 'superadmin' ? 'Super Admin' : user?.role === 'guru' ? 'Guru' : user?.role === 'siswa' ? 'Siswa' : 'User';
  const roleInitial = user?.role === 'superadmin' ? 'SA' : user?.role === 'guru' ? 'G' : user?.role === 'siswa' ? 'S' : 'U';
  const valueCls = showLabels ? '' : 'is-blurred';

  const studentMin = user?.role === 'siswa' ? minIpcFor(minIpc, user?.kelas) : 0;
  const studentTotal = Number(user?.ipc_total ?? 0);
  const studentIsLow = user?.role === 'siswa' ? isBelowMinIpc(user?.ipc_total ?? 0, studentMin) : false;
  const studentPct = studentMin > 0 ? Math.max(0, Math.min(100, (studentTotal / studentMin) * 100)) : 100;

  return (
    <div className="dash-page">
      {/* HEADER */}
      <div className="dash-header">
        <div className="dash-header-left">
          <div className="dash-logo">
            {schoolConfig?.logo_url ? (
              <img
                src={`${API_BASE_URL.replace('/api', '')}${schoolConfig.logo_url}`}
                alt="Logo Sekolah"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            ) : (
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L3 6v6c0 5 4 8.5 9 10 5-1.5 9-5 9-10V6l-9-4z" fill="#2563eb" />
                <path d="M9 12.5l2 2 4-4.5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="dash-school-name">{schoolConfig?.school_name || 'SMK Negeri Bali Mandara'}</div>
            <div className="dash-school-desc">{schoolConfig?.school_description || 'Sistem Individual Point Card (IPC) · Panel Admin'}</div>
          </div>
        </div>
        <div className="dash-header-right">
          <div className="dash-user-pill">
            <div className="dash-avatar"><StudentAvatar foto={user?.foto} nama={roleInitial} /></div>
            <div>
              <div className="dash-user-role">{roleLabel}</div>
              <div className="dash-user-name">{user?.nama || 'User'}</div>
            </div>
          </div>
          <div className="dash-clock">
            <div>{clockDate}</div>
            <div className="dash-clock-time">{clockTime}</div>
          </div>
        </div>
      </div>

      {/* NOTICE */}
      <div className="dash-notice" role="status">
        <div className="dash-notice-track">
          {[0, 1].map((i) => (
            <div className="dash-notice-group" key={i}>
              <Megaphone size={14} style={{ marginRight: '8px', flexShrink: 0 }} />
              <span>Selamat datang di Website IPC — Sistem Individual Point Card SMK Negeri Bali Mandara</span>
              <span className="dash-notice-dot" />
            </div>
          ))}
        </div>
      </div>

      {/* TITLE ROW */}
      <div className="dash-title-row">
        <div>
          <h1 className="dash-title">Dashboard</h1>
          <p className="dash-subtitle">Selamat datang, {roleLabel}! Berikut ringkasan data IPC terkini.</p>
        </div>
        <div className="dash-actions">
          <button className="dash-btn" onClick={() => setShowLabels(!showLabels)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" /><circle cx="12" cy="12" r="3" /></svg>
            {showLabels ? 'Sembunyikan Angka' : 'Tampilkan Angka'}
          </button>
          <button className="dash-btn dash-btn-primary" onClick={handleRefresh} disabled={refreshing}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
            {refreshing ? 'Memuat...' : 'Refresh'}
          </button>
        </div>
      </div>

      {!user && (
        <div className="alert">User data tidak ditemukan. Silakan login ulang.</div>
      )}

      {/* STUDENT HERO */}
      {user?.role === 'siswa' && (
        <div className="student-hero">
          <div className="student-hero-top">
            <div>
              <div className="student-hero-ipc-label"><Target size={13} /> IPC Anda</div>
              <div className={`student-hero-ipc ${studentIsLow ? 'is-low' : ''} ${valueCls}`}>{user?.ipc_total ?? 0}</div>
              <div className="student-hero-sub">
                {studentMin > 0
                  ? (studentIsLow ? `Di bawah batas minimum ${studentMin} untuk ${user?.kelas || 'kelas Anda'}` : `Di atas batas minimum ${studentMin}`)
                  : 'Point Individual Point Card'}
              </div>
            </div>
            <div style={{ fontSize: '12.5px', color: '#64748b' }}>
              {studentMin > 0 && <span><strong style={{ color: '#0f172a' }}>{Math.round(studentPct)}%</strong> dari batas minimum</span>}
            </div>
          </div>
          {studentMin > 0 && (
            <div className={`student-progress ${studentIsLow ? 'is-low' : ''}`}>
              <span style={{ width: `${studentPct}%` }} />
            </div>
          )}
          <div className="student-details">
            {[
              ['Nama', user?.nama || '-'],
              ['NIS', user?.nis || '-'],
              ['Kelas', user?.kelas || '-'],
              ['Grha', user?.grha || '-'],
              ['Jurusan', user?.jurusan || '-']
            ].map(([label, value]) => (
              <div className="detail-item" key={label}>
                <span className="detail-label">{label}</span>
                <span className="detail-value">{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {stats ? (
        <>
          {/* KPI HEROES */}
          <div className="kpi-grid">
            {[
              { label: 'Total Siswa', value: stats.total_students || 0, sub: 'Siswa aktif terdaftar', icon: Users, mod: 'is-blue' },
              { label: 'Total Guru', value: stats.total_teachers || 0, sub: 'Guru terdaftar', icon: GraduationCap, mod: 'is-teal' },
              { label: 'Rata-rata IPC', value: stats.ipc_stats?.rata_rata || 0, sub: 'Rata-rata seluruh siswa', icon: BarChart3, mod: 'is-green' },
              { label: 'IPC Tertinggi', value: stats.ipc_stats?.tertinggi || 0, sub: 'Poin tertinggi', icon: Trophy, mod: 'is-amber' }
            ].map((k) => (
              <div className={`kpi-card ${k.mod}`} key={k.label}>
                <div className="kpi-top">
                  <div className="kpi-icon"><k.icon size={18} /></div>
                  <div className="kpi-label">{k.label}</div>
                </div>
                <div className={`kpi-value ${valueCls}`}>{k.value}</div>
                <div className="kpi-sub">{k.sub}</div>
              </div>
            ))}
          </div>

          <div className="kpi-strip">
            {[
              ['Prestasi', stats.total_prestasi || 0],
              ['Pelanggaran', stats.total_pelanggaran || 0],
              ['Organisasi', stats.total_organisasi || 0],
              ['Kepanitiaan', stats.total_kepanitiaan || 0],
              ['Event', stats.total_event || 0],
              ['Perilaku', stats.total_perilaku || 0],
              ['IPC Terendah', stats.ipc_stats?.terendah || 0]
            ].map(([label, value]) => (
              <div className="kpi-mini" key={label}>
                <div className="kpi-mini-label">{label}</div>
                <div className={`kpi-mini-value ${valueCls}`}>{value}</div>
              </div>
            ))}
          </div>

          {/* TOP 5 */}
          <div className="dash-card">
            <div className="card-head">
              <h3>
                <span className="card-head-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15 8.5 22 9.5 17 14.5 18.5 21.5 12 18 5.5 21.5 7 14.5 2 9.5 9 8.5 12 2" /></svg>
                </span>
                Top 5 Siswa dengan IPC Tertinggi
              </h3>
              <p>Siswa dengan perolehan poin IPC tertinggi yang masih aktif</p>
            </div>

            {top3.length > 0 && (
              <div className="podium">
                {[
                  { s: top3[1], cls: 'second', rank: 2 },
                  { s: top3[0], cls: 'first', rank: 1 },
                  { s: top3[2], cls: 'third', rank: 3 }
                ].filter((x) => x.s).map(({ s, cls, rank }) => {
                  const low = isBelowMinIpc(s.ipc_total, minIpcFor(minIpc, s.kelas));
                  return (
                    <div key={s.id || s.nis || rank} className={`podium-slot ${cls}`}>
                      <div className="podium-medal"><MedalIcon rank={rank} /></div>
                      <div className="podium-avatar"><StudentAvatar foto={s.foto} nama={s.nama} /></div>
                      <div className="podium-name" title={s.nama}>{s.nama}</div>
                      <div className="podium-meta">{s.kelas || '-'} · {s.grha || '-'}</div>
                      <div className={`podium-total ${low ? 'is-low' : ''} ${valueCls}`}><Award size={14} /> {s.ipc_total} poin</div>
                      <div className="podium-step">{rank}</div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="table-wrap">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Peringkat</th>
                    <th>Nama</th>
                    <th>NIS</th>
                    <th>Kelas</th>
                    <th>Grha</th>
                    <th>IPC</th>
                  </tr>
                </thead>
                <tbody>
                  {topStudents.map((student, index) => {
                    const low = isBelowMinIpc(student.ipc_total, minIpcFor(minIpc, student.kelas));
                    return (
                      <tr key={student.id || index} style={{ animationDelay: `${index * 0.06}s` }}>
                        <td><div className={`pos-badge ${index === 0 ? 'p1' : index === 1 ? 'p2' : index === 2 ? 'p3' : ''}`}>{index + 1}</div></td>
                        <td>
                          <div className="student-cell">
                            <div className="table-avatar"><StudentAvatar foto={student.foto} nama={student.nama} /></div>
                            <div>
                              <div style={{ fontWeight: 600 }}>{student.nama}</div>
                              <div className="student-nis">NIS {student.nis || '-'}</div>
                            </div>
                          </div>
                        </td>
                        <td>{student.nis || '-'}</td>
                        <td>{student.kelas || '-'}</td>
                        <td>{student.grha || '-'}</td>
                        <td className={`ipc-cell ${low ? 'is-low' : ''} ${valueCls}`}>{student.ipc_total}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* CHARTS */}
          <div className="charts-grid">
            <div className="chart-box" style={{ animationDelay: '0.10s' }}>
              <h4>Siswa per Kelas</h4>
              <p className="chart-sub">Jumlah siswa aktif per kelas</p>
              <div className="chart-body">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.by_kelas || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef0f6" />
                    <XAxis dataKey="kelas" tick={{ fontSize: 11, fill: '#64748b' }} />
                    <YAxis allowDecimals={false} tickFormatter={(v) => Math.round(v)} tick={{ fontSize: 11, fill: '#64748b' }} />
                    <Tooltip formatter={(v) => [v, 'Jumlah Siswa']} contentStyle={TOOLTIP_STYLE} />
                    <Bar dataKey="count" fill="#2563eb" name="Jumlah Siswa" radius={[6, 6, 0, 0]} maxBarSize={42} label={showLabels ? { position: 'top', fill: '#0f172a', fontSize: 12, fontWeight: 'bold' } : false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="chart-box" style={{ animationDelay: '0.15s' }}>
              <h4>Distribusi Siswa per Grha</h4>
              <p className="chart-sub">Proporsi siswa tiap grha</p>
              <div className="chart-body">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.by_grha || []}
                      cx="50%"
                      cy="50%"
                      labelLine={showLabels}
                      label={showLabels ? ({ name, percent, count }) => `${name}: ${count} (${(percent * 100).toFixed(0)}%)` : false}
                      outerRadius={82}
                      innerRadius={44}
                      fill="#8884d8"
                      dataKey="count"
                      nameKey="grha"
                    >
                      {(stats.by_grha || []).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => [v, 'Jumlah Siswa']} contentStyle={TOOLTIP_STYLE} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="chart-box" style={{ animationDelay: '0.20s' }}>
              <h4>Pelanggaran per Grha</h4>
              <p className="chart-sub">Pelanggaran disetujui per grha</p>
              <div className="chart-body">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.pelanggaran_by_grha || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef0f6" />
                    <XAxis dataKey="grha" tick={{ fontSize: 11, fill: '#64748b' }} />
                    <YAxis allowDecimals={false} tickFormatter={(v) => Math.round(v)} tick={{ fontSize: 11, fill: '#64748b' }} />
                    <Tooltip formatter={(v) => [v, 'Jumlah Pelanggaran']} contentStyle={TOOLTIP_STYLE} />
                    <Bar dataKey="count" fill="#ef4444" name="Jumlah Pelanggaran" radius={[6, 6, 0, 0]} maxBarSize={30} label={showLabels ? { position: 'top', fill: '#0f172a', fontSize: 12, fontWeight: 'bold' } : false} />
                  </BarChart>
                </ResponsiveContainer>
                {(!stats.pelanggaran_by_grha || stats.pelanggaran_by_grha.every((x) => Number(x.count) === 0)) && (
                  <div className="chart-empty">Belum ada pelanggaran tercatat — kabar baik!</div>
                )}
              </div>
            </div>

            <div className="chart-box" style={{ animationDelay: '0.25s' }}>
              <h4>Ringkasan IPC</h4>
              <p className="chart-sub">Perbandingan prestasi, organisasi, kepanitiaan, event, dan pelanggaran</p>
              <div className="chart-body">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={activityData} layout="vertical" margin={{ left: 12, right: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef0f6" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                    <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11, fill: '#64748b' }} />
                    <Tooltip formatter={(v) => [v, 'Jumlah']} contentStyle={TOOLTIP_STYLE} />
                    <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={22} label={showLabels ? { position: 'right', fill: '#0f172a', fontSize: 12, fontWeight: 'bold' } : false}>
                      {activityData.map((e, i) => (
                        <Cell key={i} fill={e.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* DETAILS */}
          <div className="detail-grid">
            <div className="detail-card" style={{ animationDelay: '0.30s' }}>
              <h4>Detail Siswa per Kelas</h4>
              <div>
                {(stats.by_kelas || []).map((item) => (
                  <div className="detail-row" key={item.kelas}>
                    <div className="detail-row-top">
                      <span>{item.kelas}</span>
                      <span className={`detail-row-value ${valueCls}`}>{item.count}</span>
                    </div>
                    <div className="detail-bar"><span style={{ width: `${Math.round(((Number(item.count) || 0) / maxKelas) * 100)}%` }} /></div>
                  </div>
                ))}
              </div>
            </div>

            <div className="detail-card" style={{ animationDelay: '0.34s' }}>
              <h4>Detail Siswa per Grha</h4>
              <div>
                {(stats.by_grha || []).map((item) => (
                  <div className="detail-row" key={item.grha}>
                    <div className="detail-row-top">
                      <span>{item.grha}</span>
                      <span className={`detail-row-value ${valueCls}`}>{item.count}</span>
                    </div>
                    <div className="detail-bar is-teal"><span style={{ width: `${Math.round(((Number(item.count) || 0) / maxGrha) * 100)}%` }} /></div>
                  </div>
                ))}
              </div>
            </div>

            <div className="detail-card" style={{ animationDelay: '0.38s' }}>
              <h4>Detail Pelanggaran per Grha</h4>
              <div>
                {(stats.pelanggaran_by_grha || []).map((item) => (
                  <div className="detail-row" key={item.grha}>
                    <div className="detail-row-top">
                      <span>{item.grha}</span>
                      <span className={`detail-row-value ${valueCls}`}>{item.count}</span>
                    </div>
                    <div className="detail-bar is-red"><span style={{ width: `${Math.round(((Number(item.count) || 0) / maxPelanggaran) * 100)}%` }} /></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="alert">
          Backend belum terhubung atau database belum siap. Pastikan backend berjalan di port 5000.
        </div>
      )}
    </div>
  );
}

export default Dashboard;
