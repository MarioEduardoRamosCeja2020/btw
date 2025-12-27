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

import { restaurarConfiguraciones } from './lib/funcConfig.js';
import { getOwnerFunction } from './lib/owner-funciones.js';
import { isCleanerEnabled } from './lib/cleaner-config.js';
import { startAutoCleanService } from './auto-cleaner.js';
import { privacyConfig, cleanOldUserData, secureLogger } from './privacy-config.js';
import mentionListener from './plugins/game-ialuna.js';

const { chain } = lodash;
const PORT = process.env.PORT || 3000;

// ✅ MEJORA 1: Servidor Robusto para Render (Evita el reinicio por puerto)
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot is running...');
});
server.listen(PORT, '0.0.0.0', () => {
  console.log(chalk.green(`[ 🚀 ] Puerto ${PORT} abierto para Render.`));
});

let stopped = 'close';  
let pairingTimeout = null;
const PAIRING_TIMEOUT_DURATION = 600000; // ✅ MEJORA 2: 10 minutos (Render es lento)

protoType();
serialize();

global.__filename = function filename(pathURL = import.meta.url, rmPrefix = platform !== 'win32') {
  return rmPrefix ? /file:\/\/\//.test(pathURL) ? fileURLToPath(pathURL) : pathURL : pathToFileURL(pathURL).toString();
};
global.__dirname = function dirname(pathURL) {
  return path.dirname(global.__filename(pathURL, true));
};
const __dirname = global.__dirname(import.meta.url);

// Función de limpieza solo si falla realmente
async function clearSessionAndRestart() {
    console.log(chalk.red('[ ✖ ] Fallo crítico en vinculación. Reiniciando...'));
    const carpetas = [global.authFile, 'MysticSession'];
    for (const carpeta of carpetas) {
        const ruta = join(process.cwd(), carpeta);
        if (existsSync(ruta)) await fs.promises.rm(ruta, { recursive: true, force: true }).catch(() => {});
    }
    process.exit(1);
}

global.opts = new Object(yargs(process.argv.slice(2)).exitProcess(false).parse());
global.db = new Low(new JSONFile(`database.json`));
global.loadDatabase = async function loadDatabase() {
  if (global.db.data !== null) return;
  await global.db.read().catch(console.error);
  global.db.data = { users: {}, chats: {}, stats: {}, msgs: {}, sticker: {}, settings: {}, privacy: { dataRetentionDays: 30, lastCleanup: Date.now() }, ...(global.db.data || {}) };
};
loadDatabase();

const authFolder = global.authFile || 'MysticSession';
const { state, saveCreds } = await useMultiFileAuthState(authFolder);
const { version } = await fetchLatestBaileysVersion();

const connectionOptions = {
    logger: Pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ["Ubuntu", "Chrome", "20.0.04"],
    auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, Pino({ level: 'fatal' })),
    },
    version,
    markOnlineOnConnect: true,
    generateHighQualityLinkPreview: true,
    msgRetryCounterCache: new NodeCache()
};

global.conn = makeWASocket(connectionOptions);
conn.ev.on('creds.update', saveCreds);

// ✅ MEJORA 3: Lógica de vinculación sin borrar carpetas innecesariamente
if (!fs.existsSync(`./${authFolder}/creds.json`)) {
    let phoneNumber = process.env.WHATSAPP_NUMBER || global.botnumber;
    if (phoneNumber) {
        let numeroTelefono = phoneNumber.replace(/[^0-9]/g, '');
        console.log(chalk.cyan(`[ ℹ️ ] Intentando vincular: ${numeroTelefono}`));
        
        pairingTimeout = setTimeout(() => { 
            if (!global.conn?.user) {
                console.log(chalk.red('[ ! ] El código expiró en Render.'));
            }
        }, PAIRING_TIMEOUT_DURATION);

        setTimeout(async () => {
            try {
                let codigo = await global.conn.requestPairingCode(numeroTelefono);
                if (codigo) {
                    codigo = codigo?.match(/.{1,4}/g)?.join("-") || codigo;
                    console.log(chalk.white(chalk.bgBlue('\n' + ' '.repeat(10) + 'CÓDIGO DE VINCULACIÓN' + ' '.repeat(10))));
                    console.log(chalk.black(chalk.bgWhite('          ' + codigo + '          ')));
                    console.log(chalk.white(chalk.bgBlue(' '.repeat(40) + '\n')));
                }
            } catch (e) {
                console.log(chalk.red('[ ! ] Error al pedir código. Revisa si el número es correcto.'));
            }
        }, 10000); // 10 segundos de espera inicial para asegurar que Baileys esté listo
    }
}

async function connectionUpdate(update) {
  const { connection, lastDisconnect } = update;
  if (connection === 'open') {
    console.log(chalk.green('[ ✅ ] Conectado! Luna-Bot está activo.'));
    if (pairingTimeout) clearTimeout(pairingTimeout);
  }
  if (connection === 'close') {
    const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
    if (reason !== DisconnectReason.loggedOut) {
       console.log(chalk.yellow('[ ⚠️ ] Conexión perdida, reintentando...'));
       setTimeout(() => global.reloadHandler(true), 5000);
    }
  }
}

conn.ev.on('connection.update', connectionUpdate);

// Servidores y limpieza
startAutoCleanService();
setInterval(async () => {
  const tmpPath = join(process.cwd(), 'temp');
  if (existsSync(tmpPath)) {
    const files = await readdir(tmpPath);
    for (const file of files) await unlink(join(tmpPath, file)).catch(() => {});
  }
}, 1000 * 60 * 60);

// Handler
let handler = await import('./handler.js');
global.reloadHandler = async function(restatConn) {
  try {
    const Handler = await import(`./handler.js?update=${Date.now()}`);
    if (Object.keys(Handler || {}).length) handler = Handler;
  } catch (e) { console.error(e); }
  
  if (restatConn) {
    global.conn = makeWASocket(connectionOptions);
    conn.ev.on('creds.update', saveCreds);
  }
  conn.handler = handler.handler.bind(global.conn);
  conn.ev.on('messages.upsert', conn.handler);
  return true;
};

await global.reloadHandler();