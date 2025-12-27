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

let isRunning = false;

// Función question mejorada para evitar el error de cierre
const question = (texto) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolver) => {
    rl.question(texto, (answer) => {
      rl.close();
      resolver(answer);
    });
  });
};

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

console.log(chalk.hex('#00FFFF').bold('─◉ Bienvenido al sistema Luna-botv6'));

// ... (Funciones de limpieza se mantienen igual) ...

function formatearNumeroTelefono(numero) {
  let formattedNumber = numero.replace(/[^\d+]/g, '');
  if (formattedNumber.startsWith('+52') && !formattedNumber.startsWith('+521')) {
    formattedNumber = formattedNumber.replace('+52', '+521');
  } else if (formattedNumber.startsWith('52') && !formattedNumber.startsWith('521')) {
    formattedNumber = `+521${formattedNumber.slice(2)}`;
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

  const authPath = join(__dirname, global.authFile);
  if (!fsSync.existsSync(authPath)) await fs.mkdir(authPath, { recursive: true });

  const credsPath = join(authPath, 'creds.json');
  
  // Si NO existe sesión, pedimos el número
  if (!fsSync.existsSync(credsPath)) {
    console.log(chalk.hex('#FFD700').bold('\n─◉ Iniciando vinculación por código de 8 dígitos...'));
    
    const phoneNumber = await question(chalk.hex('#FFD700').bold('─◉ Escriba su número de WhatsApp:\n') + chalk.hex('#E0E0E0').bold('◉ Ejemplo: +5493483466763\n─> '));
    
    const numeroTelefono = formatearNumeroTelefono(phoneNumber);
    
    if (!esNumeroValido(numeroTelefono)) {
      console.log(chalk.bgRed(chalk.white.bold('\n [ ERROR ] Número inválido. Reintente con código de país. \n')));
      isRunning = false;
      return start(file);
    }

    process.argv.push(numeroTelefono, 'code');
  }

  const args = [join(__dirname, file), ...process.argv.slice(2)];
  setupMaster({ exec: args[0], args: args.slice(1) });

  const p = fork();

  p.on('message', (data) => {
    if (data === 'reset') {
      p.kill();
      isRunning = false;
      start(file);
    }
  });

  p.on('exit', (_, code) => {
    isRunning = false;
    if (code !== 0) {
      console.error(chalk.red.bold('[ ERROR ] Proceso finalizado, reiniciando...'));
      start(file);
    }
  });
}

start('main.js');