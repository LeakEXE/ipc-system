import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import API_BASE_URL from '../config';
import { Folder, FileText } from 'lucide-react';

function DriveViewer() {
  const [folders, setFolders] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const [filters, setFilters] = useState({
    fileType: '',
    searchQuery: '',
    minSize: '',
    maxSize: '',
    kelas: '',
    grha: ''
  });
  const [studentsData, setStudentsData] = useState({});

  const kelasOptions = [
    'X TKJ 1', 'X TKJ 2', 'X DPIB 1', 'X DPIB 2', 'X TKR 1', 'X TKR 2',
    'XI TKJ 1', 'XI TKJ 2', 'XI DPIB 1', 'XI DPIB 2', 'XI TKR 1', 'XI TKR 2',
    'XII TKJ 1', 'XII TKJ 2', 'XII DPIB 1', 'XII DPIB 2', 'XII TKR 1', 'XII TKR 2'
  ];

  const grhaOptions = [
    'Airsanya', 'Daksina', 'Genya', 'Madhya', 'Nairiti', 'Pascima', 'Purwa', 'Uttara', 'Wayabhya'
  ];

  useEffect(() => {
    fetchFolders();
  }, []);

  const fetchFolders = async () => {
    try {
      setLoading(true);
      const response = await api.get('/file-viewer/folders');
      setFolders(response.data);
    } catch (error) {
      console.error('Error fetching folders:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchFiles = async (folderName) => {
    try {
      setLoading(true);
      const response = await api.get(`/file-viewer/files/${folderName}`);
      setFiles(response.data);
      setSelectedFolder(folderName);
      // Load student data for files
      loadStudentsDataForFiles(response.data);
    } catch (error) {
      console.error('Error fetching files:', error);
    } finally {
      setLoading(false);
    }
  };

  const deleteFile = async (fileName) => {
    if (!window.confirm(`Are you sure you want to delete ${fileName}?`)) {
      return;
    }

    try {
      await api.delete(`/file-viewer/file/${selectedFolder}/${fileName}`);
      // Refresh file list
      fetchFiles(selectedFolder);
    } catch (error) {
      console.error('Error deleting file:', error);
      alert('Failed to delete file');
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('id-ID', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const viewImage = (file) => {
    const imageUrl = `${API_BASE_URL.replace('/api', '')}${file.path}`;
    setPreviewImage(imageUrl);
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const resetFilters = () => {
    setFilters({ fileType: '', searchQuery: '', minSize: '', maxSize: '', kelas: '', grha: '' });
  };

  const extractNISFromFilename = (filename) => {
    // Try to extract NIS from filename pattern like "12345_prestasi.jpg" or "12345-event.png"
    const match = filename.match(/^(\d+)[_-]/);
    return match ? match[1] : null;
  };

  const fetchStudentByNIS = async (nis) => {
    if (studentsData[nis]) return studentsData[nis];

    try {
      const response = await api.get(`/users/nis/${nis}`);
      setStudentsData(prev => ({ ...prev, [nis]: response.data }));
      return response.data;
    } catch (error) {
      console.log('Student not found for NIS:', nis);
      return null;
    }
  };

  const loadStudentsDataForFiles = async (fileList) => {
    const nisSet = new Set();
    fileList.forEach(file => {
      const nis = extractNISFromFilename(file.name);
      if (nis) nisSet.add(nis);
    });

    const promises = Array.from(nisSet).map(nis => fetchStudentByNIS(nis));
    await Promise.all(promises);
  };

  const filteredFiles = files.filter(file => {
    if (filters.fileType && !file.name.toLowerCase().endsWith(filters.fileType.toLowerCase())) {
      return false;
    }
    if (filters.searchQuery && !file.name.toLowerCase().includes(filters.searchQuery.toLowerCase())) {
      return false;
    }
    if (filters.minSize && file.size < parseInt(filters.minSize) * 1024) {
      return false;
    }
    if (filters.maxSize && file.size > parseInt(filters.maxSize) * 1024) {
      return false;
    }

    // Filter by student attributes extracted from filename
    const nis = extractNISFromFilename(file.name);
    if (nis && studentsData[nis]) {
      const student = studentsData[nis];
      if (filters.kelas && student.kelas !== filters.kelas) {
        return false;
      }
      if (filters.grha && student.grha !== filters.grha) {
        return false;
      }
    } else if (filters.kelas || filters.grha) {
      // If student filters are active but we can't find student data, exclude this file
      return false;
    }

    return true;
  });

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <h2 style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}><Folder size={24} /> File Manager (Local Storage)</h2>
      
      {!selectedFolder ? (
        <div>
          <h3 style={{ marginBottom: '15px' }}>Folders</h3>
          {loading ? (
            <div style={{ padding: '20px', textAlign: 'center' }}>Loading...</div>
          ) : folders.length === 0 ? (
            <div style={{ padding: '20px', backgroundColor: '#f5f5f5', borderRadius: '8px', textAlign: 'center' }}>
              No folders found in uploads directory
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '15px' }}>
              {folders.map((folder) => (
                <div
                  key={folder.name}
                  onClick={() => fetchFiles(folder.name)}
                  style={{
                    padding: '20px',
                    backgroundColor: 'white',
                    border: '1px solid #ddd',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px'
                  }}
                  onMouseEnter={(e) => e.target.style.backgroundColor = '#f0f0f0'}
                  onMouseLeave={(e) => e.target.style.backgroundColor = 'white'}
                >
                  <span style={{ display: 'inline-flex', color: 'var(--warning-color)' }}><Folder size={24} /></span>
                  <span style={{ fontWeight: '500' }}>{folder.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div>
          <button
            onClick={() => {
              setSelectedFolder(null);
              setFiles([]);
            }}
            style={{
              marginBottom: '15px',
              padding: '8px 16px',
              backgroundColor: 'var(--blue)',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer'
            }}
          >
            ← Back to Folders
          </button>
          
          <h3 style={{ marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Folder size={19} /> {selectedFolder} ({files.length} files)
          </h3>

          {/* Filters */}
          <div className="card" style={{ marginBottom: '20px', padding: '15px' }}>
            <h4>Filter</h4>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ flex: '1', minWidth: '150px' }}>
                <label>Kelas</label>
                <select
                  value={filters.kelas}
                  onChange={(e) => handleFilterChange('kelas', e.target.value)}
                  className="form-control"
                >
                  <option value="">Semua Kelas</option>
                  {kelasOptions.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>
              <div style={{ flex: '1', minWidth: '150px' }}>
                <label>Grha</label>
                <select
                  value={filters.grha}
                  onChange={(e) => handleFilterChange('grha', e.target.value)}
                  className="form-control"
                >
                  <option value="">Semua Grha</option>
                  {grhaOptions.map(grha => <option key={grha} value={grha}>{grha}</option>)}
                </select>
              </div>
              <button className="btn btn-secondary" onClick={resetFilters}>Reset</button>
            </div>
          </div>

          {loading ? (
            <div style={{ padding: '20px', textAlign: 'center' }}>Loading...</div>
          ) : filteredFiles.length === 0 ? (
            <div style={{ padding: '20px', backgroundColor: '#f5f5f5', borderRadius: '8px', textAlign: 'center' }}>
              {files.length === 0 ? 'No files in this folder' : 'No files match your filters'}
            </div>
          ) : (
            <div style={{ backgroundColor: 'white', borderRadius: '8px', border: '1px solid #ddd', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--blue)', color: 'white' }}>
                    <th style={{ padding: '12px', textAlign: 'left' }}>File Name</th>
                    <th style={{ padding: '12px', textAlign: 'left' }}>Size</th>
                    <th style={{ padding: '12px', textAlign: 'left' }}>Created</th>
                    <th style={{ padding: '12px', textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFiles.map((file, index) => (
                    <tr
                      key={file.name}
                      style={{ backgroundColor: index % 2 === 0 ? 'white' : '#f9f9f9' }}
                    >
                      <td style={{ padding: '12px' }}>
                        <button
                          onClick={() => viewImage(file)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--blue)',
                            textDecoration: 'none',
                            fontWeight: '500',
                            cursor: 'pointer',
                            padding: 0,
                            textAlign: 'left'
                          }}
                        >
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><FileText size={14} /> {file.name}</span>
                        </button>
                      </td>
                      <td style={{ padding: '12px', color: '#666' }}>{formatFileSize(file.size)}</td>
                      <td style={{ padding: '12px', color: '#666' }}>{formatDate(file.created)}</td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <button
                          onClick={() => deleteFile(file.name)}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: 'var(--danger-color)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '12px'
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Image Preview Modal */}
      {previewImage && (
        <div
          onClick={() => setPreviewImage(null)}
          className="app-modal-overlay"
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1500,
            cursor: 'pointer'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '90%',
              maxHeight: '90%',
              position: 'relative'
            }}
          >
            <img
              src={previewImage}
              alt="Preview"
              style={{
                maxWidth: '100%',
                maxHeight: '90vh',
                borderRadius: '8px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
              }}
              onError={() => {
                alert('Failed to load image');
                setPreviewImage(null);
              }}
            />
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

export default DriveViewer;
