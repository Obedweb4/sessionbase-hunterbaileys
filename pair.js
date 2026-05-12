const PastebinAPI = require('pastebin-js');
const pastebin = new PastebinAPI('EMWTMkQAVfJa9kM-MRUrxd5Oku1U7pgL');
const { makeid } = require('./id');
const express = require('express');
const fs = require('fs');
const path = require('path');
let router = express.Router();
const pino = require('pino');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers
} = require('hunter-baileys');

const PAIR_SESSION_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes — drop unconfirmed pair sessions

function removeFile(FilePath) {
    if (!fs.existsSync(FilePath)) return false;
    fs.rmSync(FilePath, { recursive: true, force: true });
}

router.get('/', async (req, res) => {
    const id = makeid();
    let num = req.query.number;

    if (!num) {
        return res.status(400).json({ code: 'Phone number is required. Use ?number=XXXXXXXXXX' });
    }

    async function HUNTER_MD_PAIR_CODE() {
        const { state, saveCreds } = await useMultiFileAuthState('./temp/' + id);
        let sessionTimeout = null;

        try {
            const silentLogger = pino({ level: 'fatal' }).child({ level: 'fatal' });

            let sock = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, silentLogger),
                },
                version: [2, 3000, 1033105955],
                printQRInTerminal: false,
                logger: silentLogger,
                browser: Browsers.windows('Edge'),
            });

            if (!sock.authState.creds.registered) {
                await delay(1500);
                num = num.replace(/[^0-9]/g, '');
                const custom = 'HUNTERMD';
                const code = await sock.requestPairingCode(num, custom);
                if (!res.headersSent) {
                    await res.send({ code });
                }
            }

            // Timeout: if pairing code is never confirmed, clean up after 2 minutes
            sessionTimeout = setTimeout(async () => {
                console.log(`[PAIR] Session ${id} timed out (code not confirmed).`);
                try { await sock.ws.close(); } catch (_) {}
                removeFile('temp/' + id);
            }, PAIR_SESSION_TIMEOUT_MS);

            sock.ev.on('creds.update', saveCreds);

            sock.ev.on('connection.update', async (s) => {
                const { connection, lastDisconnect } = s;

                if (connection === 'open') {
                    clearTimeout(sessionTimeout);
                    try {
                        await delay(5000);
                        const credsPath = path.join(__dirname, 'temp', id, 'creds.json');
                        const data = fs.readFileSync(credsPath);
                        await delay(1000);
                        const b64data = Buffer.from(data).toString('base64');
                        const session = await sock.sendMessage(sock.user.id, {
                            text: 'HUNTER_XMD_PRO~' + b64data
                        });

                        const HUNTER_MD_TEXT =
`╔═══════════════════════╗
║   ✅  SESSION ACTIVE   ║
║   🟢  HUNTER XMD PRO  ║
║   ⚡  Base64 Type      ║
║   👨‍💻 OBED TECH DEV   ║
╚═══════════════════════╝`;

                        await sock.sendMessage(sock.user.id, { text: HUNTER_MD_TEXT }, { quoted: session });
                        await delay(100);
                    } catch (sendErr) {
                        console.error('[PAIR] Error sending session message:', sendErr.message);
                    } finally {
                        try { await sock.ws.close(); } catch (_) {}
                        removeFile('./temp/' + id);
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
                    HUNTER_MD_PAIR_CODE();
                }
            });

        } catch (err) {
            clearTimeout(sessionTimeout);
            console.error('[PAIR] Socket error:', err.message);
            removeFile('./temp/' + id);
            if (!res.headersSent) {
                res.send({ code: 'Service Currently Unavailable' });
            }
        }
    }

    return await HUNTER_MD_PAIR_CODE();
});

module.exports = router;
