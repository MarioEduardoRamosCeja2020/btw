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

// Función question mejorada para evitar errores en entornos como Render
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

// --- Funciones de Limpieza ---
async function limpiarArchivosTMP() {
    const tmpPath = join(__dirname, 'src/tmp');
    try {
        const files = await fs.readdir(tmpPath);
        for (const file of files) {
            await fs.rm(join(tmpPath, file), { recursive: true, force: true });
        }
    } catch (err) {}
}

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

// --- Función Principal de Arranque ---
async function start(file) {
    if (isRunning) return;
    isRunning = true;

    // Verificar carpeta de sesión
    const authPath = join(__dirname, global.authFile || 'MysticSession');
    if (!fsSync.existsSync(authPath)) await fs.mkdir(authPath, { recursive: true });

    const credsPath = join(authPath, 'creds.json');
    
    // Si NO existe sesión, configuramos el emparejamiento por código
    if (!fsSync.existsSync(credsPath)) {
        let numeroTelefono = process.env.WHATSAPP_NUMBER;

        if (numeroTelefono) {
            console.log(chalk.hex('#39FF14').bold(`─◉ Usando WHATSAPP_NUMBER de variables de entorno: ${numeroTelefono}`));
            numeroTelefono = formatearNumeroTelefono(numeroTelefono);
        } else {
            console.log(chalk.hex('#FFD700').bold('\n─◉ No se detectó WHATSAPP_NUMBER en variables de entorno.'));
            const phoneNumber = await question(chalk.hex('#FFD700').bold('─◉ Escriba su número de WhatsApp con código de país:\n─> '));
            numeroTelefono = formatearNumeroTelefono(phoneNumber);
        }
        
        if (!esNumeroValido(numeroTelefono)) {
            console.log(chalk.bgRed(chalk.white.bold('\n [ ERROR ] Número inválido. Reintente. \n')));
            isRunning = false;
            return start(file);
        }

        // Pasamos los argumentos necesarios para forzar el modo código
        process.argv.push(numeroTelefono, 'code');
    }

    // Ejecución del proceso hijo
    const args = [join(__dirname, file), ...process.argv.slice(2)];
    setupMaster({ exec: args[0], args: args.slice(1) });

    const p = fork();

    p.on('message', (data) => {
        console.log(chalk.hex('#39FF14').bold('─◉ RECIBIDO:'), data);
        if (data === 'reset') {
            p.kill();
            isRunning = false;
            start(file);
        }
    });

    p.on('exit', (_, code) => {
        isRunning = false;
        console.error(chalk.hex('#FF1493').bold('[ INFO ] Proceso finalizado con código:'), code);
        if (code !== 0) start(file);
    });

    // Limpieza inicial
    await limpiarArchivosTMP();
}

start('main.js');