const cooldowns = new Map();

const handler = async (m, { conn, participants, args, isOwner }) => {
  const chatId = m.chat;
  const cooldownTime = 2 * 60 * 1000;
  const now = Date.now();

  const groupMetadata = await conn.groupMetadata(chatId);
  const groupAdmins = groupMetadata.participants.filter(p => p.admin !== null).map(p => p.id);

  let realUserJid = m.sender;
  if (m.sender.includes('@lid')) {
    const pdata = groupMetadata.participants.find(p => p.lid === m.sender);
    if (pdata && pdata.id) realUserJid = pdata.id;
  }

  const isUserAdmin = groupAdmins.includes(realUserJid);
  if (!isUserAdmin && !isOwner) {
    return m.reply('⚠️ *Acceso Denegado* | Solo administradores.');
  }

  if (cooldowns.has(chatId)) {
    const expirationTime = cooldowns.get(chatId) + cooldownTime;
    if (now < expirationTime) {
      const timeLeft = Math.ceil((expirationTime - now) / 1000);
      return m.reply(`⏳ *Espera un momento:* ${timeLeft} segundos restantes.`);
    }
  }
  cooldowns.set(chatId, now);

  const messageText = args.join(' ') || 'Sin mensaje de referencia';
  
  // --- DISEÑO VISUAL MODERNO ---
  let teks = `『 *𝐈𝐍𝐕𝐎𝐂𝐀𝐂𝐈𝐎́𝐍 𝐆𝐄𝐍𝐄𝐑𝐀𝐋* 』\n\n`;
  teks += `📢 *Mensaje:* ${messageText}\n\n`;
  teks += `┌──────────────────\n`;
  
  for (const mem of participants) {
    // Usamos un símbolo más moderno y limpio (•)
    teks += `│ ⚡ @${mem.id.split('@')[0]}\n`;
  }
  
  teks += `└──────────────────\n\n`;
  teks += `> *Luna-Botv6 • System*`;

  await conn.sendMessage(chatId, { 
    text: teks, 
    mentions: participants.map(a => a.id),
    contextInfo: {
      externalAdReply: {
        title: 'ʟᴜɴᴀ-ʙᴏᴛᴠ6',
        body: 'Invocación Activa',
        thumbnailUrl: 'https://i.imgur.com/your_image.jpg', // Opcional: agrega una imagen
        sourceUrl: '',
        mediaType: 1,
        renderLargerThumbnail: false
      }
    }
  });
};

handler.help = ['tagall <mensaje>'];
handler.tags = ['group'];
handler.command = /^(tagall|invocar|invocacion|todos|invocación)$/i;
handler.group = true;

export default handler;