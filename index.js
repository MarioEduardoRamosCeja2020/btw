"use strict";
import { join, dirname } from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { setupMaster, fork } from 'cluster';
import cfonts from 'cfonts';
import readline from 'readline';
import yargs from 'yargs';
import chalk from 'chalk';
import fs from 'fs/promises';
import fsSync from 'fs';
import './config.js';

import { PHONENUMBER_MCC } from '@whiskeysockets/baileys';
const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(__dirname);
const { say } = cfonts;
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
let isRunning = false;

const question = (texto) => new Promise((resolver) => rl.question(texto, resolver));

say('Iniciando...', {
  font: 'simple',
  align: 'center',
  gradient: ['yellow', 'cyan'],
});

say('Luna-botv6', {
  font: 'block',
  align: 'center',
  gradient: ['blue', 'magenta'],
});

process.stdout.write('\x07');

console.log(chalk.hex('#00FFFF').bold('─◉ Bienvenido al sistema Luna-botv6'));
console.log(chalk.hex('#FF00FF')('─◉ Preparando entorno y verificaciones necesarias...'));

const rutaTmp = join(__dirname, 'src/tmp');
try {
  await fs.mkdir(rutaTmp, { recursive: true });
  await fs.chmod(rutaTmp, 0o777);
  console.log(chalk.hex('#39FF14')('✓ Carpeta src/tmp configurada correctamente.'));
} catch (err) {
  console.warn(chalk.hex('#FFA500')('⚠ Error configurando src/tmp:'), err.message);
}

async function limpiarArchivosTMP() {
  const tmpPath = join(__dirname, 'src/tmp');
  const coreFile = join(__dirname, 'core');
  const MAX_AGE = 300000;
  const stats = { tmp: 0, core: false, total: 0 };

  try {
    const [tmpFiles, coreExists] = await Promise.allSettled([
      fs.readdir(tmpPath),
      fs.access(coreFile).then(() => true).catch(() => false)
    ]);

    if (tmpFiles.status === 'fulfilled' && tmpFiles.value.length > 0) {
      const now = Date.now();
      const deletePromises = tmpFiles.value.map(async (file) => {
        try {
          const fullPath = join(tmpPath, file);
          const fileStat = await fs.stat(fullPath);
          
          if (now - fileStat.mtimeMs > MAX_AGE) {
            await fs.rm(fullPath, { recursive: true, force: true });
            stats.tmp++;
            return true;
          }
        } catch (err) {
          return false;
        }
        return false;
      });

      await Promise.allSettled(deletePromises);
    }

    if (coreExists.status === 'fulfilled' && coreExists.value) {
      try {
        await fs.rm(coreFile, { force: true });
        stats.core = true;
      } catch {}
    }

    stats.total = stats.tmp + (stats.core ? 1 : 0);

    if (stats.total > 0) {
      const parts = [];
      if (stats.tmp > 0) parts.push(`${stats.tmp} archivos tmp/`);
      if (stats.core) parts.push('archivo core');
      console.log(chalk.hex('#00CED1').bold('✨ Limpieza completada: ') + chalk.hex('#FF1493')(parts.join(' + ')));
    }
  } catch (err) {
    console.error(chalk.hex('#FF1493')('✖ Error en limpieza:'), err.message);
  }
}

let limpiezaActiva = false;

async function ejecutarLimpieza() {
  if (limpiezaActiva) return;
  limpiezaActiva = true;
  try {
    await limpiarArchivosTMP();
  } finally {
    setTimeout(() => { limpiezaActiva = false; }, 5000);
  }
}

setInterval(ejecutarLimpieza, 900000);
setTimeout(ejecutarLimpieza, 3000);

async function verificarOCrearCarpetaAuth() {
  const authPath = join(__dirname, global.authFile);
  try {
    await fs.mkdir(authPath, { recursive: true });
  } catch {}
}

function verificarCredsJson() {
  const credsPath = join(__dirname, global.authFile, 'creds.json');
  return fsSync.existsSync(credsPath);
}

function formatearNumeroTelefono(numero) {
  let formattedNumber = numero.replace(/[^\d+]/g, '');
  if (formattedNumber.startsWith('+52') && !formattedNumber.startsWith('+521')) {
    formattedNumber = formattedNumber.replace('+52', '+521');
  } else if (formattedNumber.startsWith('52') && !formattedNumber.startsWith('521')) {
    formattedNumber = `+521${formattedNumber.slice(2)}`;
  } else if (formattedNumber.startsWith('52') && formattedNumber.length >= 12) {
    formattedNumber = `+${formattedNumber}`;
  } else if (!formattedNumber.startsWith('+')) {
    formattedNumber = `+${formattedNumber}`;
  }
  return formattedNumber;
}

function esNumeroValido(numeroTelefono) {
  const numeroSinSigno = numeroTelefono.replace('+', '');
  return Object.keys(PHONENUMBER_MCC).some(codigo => numeroSinSigno.startsWith(codigo));
}

async function start(file) {
  if (isRunning) return;
  isRunning = true;

  await verificarOCrearCarpetaAuth();

  // Si ya hay sesión, iniciamos normalmente
  if (verificarCredsJson()) {
    const args = [join(__dirname, file), ...process.argv.slice(2)];
    setupMaster({ exec: args[0], args: args.slice(1) });
    const p = fork();
    return;
  }

  // ELIMINADA LA OPCIÓN 1 (QR), FORZAMOS CÓDIGO DE TEXTO
  console.log(chalk.hex('#FFD700').bold('\n─◉ Iniciando vinculación por código de 8 dígitos...'));
  
  const phoneNumber = await question(chalk.hex('#FFD700').bold('─◉ Escriba su número de WhatsApp:\n') + chalk.hex('#E0E0E0').bold('◉ Ejemplo: +5493483466763\n─> '));
  
  const numeroTelefono = formatearNumeroTelefono(phoneNumber);
  
  if (!esNumeroValido(numeroTelefono)) {
    console.log(chalk.bgHex('#FF1493')(chalk.white.bold('[ ERROR ] Número inválido. Use formato internacional.\n')));
    process.exit(0);
  }

  // Agregamos los argumentos necesarios para que main.js sepa qué hacer
  process.argv.push(numeroTelefono);
  process.argv.push('code');

  const args = [join(__dirname, file), ...process.argv.slice(2)];
  setupMaster({ exec: args[0], args: args.slice(1) });

  const p = fork();

  p.on('message', (data) => {
    console.log(chalk.hex('#39FF14').bold('─◉ RECIBIDO:'), data);
    switch (data) {
      case 'reset':
        p.process.kill();
        isRunning = false;
        start.apply(this, arguments);
        break;
      case 'uptime':
        p.send(process.uptime());
        break;
    }
  });

  p.on('exit', (_, code) => {
    isRunning = false;
    console.error(chalk.hex('#FF1493').bold('[ ERROR ] Ocurrió un error inesperado:'), code);
    p.process.kill();
    start.apply(this, arguments);
    if (process.env.pm_id) {
      process.exit(1);
    } else {
      process.exit();
    }
  });

  const opts = new Object(yargs(process.argv.slice(2)).exitProcess(false).parse());
  if (!opts['test']) {
    if (!rl.listenerCount()) {
      rl.on('line', (line) => {
        p.emit('message', line.trim());
      });
    }
  }
}

start('main.js');