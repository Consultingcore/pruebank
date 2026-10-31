const nodemailer = require('nodemailer');

let transporter = null;
if (process.env.SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_PORT === '465',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
}

const smtpEnabled = () => Boolean(transporter);

async function sendResetEmail(to, link) {
  if (!transporter) {
    console.log(`[mailer] SMTP no configurado. Enlace de recuperación para ${to}: ${link}`);
    return;
  }
  await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to,
    subject: 'Recupera tu acceso a Núcleo Kokón',
    text: `Hola,\n\nPara crear una nueva contraseña entra a este enlace (vigente 30 minutos):\n${link}\n\nSi no lo solicitaste, ignora este mensaje.\n\nNúcleo Kokón`,
  });
}

module.exports = { sendResetEmail, smtpEnabled };
