const PastebinAPI = require('pastebin-js'),
    pastebin = new PastebinAPI('EMWTMkQAVfJa9kM-MRUrxd5Oku1U7pgL');
const { makeid } = require('./id');
const QRCode = require('qrcode');
const express = require('express');
const path = require('path');
const fs = require('fs');
let router = express.Router();
const pino = require('pino');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    jidNormalizedUser,
    Browsers,
    delay,
    makeInMemoryStore,
} = require('hunter-baileys');

const QR_SESSION_TIMEOUT_MS = 60 * 1000; // 60 seconds — drop unscanned sessions

function removeFile(FilePath) {
    if (!fs.existsSync(FilePath)) return false;
    fs.rmSync(FilePath, { recursive: true, force: true });
}

router.get('/', async (req, res) => {
    const id = makeid();

    async function MBUVI_MD_QR_CODE() {
        const { state, saveCreds } = await useMultiFileAuthState('./temp/' + id);
        let sessionTimeout = null;

        try {
            let sock = makeWASocket({
                auth: state,
                printQRInTerminal: false,
                logger: pino({ level: 'silent' }),
                browser: Browsers.macOS('Desktop'),
            });

            // Timeout: if QR is never scanned, clean up after 60s
            sessionTimeout = setTimeout(async () => {
                console.log(`[QR] Session ${id} timed out (not scanned).`);
                try { await sock.ws.close(); } catch (_) {}
                removeFile('temp/' + id);
                if (!res.headersSent) {
                    res.status(408).json({ code: 'QR session timed out. Please refresh and try again.' });
                }
            }, QR_SESSION_TIMEOUT_MS);

            sock.ev.on('creds.update', saveCreds);

            sock.ev.on('connection.update', async (s) => {
                const { connection, lastDisconnect, qr } = s;

                if (qr) {
                    try {
                        const qrBuffer = await QRCode.toBuffer(qr);
                        if (!res.headersSent) {
                            res.end(qrBuffer);
                        }
                    } catch (qrErr) {
                        console.error('[QR] Failed to generate QR buffer:', qrErr.message);
                    }
                }

                if (connection === 'open') {
                    clearTimeout(sessionTimeout);
                    try {
                        await delay(5000);
                        const credsPath = path.join(__dirname, 'temp', id, 'creds.json');
                        const data = fs.readFileSync(credsPath);
                        await delay(800);
                        const b64data = Buffer.from(data).toString('base64');
                        const session = await sock.sendMessage(sock.user.id, {
                            text: 'HUNTER_XMD_PRO~' + b64data
                        });

                        const HUNTER_MD_TEXT =
`╔═══════════════════
║『 SESSION CONNECTED』
║ 🟢  HUNTER XMD PRO
║ ⚡  Base64 Type
║ 👨‍💻 OBED TECH DEV
╚═══════════════════`;

                        await sock.sendMessage(sock.user.id, { text: HUNTER_MD_TEXT }, { quoted: session });
                        await delay(100);
                    } catch (sendErr) {
                        console.error('[QR] Error sending session message:', sendErr.message);
                    } finally {
                        try { await sock.ws.close(); } catch (_) {}
                        removeFile('temp/' + id);
                    }

                } else if (
                    connection === 'close' &&
                    lastDisconnect &&
                    lastDisconnect.error &&
                    lastDisconnect.error.output &&
                    lastDisconnect.error.output.statusCode !== 401
                ) {
                    clearTimeout(sessionTimeout);
                    await delay(10000);
                    MBUVI_MD_QR_CODE();
                }
            });

        } catch (err) {
            clearTimeout(sessionTimeout);
            console.error('[QR] Socket error:', err.message);
            if (!res.headersSent) {
                res.json({ code: 'Service is Currently Unavailable' });
            }
            removeFile('temp/' + id);
        }
    }

    return await MBUVI_MD_QR_CODE();
});

module.exports = router;
