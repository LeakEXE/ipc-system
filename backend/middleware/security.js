const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const helmet = require('helmet');

// Rate limiting for login attempts - stricter for security
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 login attempts per windowMs (reduced from 15)
  message: {
    message: 'Too many login attempts, please try again after 15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true // Don't count successful logins
});

// Rate limiting for logout attempts
const logoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 logout attempts per windowMs
  message: {
    message: 'Too many logout attempts, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Rate limiting for public forgot-password requests.
// Looser per-IP than login (no credential guessing here, just request +
// notification spam) because a whole school can share one NAT IP.
// Per-account abuse is stopped separately in the handler via pending-dedup
// + 12h cooldown, so a distributed attack on one victim still fails.
const forgotLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // limit each IP to 10 forgot-password requests per hour
  message: {
    message: 'Terlalu banyak permintaan reset password. Coba lagi nanti.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// General API rate limiting
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 500, // limit each IP to 500 requests per minute
  message: {
    message: 'Too many requests, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// SQL Injection prevention middleware
const sqlInjectionPrevention = (req, res, next) => {
  const sqlPattern = /(\b(UNION\s+SELECT|SELECT\s+.*\s+FROM|INSERT\s+INTO|DROP\s+TABLE|DELETE\s+FROM|UPDATE\s+.*\s+SET|OR\s+\d+\s*=\s*\d+|AND\s+\d+\s*=\s*\d+|--|;\s*\w+\b)\b)/gi;

  const checkValue = (value) => {
    if (typeof value === 'string') {
      return sqlPattern.test(value);
    }
    return false;
  };
  
  const checkObject = (obj) => {
    for (let key in obj) {
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        if (checkObject(obj[key])) return true;
      } else if (checkValue(obj[key])) {
        return true;
      }
    }
    return false;
  };
  
  // Check query params
  if (checkObject(req.query)) {
    return res.status(403).json({ message: 'Potentially malicious request detected (SQL Injection)' });
  }
  
  // Check body
  if (checkObject(req.body)) {
    return res.status(403).json({ message: 'Potentially malicious request detected (SQL Injection)' });
  }
  
  // Check params
  if (checkObject(req.params)) {
    return res.status(403).json({ message: 'Potentially malicious request detected (SQL Injection)' });
  }
  
  next();
};

// XSS Prevention - sanitize input
const xssPrevention = (req, res, next) => {
  const xssPattern = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
  
  const sanitizeValue = (value) => {
    if (typeof value === 'string') {
      // Remove script tags
      return value.replace(xssPattern, '');
    }
    return value;
  };
  
  const sanitizeObject = (obj) => {
    for (let key in obj) {
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        sanitizeObject(obj[key]);
      } else {
        obj[key] = sanitizeValue(obj[key]);
      }
    }
  };
  
  if (req.body) sanitizeObject(req.body);
  if (req.query) sanitizeObject(req.query);
  if (req.params) sanitizeObject(req.params);
  
  next();
};

// Input sanitization - trim and escape
const sanitizeInput = (req, res, next) => {
  const escapeHtml = (text) => {
    if (typeof text !== 'string') return text;
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };
  
  const trimAndEscape = (obj) => {
    for (let key in obj) {
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        trimAndEscape(obj[key]);
      } else if (typeof obj[key] === 'string') {
        obj[key] = escapeHtml(obj[key].trim());
      }
    }
  };
  
  if (req.body) trimAndEscape(req.body);
  if (req.query) trimAndEscape(req.query);
  
  next();
};

// Security headers configuration.
// NOTE: `useDefaults: false` is critical while serving plain HTTP — otherwise
// Helmet merges in `upgrade-insecure-requests`, which makes browsers rewrite
// every subresource (JS/CSS/favicon/API) from http:// to https:// and the
// whole app fails to load on an HTTP-only origin. Re-enable the defaults
// (or just that directive) once HTTPS terminates in front of the app.
// COOP + Origin-Agent-Cluster are likewise disabled: browsers ignore them on
// untrustworthy (plain-HTTP) origins and only log warnings about them.
const securityHeaders = helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      // Allow blob: so client-generated PDF previews (URL.createObjectURL)
      // can render in <iframe>. frameAncestors is 'self' (not 'none') so our
      // own EvidenceViewer iframes may embed /uploads PDFs — external sites
      // still cannot frame this app (clickjacking protection intact).
      frameSrc: ["'self'", "blob:"],
      frameAncestors: ["'self'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  originAgentCluster: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xssFilter: true
});

// Error handler that doesn't expose internal details
const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);
  
  // Don't expose internal error details to client
  const message = process.env.NODE_ENV === 'production' 
    ? 'Internal server error' 
    : err.message;
  
  res.status(err.status || 500).json({
    message: message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
};

// Request logging for security audit
const securityLogger = (req, res, next) => {
  const timestamp = new Date().toISOString();
  const ip = req.ip || req.connection.remoteAddress;
  const method = req.method;
  const url = req.originalUrl;
  const userAgent = req.get('user-agent');
  
  // Log suspicious requests
  const suspiciousPatterns = /(<script|javascript:|onerror=|onload=|SELECT.*FROM|DROP.*TABLE)/i;
  const bodyStr = JSON.stringify(req.body);
  
  if (suspiciousPatterns.test(url) || suspiciousPatterns.test(bodyStr)) {
    console.warn(`[SECURITY ALERT] ${timestamp} - Suspicious request from ${ip}: ${method} ${url}`);
    console.warn(`  User-Agent: ${userAgent}`);
    console.warn(`  Body: ${bodyStr}`);
  }
  
  next();
};

module.exports = {
  loginLimiter,
  logoutLimiter,
  forgotLimiter,
  apiLimiter,
  sqlInjectionPrevention,
  xssPrevention,
  sanitizeInput,
  securityHeaders,
  errorHandler,
  securityLogger
};
