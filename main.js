"use strict";
process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '1'; 
import './config.js';
import './api.js';
import { createRequire } from 'module';
import path, { join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { platform } from 'process';
import { readdirSync, statSync, unlinkSync, existsSync, readFileSync, watch } from 'fs';
import yargs from 'yargs';
import fs from 'fs';
import { readdir, unlink, stat } from 'fs/promises';
import { spawn, fork } from 'child_process';
import lodash from 'lodash';
import chalk from 'chalk';
import syntaxerror from 'syntax-error';
import { format } from 'util';
import pino from 'pino';
import Pino from 'pino';
import { Boom } from '@hapi/boom';
import { isJidBroadcast } from '@whiskeysockets/baileys';
import { makeWASocket, protoType, serialize } from './src/libraries/simple.js';
import { Low, JSONFile } from 'lowdb';
import store from './src/libraries/store.js';
const { DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, jidNormalizedUser, PHONENUMBER_MCC } = await import("@whiskeysockets/baileys");
import readline from 'readline';
import NodeCache from 'node-cache';
import { restaurarConfiguraciones } from './lib/funcConfig.js';
import { getOwnerFunction } from './lib/owner-funciones.js';
import { isCleanerEnabled } from './lib/cleaner-config.js';
import { startAutoCleanService } from './auto-cleaner.js';
import { privacyConfig, cleanOldUserData, secureLogger } from './privacy-config.js';
import mentionListener from './plugins/game-ialuna.js';

const { chain } = lodash;
const PORT = process.env.PORT || process.env.SERVER_PORT || 3000;
let stopped = 'close';  

const messageQueue = [];
global.isProcessing = false;
let messageCount = 0;
let lastMinuteReset = Date.now();
const MAX_MESSAGES_PER_MINUTE = 20;

function getRandomDelay() {
  return Math.floor(Math.random() * (800 - 300 + 1) + 300);
}

async function processMessageQueue() {
  if (global.isProcessing || messageQueue.length === 0) return;
  
  const now = Date.now();
  if (now - lastMinuteReset >= 60000) {
    messageCount = 0;
    lastMinuteReset = now;
  }
  
  if (messageCount >= MAX_MESSAGES_PER_MINUTE) {
    setTimeout(processMessageQueue, 2000);
    return;
  }
  
  global.isProcessing = true;
  const msg = messageQueue.shift();
  messageCount++;
  
  try {
    await global.conn.handler(msg);
  } catch (err) {
    secureLogger.error('ERROR procesando mensaje:', err);
  }
  
  global.isProcessing = false;
  
  if (messageQueue.length > 0) {
    const delay = getRandomDelay();
    setTimeout(processMessageQueue, delay);
  }
}

protoType();
serialize();

global.__filename = function filename(pathURL = import.meta.url, rmPrefix = platform !== 'win32') {
  return rmPrefix ? /file:\/\/\//.test(pathURL) ? fileURLToPath(pathURL) : pathURL : pathToFileURL(pathURL).toString();
};

global.__dirname = function dirname(pathURL) {
  return path.dirname(global.__filename(pathURL, true));
};

global.__require = function require(dir = import.meta.url) {
  return createRequire(dir);
};

global.API = (name, path = '/', query = {}, apikeyqueryname) => (name in global.APIs ? global.APIs[name] : name) + path + (query || apikeyqueryname ? '?' + new URLSearchParams(Object.entries({...query, ...(apikeyqueryname ? {[apikeyqueryname]: global.APIKeys[name in global.APIs ? global.APIs[name] : name]} : {})})) : '');

global.timestamp = { start: new Date };

global.videoList = [];
global.videoListXXX = [];
const __dirname = global.__dirname(import.meta.url);
global.opts = new Object(yargs(process.argv.slice(2)).exitProcess(false).parse());
global.prefix = new RegExp('^[' + (opts['prefix'] || '*/i!#$%+£¢€¥^°=¶†×÷π√✓©®:;?&.\\-.@').replace(/[|\\{}()[\]^$+*?.\-\^]/g, '\\$&') + ']');
global.db = new Low(/https?:\/\//.test(opts['db'] || '') ? new cloudDBAdapter(opts['db']) : new JSONFile(`${opts._[0] ? opts._[0] + '_' : ''}database.json`));

global.loadDatabase = async function loadDatabase() {
  if (global.db.READ) {
    return new Promise((resolve) => setInterval(async function() {
      if (!global.db.READ) {
        clearInterval(this);
        resolve(global.db.data == null ? global.loadDatabase() : global.db.data);
      }
    }, 1 * 1000));
  }
  if (global.db.data !== null) return;
  global.db.READ = true;
  await global.db.read().catch(console.error);
  global.db.READ = null;
  global.db.data = {
    users: {},
    chats: {},
    stats: {},
    msgs: {},
    sticker: {},
    settings: {},
    privacy: {
      dataRetentionDays: privacyConfig.dataRetention.days,
      lastCleanup: Date.now(),
      userConsent: {}
    },
    ...(global.db.data || {}),
  };
  global.db.chain = chain(global.db.data);
};
loadDatabase();

global.chatgpt = new Low(new JSONFile(path.join(__dirname, '/db/chatgpt.json')));
global.loadChatgptDB = async function loadChatgptDB() {
  if (global.chatgpt.READ) {
    return new Promise((resolve) =>
      setInterval(async function() {
        if (!global.chatgpt.READ) {
          clearInterval(this);
          resolve( global.chatgpt.data === null ? global.loadChatgptDB() : global.chatgpt.data );
        }
      }, 1 * 1000));
  }
  if (global.chatgpt.data !== null) return;
  global.chatgpt.READ = true;
  await global.chatgpt.read().catch(console.error);
  global.chatgpt.READ = null;
  global.chatgpt.data = {
    users: {},
    ...(global.chatgpt.data || {}),
  };
  global.chatgpt.chain = lodash.chain(global.chatgpt.data);
};
loadChatgptDB();

// --- CAMBIO AQUÍ: Forzado a QR directamente ---
let opcion = '1'; 
const authFolder = global.authFile;

if (!fs.existsSync(`./${authFolder}/creds.json`)) {
    console.log(chalk.cyan('[ ℹ️ ] Iniciando modo Código QR...'));
} else {
    console.log(chalk.green('[ ℹ️ ] Sesión existente encontrada'));
}

const {state, saveCreds} = await useMultiFileAuthState(authFolder);
const { version } = await fetchLatestBaileysVersion();

console.info = () => {}

const connectionOptions = {
    logger: Pino({ level: 'silent' }),
    printQRInTerminal: true, // Siempre mostrar QR
    mobile: false,
    browser: ['Ubuntu', 'Chrome', '20.0.04'],
    auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(
            state.keys,
            Pino({ level: 'fatal' }).child({ level: 'fatal' })
        ),
    },
    markOnlineOnConnect: true,
    generateHighQualityLinkPreview: false,
    qrTimeout: 40000,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
    keepAliveIntervalMs: 30000,
    syncFullHistory: false,
    fireInitQueries: false,
    emitOwnEvents: false,
    version,
    getMessage: async (key) => {
        try {
            let jid = jidNormalizedUser(key.remoteJid);
            let msg = await store.loadMessage(jid, key.id);
            return msg?.message || "";
        } catch (e) {
            secureLogger?.error?.('Error en getMessage:', e);
            return '';
        }
    },
    msgRetryCounterCache: new NodeCache({ stdTTL: 300, checkperiod: 60, useClones: false }),
    userDevicesCache: new NodeCache({ stdTTL: 3600, checkperiod: 300, useClones: false }),
};

global.conn = makeWASocket(connectionOptions);
conn.ev.on('creds.update', saveCreds);

setInterval(async () => {
  if (global.conn?.user && !global.isProcessing) {
    try {
      await global.conn.sendPresenceUpdate('available');
    } catch (e) {
      secureLogger?.error?.('Error enviando presencia:', e.message);
    }
  }
}, 30000);

restaurarConfiguraciones(global.conn);
const ownerConfig = getOwnerFunction();
if (ownerConfig.modopublico) global.conn.public = true;
if (ownerConfig.auread) global.opts['autoread'] = true;
if (ownerConfig.modogrupos) global.conn.modogrupos = true;
conn.ev.on('connection.update', connectionUpdate);

if (isCleanerEnabled()) runCleaner();
startAutoCleanService();

if (!opts['test']) {
  if (global.db) {
    setInterval(async () => {
      if (global.db.data) await global.db.write();
    }, 30 * 1000);
  }
}

if (opts['server']) (await import('./server.js')).default(global.conn, PORT);

async function clearTmp() {
  const tmp = [join('./src/tmp'), join('./temp')];
  try {
    for (const dirname of tmp) {
      if (!existsSync(dirname)) continue;
      const files = await readdir(dirname);
      await Promise.all(files.map(async file => {
        const filePath = join(dirname, file);
        const stats = await stat(filePath);
        if (stats.isFile() && (Date.now() - stats.mtimeMs >= 1000 * 60 * 30)) {
          await unlink(filePath);
        }
      }));
    }
  } catch (err) {
    secureLogger.error('Error en clearTmp:', err.message);
  }
}

let lastQR = null;
async function connectionUpdate(update) {
  const { connection, lastDisconnect, isNewLogin, qr } = update;
  stopped = connection;
  if (isNewLogin) conn.isInit = true;

  if (qr) {
    if (qr !== lastQR) {
      console.log(chalk.yellow('[ ℹ️ ] Escanea el código QR que aparece arriba.'));
      lastQR = qr;
    }
  }

  if (connection === 'open') {
    console.log(chalk.green('[ ✅ ] Conectado correctamente a WhatsApp'));
  } else if (connection === 'close') {
    let reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
    if (reason === DisconnectReason.loggedOut) {
       console.log(chalk.red('[ ✖ ] Sesión cerrada, por favor elimina la carpeta de sesión y reescanea.'));
    } else {
       console.log(chalk.yellow('[ ℹ️ ] Reintentando conexión...'));
       await global.reloadHandler(true).catch(console.error);
    }
  }
}

let handler = await import('./handler.js');
global.reloadHandler = async function(restatConn) {
  try {
    const Handler = await import(`./handler.js?update=${Date.now()}`).catch(console.error);
    if (Object.keys(Handler || {}).length) handler = Handler;
  } catch (e) { console.error(e); }

  if (restatConn) {
    try { global.conn.ws.close(); } catch { }
    conn.ev.removeAllListeners();
    global.conn = makeWASocket(connectionOptions);
    conn.ev.on('creds.update', saveCreds);
    store?.bind(conn);
  }

  conn.handler = handler.handler.bind(global.conn);
  conn.participantsUpdate = handler.participantsUpdate.bind(global.conn);
  conn.groupsUpdate = handler.groupsUpdate.bind(global.conn);
  conn.onDelete = handler.deleteUpdate.bind(global.conn);
  conn.onCall = handler.callUpdate.bind(global.conn);
  conn.connectionUpdate = connectionUpdate.bind(global.conn);
  conn.credsUpdate = saveCreds.bind(global.conn, true);

  conn.ev.removeAllListeners('messages.upsert');
  conn.ev.on('messages.upsert', async (msg) => {
    if (!msg.messages || msg.messages[0].key.fromMe) return;
    messageQueue.push(msg);
    processMessageQueue();
  });

  conn.ev.on('group-participants.update', conn.participantsUpdate);
  conn.ev.on('groups.update', conn.groupsUpdate);
  conn.ev.on('message.delete', conn.onDelete);
  conn.ev.on('call', conn.onCall);
  conn.ev.on('connection.update', conn.connectionUpdate);
  conn.ev.on('creds.update', conn.credsUpdate);

  if (!global.mentionListenerInitialized) {
    mentionListener(conn);
    global.mentionListenerInitialized = true;
  }
  return true;
};

const pluginFolder = global.__dirname(join(__dirname, './plugins/index'));
const pluginFilter = (filename) => /\.js$/.test(filename);
global.plugins = {};
async function filesInit() {
  for (const filename of readdirSync(pluginFolder).filter(pluginFilter)) {
    try {
      const file = global.__filename(join(pluginFolder, filename));
      const module = await import(file);
      global.plugins[filename] = module.default || module;
    } catch (e) {
      delete global.plugins[filename];
    }
  }
}
filesInit().then(() => {}).catch(console.error);

watch(pluginFolder, async (_ev, filename) => {
    if (pluginFilter(filename)) {
        const dir = global.__filename(join(pluginFolder, filename), true);
        try {
            const module = (await import(`${global.__filename(dir)}?update=${Date.now()}`));
            global.plugins[filename] = module.default || module;
        } catch (e) { console.error(`Error recargando plugin ${filename}`); }
    }
});

await global.reloadHandler();

setInterval(async () => {
  if (stopped === 'close' || !global.conn?.user) return;
  const _uptime = process.uptime() * 1000;
  const uptime = clockString(_uptime);
  await global.conn?.updateProfileStatus(`• Activo: ${uptime} | TheMystic-Bot-MD`).catch(() => {});
}, 60000);

function clockString(ms) {
  let h = Math.floor(ms / 3600000) % 24;
  let m = Math.floor(ms / 60000) % 60;
  let s = Math.floor(ms / 1000) % 60;
  return `${h}h ${m}m ${s}s`;
}

process.on('uncaughtException', console.error);