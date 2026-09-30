import React, { useState, useEffect } from 'react';
import api from '../utils/api';

function Logs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    try {
      const response = await api.get('/logs');
      setLogs(response.data);
    } catch (error) {
      console.error('Error fetching logs:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>;
  }

  return (
    <div>
      <h2>Activity Logs</h2>
      <p>Logs ini menampilkan semua aktivitas yang direkam dalam sistem<br /><em>*Dibuat untuk memudahkan pengembang website</em></p>
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Tanggal</th>
              <th>User</th>
              <th>Role</th>
              <th>Action</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {logs.map(log => (
              <tr key={log.id}>
                <td>{new Date(log.created_at).toLocaleString('id-ID')}</td>
                <td>{log.nama}</td>
                <td><span className={`badge badge-${log.role === 'superadmin' ? 'danger' : (log.role === 'guru' || log.role === 'pegawai') ? 'warning' : 'info'}`}>{log.role}</span></td>
                <td>{log.action}</td>
                <td>{log.details}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Logs;
