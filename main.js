"use strict";
process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '1'; 
import './config.js';
import './api.js';
import { createRequire } from 'module';
import path, { join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { platform } from 'process';
import { readdirSync, statSync, existsSync, watch } from 'fs';
import yargs from 'yargs';
import fs from 'fs';
import { readdir, unlink, stat } from 'fs/promises';
import { spawn, fork } from 'child_process';
import lodash from 'lodash';
import chalk from 'chalk';
import pino from 'pino';
import Pino from 'pino';
import { Boom } from '@hapi/boom';
import { makeWASocket, protoType, serialize } from './src/libraries/simple.js';
import { Low, JSONFile } from 'lowdb';
import store from './src/libraries/store.js';
const { DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, jidNormalizedUser, PHONENUMBER_MCC } = await import("@whiskeysockets/baileys");
import readline from 'readline';
import NodeCache from 'node-cache';
import http from 'http'; 

// Importaciones de tus librerías originales
import { restaurarConfiguraciones } from './lib/funcConfig.js';
import { getOwnerFunction } from './lib/owner-funciones.js';
import { isCleanerEnabled } from './lib/cleaner-config.js';
import { startAutoCleanService } from './auto-cleaner.js';
import { privacyConfig, cleanOldUserData, secureLogger } from './privacy-config.js';
import mentionListener from './plugins/game-ialuna.js';

const { chain } = lodash;
const PORT = process.env.PORT || 3000;

// ✅ CORRECCIÓN RENDER: Servidor para mantener puerto abierto
http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Luna-Botv6 Online');
}).listen(PORT);

let stopped = 'close';  
let pairingTimeout = null;
let pairingStartTime = null;
const PAIRING_TIMEOUT_DURATION = 300000; // 5 minutos para que no te gane el tiempo

protoType();
serialize();

global.__filename = function filename(pathURL = import.meta.url, rmPrefix = platform !== 'win32') {
  return rmPrefix ? /file:\/\/\//.test(pathURL) ? fileURLToPath(pathURL) : pathURL : pathToFileURL(pathURL).toString();
};
global.__dirname = function dirname(pathURL) {
  return path.dirname(global.__filename(pathURL, true));
};
const __dirname = global.__dirname(import.meta.url);

// ✅ CORRECCIÓN: Función de reinicio con rutas seguras
async function clearSessionAndRestart() {
    console.log(chalk.red('[ ✖ ] Tiempo agotado. Limpiando sesión...'));
    const carpetas = [global.authFile, 'MysticSession'];
    for (const carpeta of carpetas) {
        const ruta = join(process.cwd(), carpeta);
        if (existsSync(ruta)) await fs.promises.rm(ruta, { recursive: true, force: true }).catch(() => {});
    }
    setTimeout(() => process.exit(1), 2000);
}

// Carga de base de datos original
global.opts = new Object(yargs(process.argv.slice(2)).exitProcess(false).parse());
global.db = new Low(new JSONFile(`database.json`));
global.loadDatabase = async function loadDatabase() {
  if (global.db.data !== null) return;
  await global.db.read().catch(console.error);
  global.db.data = { users: {}, chats: {}, stats: {}, msgs: {}, sticker: {}, settings: {}, privacy: { dataRetentionDays: 30, lastCleanup: Date.now() }, ...(global.db.data || {}) };
  global.db.chain = chain(global.db.data);
};
loadDatabase();

// Configuración de conexión
const authFolder = global.authFile || 'MysticSession';
const { state, saveCreds } = await useMultiFileAuthState(authFolder);
const { version } = await fetchLatestBaileysVersion();

const connectionOptions = {
    logger: Pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['Ubuntu', 'Chrome', '20.0.04'],
    auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, Pino({ level: 'fatal' })),
    },
    version,
    markOnlineOnConnect: true,
    msgRetryCounterCache: new NodeCache()
};

global.conn = makeWASocket(connectionOptions);
conn.ev.on('creds.update', saveCreds);

// ✅ LÓGICA DE VINCULACIÓN MEJORADA
if (!fs.existsSync(`./${authFolder}/creds.json`)) {
    let phoneNumber = process.env.WHATSAPP_NUMBER || global.botnumber;
    if (phoneNumber) {
        let numeroTelefono = phoneNumber.replace(/[^0-9]/g, '');
        console.log(chalk.cyan(`[ ℹ️ ] Vinculando al número: ${numeroTelefono}`));
        
        pairingStartTime = Date.now();
        pairingTimeout = setTimeout(() => { if (!global.conn?.user) clearSessionAndRestart(); }, PAIRING_TIMEOUT_DURATION);

        setTimeout(async () => {
            let codigo = await global.conn.requestPairingCode(numeroTelefono);
            if (codigo) {
                codigo = codigo?.match(/.{1,4}/g)?.join("-") || codigo;
                console.log(chalk.black(chalk.bgGreen('\n┌─────────────────────────────────────────────┐')));
                console.log(chalk.black(chalk.bgGreen(`│ TU CÓDIGO ES: ${codigo}            │`)));
                console.log(chalk.black(chalk.bgGreen('└─────────────────────────────────────────────┘\n')));
            }
        }, 5000);
    }
}

// ✅ CORRECCIÓN: clearTmp sin src/src duplicado
async function clearTmp() {
  const tmpPaths = [join(process.cwd(), 'src', 'tmp'), join(process.cwd(), 'temp')];
  for (const p of tmpPaths) {
    if (!existsSync(p)) continue;
    const files = await readdir(p);
    for (const file of files) {
      const filePath = join(p, file);
      const s = await stat(filePath);
      if (Date.now() - s.mtimeMs >= 1800000) await unlink(filePath).catch(() => {});
    }
  }
}

// Handler de conexión original
async function connectionUpdate(update) {
  const { connection, lastDisconnect } = update;
  stopped = connection;
  if (connection === 'open') {
    console.log(chalk.green('[ ✅ ] Bot conectado correctamente.'));
    if (pairingTimeout) clearTimeout(pairingTimeout);
  }
  if (connection === 'close') {
    const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
    if (reason !== DisconnectReason.loggedOut) {
       setTimeout(() => global.reloadHandler(true), 2000);
    } else {
       console.log(chalk.red('Sesión cerrada. Borra la carpeta de sesión.'));
    }
  }
}

conn.ev.on('connection.update', connectionUpdate);

// Iniciar servicios adicionales originales
startAutoCleanService();
if (isCleanerEnabled()) fork('./lib/cleaner.js');
setInterval(() => clearTmp(), 1000 * 60 * 60 * 2);

// Re-importar el Handler (Cerebro del bot)
let handler = await import('./handler.js');
global.reloadHandler = async function(restatConn) {
  try {
    const Handler = await import(`./handler.js?update=${Date.now()}`);
    if (Object.keys(Handler || {}).length) handler = Handler;
  } catch (e) { console.error(e); }
  
  if (restatConn) {
    try { global.conn.ws.close(); } catch { }
    global.conn = makeWASocket(connectionOptions);
    conn.ev.on('creds.update', saveCreds);
  }
  conn.handler = handler.handler.bind(global.conn);
  conn.ev.on('messages.upsert', conn.handler);
  return true;
};

await global.reloadHandler();
console.log(chalk.green('✓ Sistema cargado completamente.'));