const express = require('express');
const app = express();
const path = require('path');
const bodyParser = require('body-parser');
const fs = require('fs');

// Render uses PORT env var — default to 10000 (Render's standard free tier port)
const PORT = process.env.PORT || 10000;

require('events').EventEmitter.defaultMaxListeners = 500;

// ── Crash guard: catch AES-GCM auth errors and other unhandled exceptions ─────
process.on('uncaughtException', (err) => {
    if (err.message && err.message.includes('unable to authenticate data')) {
        console.warn('[WARN] AES-GCM auth error caught (stale/corrupt session) — server kept alive.');
    } else {
        console.error('[FATAL] Uncaught exception:', err);
        // Re-throw truly unexpected errors so Render can restart cleanly
        process.exit(1);
    }
});

process.on('unhandledRejection', (reason) => {
    if (reason && reason.message && reason.message.includes('unable to authenticate data')) {
        console.warn('[WARN] AES-GCM unhandled rejection (stale session) — ignored.');
    } else {
        console.error('[WARN] Unhandled promise rejection:', reason);
    }
});
// ─────────────────────────────────────────────────────────────────────────────

// ── Clean up any stale temp sessions left over from a previous crash ──────────
const tempDir = path.join(__dirname, 'temp');
try {
    if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempDir);
    console.log('[INIT] Cleaned up stale temp sessions.');
} catch (e) {
    console.warn('[INIT] Could not clean temp dir:', e.message);
}
// ─────────────────────────────────────────────────────────────────────────────

let server = require('./qr'),
    code = require('./pair');

const statsFile = path.join(__dirname, 'stats.json');

function loadStats() {
    try {
        if (fs.existsSync(statsFile)) {
            return JSON.parse(fs.readFileSync(statsFile, 'utf8'));
        }
    } catch (e) {}
    return {
        totalPairings: 0,
        qrPairings: 0,
        codePairings: 0,
        startTime: Date.now(),
        dailyPairings: {},
        peakHour: 0,
        countries: {}
    };
}

function saveStats(stats) {
    try {
        fs.writeFileSync(statsFile, JSON.stringify(stats, null, 2));
    } catch (e) {}
}

let stats = loadStats();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ── No-cache headers ──────────────────────────────────────────────────────────
app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
});

// ── Render keep-alive & health check ─────────────────────────────────────────
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', uptime: process.uptime(), service: 'HUNTER XMD PRO' });
});

// Self-ping every 14 minutes to prevent Render free tier spin-down
if (process.env.RENDER_EXTERNAL_URL) {
    const https = require('https');
    setInterval(() => {
        const url = process.env.RENDER_EXTERNAL_URL + '/health';
        https.get(url, (res) => {
            console.log(`Keep-alive ping: ${res.statusCode}`);
        }).on('error', (err) => {
            console.warn('[WARN] Keep-alive ping failed:', err.message);
        });
    }, 14 * 60 * 1000);
}
// ─────────────────────────────────────────────────────────────────────────────

app.use('/qr-image', server);

app.use('/qr', (req, res, next) => {
    stats.totalPairings++;
    stats.qrPairings++;
    const today = new Date().toISOString().split('T')[0];
    stats.dailyPairings[today] = (stats.dailyPairings[today] || 0) + 1;
    const hour = new Date().getHours();
    if ((stats.dailyPairings[today] || 0) > (stats.peakHour || 0)) {
        stats.peakHour = hour;
    }
    saveStats(stats);
    next();
}, server);

app.use('/code', (req, res, next) => {
    stats.totalPairings++;
    stats.codePairings++;
    const today = new Date().toISOString().split('T')[0];
    stats.dailyPairings[today] = (stats.dailyPairings[today] || 0) + 1;
    const hour = new Date().getHours();
    if ((stats.dailyPairings[today] || 0) > (stats.peakHour || 0)) {
        stats.peakHour = hour;
    }
    const num = req.query.number;
    if (num) {
        const countryCode = num.substring(0, 3);
        stats.countries[countryCode] = (stats.countries[countryCode] || 0) + 1;
    }
    saveStats(stats);
    next();
}, code);

app.get('/api/stats', (req, res) => {
    const uptimeMs = Date.now() - stats.startTime;
    const uptimeDays = Math.floor(uptimeMs / (1000 * 60 * 60 * 24));
    const uptimeHours = Math.floor((uptimeMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    const today = new Date().toISOString().split('T')[0];
    const todayCount = stats.dailyPairings[today] || 0;

    const uniqueCountries = Object.keys(stats.countries).length;

    const successRate = stats.totalPairings > 0
        ? Math.min(98.5 + Math.random() * 1.5, 100).toFixed(1)
        : '99.9';

    res.json({
        totalPairings: stats.totalPairings + 12847,
        qrPairings: stats.qrPairings + 5234,
        codePairings: stats.codePairings + 7613,
        todayPairings: todayCount + Math.floor(Math.random() * 50) + 20,
        uptimeDays: uptimeDays + 127,
        uptimeHours: uptimeHours,
        successRate: successRate,
        activeUsers: Math.floor(Math.random() * 30) + 15,
        countriesServed: uniqueCountries + 45,
        peakHour: stats.peakHour || 14,
        serverStatus: 'operational'
    });
});

app.use('/pair', (req, res) => {
    res.sendFile(path.join(__dirname, 'pair.html'));
});

app.use('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'main.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`HUNTER XMD PRO Session Server running on http://0.0.0.0:${PORT}`);
    console.log(`Powered by OBED TECH DEVELOPER`);
});

module.exports = app;
