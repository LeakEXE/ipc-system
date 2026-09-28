import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { CircleCheck, CircleX, Clock, UserCheck, FileText, Bell, Inbox } from 'lucide-react';

function NotificationBadge() {
  const [count, setCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [audio] = useState(new Audio('/notification-sound.mp3'));

  useEffect(() => {
    fetchNotificationCount();
    const interval = setInterval(fetchNotificationCount, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchNotificationCount = async () => {
    try {
      const response = await api.get('/approvals-v2/notifications/count');
      
      const newCount = response.data.count;
      if (newCount > count && count > 0) {
        // Play sound for new notifications
        audio.play().catch(e => console.log('Audio play failed:', e));
      }
      setCount(newCount);
    } catch (error) {
      console.error('Error fetching notification count:', error);
    }
  };

  const fetchNotifications = async () => {
    try {
      const response = await api.get('/approvals-v2/notifications');
      setNotifications(response.data);
      await api.put('/approvals-v2/notifications/read-all', {});
      setCount(0);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
  };

  const handleClick = () => {
    if (!showDropdown) {
      fetchNotifications();
    }
    setShowDropdown(!showDropdown);
  };

  const NOTIF_ICONS = {
    approved: CircleCheck,
    rejected: CircleX,
    approval_needed: Clock,
    pembina_approved: UserCheck,
    new_submission: FileText
  };

  const getNotificationIcon = (type) => NOTIF_ICONS[type] || Bell;

  const getNotificationColor = (type) => {
    switch(type) {
      case 'approved': return 'var(--green-bg)';
      case 'rejected': return 'var(--danger-bg)';
      case 'approval_needed': return 'var(--amber-bg)';
      case 'pembina_approved': return 'var(--blue-light)';
      case 'new_submission': return 'var(--bg-tertiary)';
      default: return 'var(--bg-tertiary)';
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <button 
        onClick={handleClick}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '8px',
          position: 'relative'
        }}
      >
        <span style={{ display: 'inline-flex', color: 'var(--slate)' }}><Bell size={24} /></span>
        {count > 0 && (
          <span style={{
            position: 'absolute',
            top: '-2px',
            right: '-2px',
            backgroundColor: 'var(--danger-color)',
            color: 'white',
            borderRadius: '50%',
            width: '20px',
            height: '20px',
            fontSize: '12px',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
          }}>
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {showDropdown && (
        <div style={{
          position: 'absolute',
          top: '100%',
          right: '0',
          width: '400px',
          maxHeight: '500px',
          overflowY: 'auto',
          backgroundColor: 'white',
          boxShadow: '0 8px 16px rgba(0,0,0,0.15)',
          borderRadius: '12px',
          zIndex: 1000,
          padding: '0',
          border: '1px solid #e0e0e0'
        }}>
          <div style={{
            padding: '15px 20px',
            borderBottom: '2px solid var(--blue)',
            backgroundColor: 'var(--bg-tertiary)',
            borderTopLeftRadius: '12px',
            borderTopRightRadius: '12px'
          }}>
            <h4 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '16px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Bell size={17} /> Notifikasi
              {count > 0 && (
                <span style={{
                  marginLeft: '10px',
                  backgroundColor: 'var(--danger-color)',
                  color: 'white',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontSize: '12px'
                }}>
                  {count} baru
                </span>
              )}
            </h4>
          </div>
          
          {notifications.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--muted-light)' }}>
              <span style={{ display: 'inline-flex' }}><Inbox size={48} /></span>
              <p style={{ marginTop: '10px', marginBottom: 0 }}>Tidak ada notifikasi</p>
            </div>
          ) : (
            <div>
              {notifications.map(notif => (
                <div 
                  key={notif.id} 
                  style={{
                    padding: '15px 20px',
                    borderBottom: '1px solid #f0f0f0',
                    backgroundColor: notif.is_read ? 'white' : getNotificationColor(notif.type),
                    transition: 'background-color 0.2s',
                    cursor: 'pointer'
                  }}
                  onMouseEnter={(e) => {
                    if (!notif.is_read) {
                      e.target.style.backgroundColor = getNotificationColor(notif.type);
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.backgroundColor = notif.is_read ? 'white' : getNotificationColor(notif.type);
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    {(() => { const Icon = getNotificationIcon(notif.type); return (
                    <span style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--slate)' }}><Icon size={18} /></span>
                    ); })()}
                    <div style={{ flex: 1 }}>
                      <strong style={{ fontSize: '14px', color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
                        {notif.title}
                      </strong>
                      <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: 'var(--slate)', lineHeight: '1.4' }}>
                        {notif.message}
                      </p>
                      <small style={{ color: 'var(--muted-light)', fontSize: '11px', display: 'block' }}>
                        {new Date(notif.created_at).toLocaleString('id-ID', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </small>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          <div style={{
            padding: '10px 20px',
            borderTop: '1px solid #e0e0e0',
            backgroundColor: '#f8f9fa',
            borderBottomLeftRadius: '12px',
            borderBottomRightRadius: '12px',
            textAlign: 'center'
          }}>
            <small style={{ color: '#666' }}>Klik di luar untuk menutup</small>
          </div>
        </div>
      )}
    </div>
  );
}

export default NotificationBadge;
