import React from 'react';
import { FileText, ExternalLink } from 'lucide-react';

// Shared evidence (bukti) rendering: images + PDF.
// Accepts the same path shapes as getRecordPhotoUrl output or absolute URLs.
export function isPdfPath(p) {
  return /\.pdf($|\?|#)/i.test(p || '');
}

export function EvidenceViewer({ src, alt = 'Bukti', imgStyle, imgProps, pdfHeight = '70vh' }) {
  if (!src) return null;
  if (isPdfPath(src)) {
    return (
      <div className="evidence-pdf">
        <iframe src={src} title={alt} className="evidence-pdf-frame" style={{ height: pdfHeight }} />
        <a href={src} target="_blank" rel="noreferrer" className="evidence-pdf-open">
          <ExternalLink size={13} /> Buka di tab baru
        </a>
      </div>
    );
  }
  return <img src={src} alt={alt} style={imgStyle} {...imgProps} />;
}

// Compact PDF placeholder for table cells / thumbnails (click opens viewer).
export function EvidenceFileThumb({ onOpen, size = 60, label }) {
  return (
    <div
      className="evidence-thumb"
      style={{ width: size, height: size }}
      onClick={onOpen}
      title={label || 'Buka dokumen PDF'}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' && onOpen) onOpen(); }}
    >
      <FileText size={Math.round(size * 0.38)} />
      <span>PDF</span>
    </div>
  );
}
