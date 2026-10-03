// Prometheus exposition for the Grafana stack (@pm2/io only talks to the
// PM2 daemon, it cannot feed Prometheus). Scrape target: GET /metrics
// (mounted before rate limiting and auth in server.js so the scraper is
// never blocked). Route labels use the Express route template
// (/api/users/:id), never raw paths, to keep cardinality bounded.
const client = require('@prometheus-io/client');

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestsTotal = new client.Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status'],
    registers: [register],
});

const httpRequestDuration = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status'],
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [register],
});

function httpMetricsMiddleware(req, res, next) {
    if (req.path === '/metrics') return next();
    const end = httpRequestDuration.startTimer();
    res.on('finish', () => {
        // req.route is populated by the router before 'finish' fires, so
        // IDs stay templated (/api/users/:id instead of /api/users/123).
        const template = req.route ? `${req.baseUrl}${req.route.path}` : 'unmatched';
        const labels = { method: req.method, route: template, status: res.statusCode };
        httpRequestsTotal.inc(labels);
        end(labels);
    });
    next();
}

async function metricsHandler(req, res) {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
}

// Bearer-token guard for /metrics. When METRICS_TOKEN is set (production),
// the scraper must send `Authorization: Bearer <token>` (Prometheus
// `bearer_token` in scrape_config); anything else gets 403. When unset
// (local dev), the endpoint stays open.
function metricsAuth(req, res, next) {
    const token = process.env.METRICS_TOKEN;
    if (!token) return next();
    if (req.headers.authorization === `Bearer ${token}`) return next();
    res.status(403).end();
}

module.exports = { httpMetricsMiddleware, metricsAuth, metricsHandler };
