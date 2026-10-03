import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';

const DEFAULT_SUPPORT_LINK = 'https://google.com';
const COOLDOWN_SECONDS = 60;

function ForgotPassword() {
  const [username, setUsername] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [schoolConfig, setSchoolConfig] = useState(null);

  useEffect(() => {
    const fetchSchoolConfig = async () => {
      try {
        const response = await api.get('/school-config/public');
        setSchoolConfig(response.data);
      } catch (err) {
        console.error('Error fetching school config:', err);
      }
    };
    fetchSchoolConfig();
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    // Silent bot trap: pretend success without hitting the backend.
    if (honeypot) {
      setSuccess('Jika username terdaftar, permintaan reset telah dikirim ke SuperAdmin. Hubungi admin sekolah untuk tindak lanjut.');
      setCooldown(COOLDOWN_SECONDS);
      return;
    }
    const value = username.trim();
    if (!value) {
      setError('Username wajib diisi');
      return;
    }
    setLoading(true);
    try {
      const response = await api.post('/auth/forgot-password', { username: value });
      setSuccess(response.data?.message || 'Jika username terdaftar, permintaan reset telah dikirim ke SuperAdmin. Hubungi admin sekolah untuk tindak lanjut.');
      setCooldown(COOLDOWN_SECONDS);
    } catch (err) {
      const status = err.response?.status;
      if (status === 429) {
        setError(err.response?.data?.message || 'Terlalu banyak permintaan reset password. Coba lagi nanti.');
      } else {
        setError(err.response?.data?.message || 'Gagal mengirim permintaan. Coba lagi.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1.5rem',
      position: 'relative',
      overflowX: 'hidden',
      background: 'radial-gradient(circle at 20% 20%, rgba(108,127,216,.55), transparent 45%), radial-gradient(circle at 82% 78%, rgba(122,94,199,.55), transparent 50%), linear-gradient(150deg, #6c7fd8 0%, #7a6bcf 45%, #7c4fb0 100%)'
    }}>
      <div style={{
        position: 'relative',
        zIndex: 1,
        width: '100%',
        maxWidth: '400px',
        background: '#fff',
        borderRadius: '20px',
        padding: 'clamp(1.8rem, 4vw, 2.6rem)',
        boxShadow: '0 25px 60px -15px rgba(20,20,60,.45)'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: '1.6rem' }}>
          <div style={{ width: '64px', height: '64px', marginBottom: '.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {schoolConfig?.logo_url ? (
              <img src={schoolConfig.logo_url} alt="Logo Sekolah" style={{ maxWidth: '64px', maxHeight: '64px', objectFit: 'contain' }} />
            ) : (
              <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style={{ width: '64px', height: '64px' }}>
                <circle cx="50" cy="50" r="44" stroke="#28396b" strokeWidth="2.2" fill="none"/>
                <path d="M28 38 C 28 34, 34 32, 50 32 C 66 32, 72 34, 72 38 L 72 64 C 72 60, 66 58, 50 58 C 34 58, 28 60, 28 64 Z" stroke="#28396b" strokeWidth="2" fill="none"/>
                <path d="M50 32 L50 58" stroke="#28396b" strokeWidth="1.6" fill="none"/>
              </svg>
            )}
          </div>
          <h1 style={{ fontWeight: '600', fontSize: '1.35rem', margin: 0, color: '#1c2333' }}>Lupa Password</h1>
          <p style={{ margin: '.4rem 0 0', fontSize: '.86rem', color: '#5b6478' }}>
            Masukkan username Anda. Permintaan dikirim ke SuperAdmin untuk disetujui.
          </p>
        </div>

        {success ? (
          <div>
            <div style={{ marginBottom: '1rem', padding: '0.75rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', color: '#166534', fontSize: '0.88rem', lineHeight: 1.6 }}>
              {success}
            </div>
            <ol style={{ fontSize: '.85rem', color: '#5b6478', lineHeight: 1.7, paddingLeft: '1.2rem', margin: '0 0 1rem 0' }}>
              <li>Tunggu persetujuan SuperAdmin.</li>
              <li>Hubungi admin sekolah bila mendesak.</li>
              <li>Login dengan password sementara, lalu wajib ganti password.</li>
            </ol>
            <p style={{ textAlign: 'center', fontSize: '.85rem', color: '#5b6478' }}>
              <Link to="/login" style={{ color: '#28396b', fontWeight: '600', textDecoration: 'none' }}>Kembali ke Login</Link>
              {cooldown > 0 && <span> · Kirim lagi dalam {cooldown}d</span>}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {error && (
              <div style={{ padding: '0.75rem', background: '#fee', border: '1px solid #fcc', borderRadius: '8px', color: '#c33', fontSize: '0.9rem', textAlign: 'center' }}>
                {error}
              </div>
            )}
            <div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Username"
                required
                autoComplete="username"
                maxLength={50}
                style={{
                  width: '100%', padding: '.95rem', fontSize: '.98rem',
                  border: '1.5px solid #e1ddd0', borderRadius: '10px',
                  background: '#fbfaf6', color: '#1c2333', outline: 'none', boxSizing: 'border-box'
                }}
              />
            </div>
            {/* Honeypot: hidden from humans, bots fill it in */}
            <input
              type="text"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              style={{ position: 'absolute', left: '-9999px', opacity: 0, height: 0 }}
            />
            <button
              type="submit"
              disabled={loading || cooldown > 0}
              style={{
                padding: '.95rem 1rem', border: 'none', borderRadius: '10px',
                background: 'linear-gradient(135deg, #6c7fd8, #28396b)', color: '#fff',
                fontWeight: '700', fontSize: '.98rem',
                cursor: loading || cooldown > 0 ? 'not-allowed' : 'pointer',
                opacity: loading || cooldown > 0 ? 0.7 : 1
              }}
            >
              {loading ? 'Mengirim...' : cooldown > 0 ? `Tunggu ${cooldown}d` : 'Kirim Permintaan Reset'}
            </button>
            <p style={{ textAlign: 'center', fontSize: '.85rem', color: '#5b6478', margin: 0 }}>
              <Link to="/login" style={{ color: '#28396b', fontWeight: '600', textDecoration: 'none' }}>Kembali ke Login</Link>
              {' · '}
              Butuh bantuan? <a href={schoolConfig?.support_link || DEFAULT_SUPPORT_LINK} style={{ color: '#28396b', fontWeight: '600', textDecoration: 'none' }}>Hubungi admin sekolah</a>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

export default ForgotPassword;
