import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import API_BASE_URL from '../config';
import { useMinIpcPerGrade, minIpcFor, isBelowMinIpc } from '../utils/minIpc';
import { formatDisplayText } from '../utils/formatDisplayText';
import StudentRecordsHistory from './StudentRecordsHistory';
import { UserRound, Camera, Trash2 } from 'lucide-react';

const JABATAN_OPTIONS = ['Guru', 'Pegawai'];

function Profile() {
  const minIpc = useMinIpcPerGrade();
  const [profile, setProfile] = useState(null);
  const [ipcHistory, setIpcHistory] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState({});
  const [avatarFile, setAvatarFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [passwordMode, setPasswordMode] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  useEffect(() => {
    fetchProfile();
    fetchIpcHistory();
    fetchSummary();
  }, []);

  const fetchProfile = async () => {
    try {
      const response = await api.get('/profile');
      setProfile(response.data);
      setEditData(response.data);
    } catch (error) {
      console.error('Error fetching profile:', error);
    }
  };

  const fetchIpcHistory = async () => {
    try {
      const response = await api.get('/profile/ipc-history');
      setIpcHistory(response.data);
    } catch (error) {
      console.error('Error fetching IPC history:', error);
    }
  };

  const fetchSummary = async () => {
    try {
      const response = await api.get('/profile/summary');
      setSummary(response.data);
    } catch (error) {
      console.error('Error fetching summary:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    try {
      await api.put(`/users/${profile.id}`, editData);
      setEditMode(false);
      fetchProfile();
    } catch (error) {
      alert(error.response?.data?.message || 'Gagal update profile');
    }
  };

  const handleAvatarUpload = async (e) => {
    e.preventDefault();
    if (!avatarFile) {
      alert('Pilih file avatar terlebih dahulu');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('avatar', avatarFile);

      await api.post('/profile/avatar', formData);

      alert('Avatar berhasil diupload');
      setAvatarFile(null);
      fetchProfile();
    } catch (error) {
      alert(error.response?.data?.message || 'Gagal upload avatar');
    } finally {
      setUploading(false);
    }
  };

  const handleAvatarDelete = async () => {
    if (!window.confirm('Hapus avatar?')) return;

    try {
      await api.delete('/profile/avatar');

      alert('Avatar berhasil dihapus');
      fetchProfile();
    } catch (error) {
      alert(error.response?.data?.message || 'Gagal hapus avatar');
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      alert('Password baru tidak cocok');
      return;
    }
    if (passwordData.newPassword.length < 6) {
      alert('Password minimal 6 karakter');
      return;
    }

    try {
      await api.post('/profile/change-password', passwordData);
      alert('Password berhasil diubah');
      setPasswordMode(false);
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (error) {
      alert(error.response?.data?.message || 'Gagal mengubah password');
    }
  };

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>;
  }

  let user = null;
  try {
    user = JSON.parse(localStorage.getItem('user'));
  } catch (e) {
    console.error('Error parsing user from localStorage:', e);
  }
  
  const avatarUrl = profile?.foto ? `${API_BASE_URL.replace('/api', '')}${profile.foto}` : null;

  const renderBiodata = () => {
    if (editMode) {
      return (
        <form onSubmit={handleUpdateProfile}>
          {user.role === 'siswa' && (
            <>
              <div className="form-group">
                <label>No HP</label>
                <input type="text" value={editData.no_hp || ''} onChange={(e) => setEditData({...editData, no_hp: e.target.value})} />
              </div>
            </>
          )}
          {user.role === 'guru' && (
            <>
              <div className="form-group">
                <label>No HP</label>
                <input type="text" value={editData.no_hp || ''} onChange={(e) => setEditData({...editData, no_hp: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Jabatan</label>
                <select value={editData.jabatan || editData.detail || ''} onChange={(e) => setEditData({...editData, jabatan: e.target.value})}>
                  <option value="" disabled hidden>Pilih Jabatan</option>
                  {!JABATAN_OPTIONS.includes(editData.jabatan || editData.detail) && (editData.jabatan || editData.detail) ? (
                    <option value={editData.jabatan || editData.detail}>{editData.jabatan || editData.detail} (lama)</option>
                  ) : null}
                  {JABATAN_OPTIONS.map((jabatan) => (
                    <option key={jabatan} value={jabatan}>{jabatan}</option>
                  ))}
                </select>
              </div>
            </>
          )}
          {user.role === 'superadmin' && (
            <>
              <div className="form-group">
                <label>Nama</label>
                <input type="text" value={editData.nama || ''} onChange={(e) => setEditData({...editData, nama: e.target.value})} />
              </div>
              <div className="form-group">
                <label>No HP</label>
                <input type="text" value={editData.no_hp || ''} onChange={(e) => setEditData({...editData, no_hp: e.target.value})} />
              </div>
            </>
          )}
          <button type="submit" className="btn btn-primary">Simpan</button>
          <button type="button" className="btn btn-danger" onClick={() => setEditMode(false)}>Batal</button>
        </form>
      );
    }

    return (
      <>
        <p><strong>Nama:</strong> {profile?.nama}</p>
        {user.role === 'siswa' && (
          <>
            <p><strong>NIS:</strong> {profile?.nis || '-'}</p>
            <p><strong>Kelas:</strong> {profile?.kelas || '-'}</p>
            <p><strong>Grha:</strong> {profile?.grha || '-'}</p>
            <p><strong>Wali Kelas:</strong> {profile?.wali_kelas_nama || profile?.wali_kelas || '-'}</p>
          </>
        )}
        {user.role === 'guru' && (
          <>
            <p><strong>NIP:</strong> {profile?.nip || '-'}</p>
            <p><strong>Jabatan:</strong> {profile?.jabatan || profile?.detail || '-'}</p>
          </>
        )}
        {user.role === 'superadmin' && (
          <p><strong>NIS:</strong> {profile?.nis || '-'}</p>
        )}
        <p><strong>Role:</strong> {profile?.role}</p>
        <p><strong>No HP:</strong> {profile?.no_hp || '-'}</p>
        <button className="btn btn-primary" onClick={() => setEditMode(true)} style={{ marginTop: '10px' }}>Edit Biodata</button>
      </>
    );
  };

  return (
    <div>
      <h2 style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <UserRound size={26} /> Profile
      </h2>
      
      <div className="card" style={{ marginBottom: '24px' }}>
        <h3 style={{ marginBottom: '20px' }}>Avatar</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px', marginBottom: '20px' }}>
          <div style={{
            width: '120px',
            height: '120px',
            borderRadius: '50%',
            background: 'var(--bg-tertiary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            border: '3px solid var(--primary-color)',
            boxShadow: 'var(--shadow-md)'
          }}>
            {avatarUrl ? (
              <img src={avatarUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ display: 'inline-flex', color: 'var(--text-secondary)' }}><UserRound size={56} /></span>
            )}
          </div>
          <div>
            <h4 style={{ margin: '0 0 8px 0' }}>{profile?.nama}</h4>
            <p style={{ color: 'var(--text-secondary)', margin: '0 0 16px 0' }}>{profile?.role}</p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <label className="btn btn-primary" style={{ cursor: 'pointer' }}>
                <Camera size={15} /> Upload Avatar
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setAvatarFile(e.target.files[0])}
                  style={{ display: 'none' }}
                />
              </label>
              {avatarFile && (
                <button
                  onClick={handleAvatarUpload}
                  disabled={uploading}
                  className="btn btn-success"
                >
                  {uploading ? 'Uploading...' : 'Simpan'}
                </button>
              )}
              {avatarUrl && (
                <button
                  onClick={handleAvatarDelete}
                  className="btn btn-danger"
                >
                  <Trash2 size={15} /> Hapus
                </button>
              )}
            </div>
            {avatarFile && (
              <p style={{ marginTop: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                File: {avatarFile.name}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '24px' }}>
        <h3>Biodata</h3>
        {renderBiodata()}
      </div>

      <div className="card" style={{ marginBottom: '24px' }}>
        <h3>Ubah Password</h3>
        {passwordMode ? (
          <form onSubmit={handlePasswordChange}>
            <div className="form-group">
              <label>Password Saat Ini</label>
              <input 
                type="password" 
                value={passwordData.currentPassword} 
                onChange={(e) => setPasswordData({...passwordData, currentPassword: e.target.value})}
                required
              />
            </div>
            <div className="form-group">
              <label>Password Baru</label>
              <input 
                type="password" 
                value={passwordData.newPassword} 
                onChange={(e) => setPasswordData({...passwordData, newPassword: e.target.value})}
                required
              />
            </div>
            <div className="form-group">
              <label>Konfirmasi Password Baru</label>
              <input 
                type="password" 
                value={passwordData.confirmPassword} 
                onChange={(e) => setPasswordData({...passwordData, confirmPassword: e.target.value})}
                required
              />
            </div>
            <button type="submit" className="btn btn-primary">Ubah Password</button>
            <button type="button" className="btn btn-danger" onClick={() => setPasswordMode(false)}>Batal</button>
          </form>
        ) : (
          <button className="btn btn-primary" onClick={() => setPasswordMode(true)}>Ubah Password</button>
        )}
      </div>

      {user.role === 'siswa' && (
        <>
          <div className="card" style={{ marginBottom: '24px' }}>
            <h3>IPC Anda</h3>
            <p style={{ fontSize: '48px', fontWeight: 'bold', color: isBelowMinIpc(profile?.ipc_total ?? 0, minIpcFor(minIpc, profile?.kelas)) ? '#dc2626' : 'var(--blue)' }}>{profile?.ipc_total || 0}</p>
            <p>IPC Awal: {profile?.ipc_awal || 0}</p>
          </div>

          {summary && (
            <div className="card" style={{ marginBottom: '24px' }}>
              <h3>Ringkasan Prestasi</h3>
              <p><strong>Total Prestasi:</strong> {summary.total_prestasi}</p>
              <p><strong>Total Organisasi:</strong> {summary.total_organisasi}</p>
              <p><strong>Total Event:</strong> {summary.total_event}</p>
              <p><strong>Total Pelanggaran:</strong> {summary.total_pelanggaran}</p>
              <p><strong>Total Perilaku:</strong> {summary.total_perilaku}</p>
            </div>
          )}

          <StudentRecordsHistory
            records={summary}
            title="Riwayat Prestasi & Event"
            showAllTabs={false}
          />

          <div className="card">
            <h3>Riwayat IPC</h3>
            {ipcHistory.length > 0 ? (
              <table className="table">
                <thead>
                  <tr>
                    <th>Jenis Perubahan</th>
                    <th>Point Change</th>
                    <th>IPC Sebelum</th>
                    <th>IPC Sesudah</th>
                    <th>Keterangan</th>
                    <th>Tanggal</th>
                  </tr>
                </thead>
                <tbody>
                  {ipcHistory.map(history => (
                    <tr key={history.id}>
                      <td>{formatDisplayText(history.jenis_perubahan)}</td>
                      <td style={{ color: history.point_change >= 0 ? 'green' : 'red' }}>
                        {history.point_change >= 0 ? '+' : ''}{history.point_change}
                      </td>
                      <td>{history.ipc_sebelum}</td>
                      <td>{history.ipc_sesudah}</td>
                      <td>{formatDisplayText(history.keterangan)}</td>
                      <td>{new Date(history.created_at).toLocaleDateString('id-ID')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p>Belum ada riwayat IPC</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default Profile;
