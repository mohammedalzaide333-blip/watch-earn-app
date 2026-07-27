const nodemailer = require("nodemailer");

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return null;

  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return transporter;
}

async function sendResetEmail(toEmail, resetUrl) {
  const t = getTransporter();
  if (!t) {
    throw new Error("خدمة البريد الإلكتروني غير مُهيّأة على الخادم بعد");
  }

  await t.sendMail({
    from: process.env.SMTP_USER,
    to: toEmail,
    subject: "استعادة كلمة المرور — مِشاهدة",
    html: `
      <div dir="rtl" style="font-family: Arial, sans-serif; padding: 20px;">
        <h2>استعادة كلمة المرور</h2>
        <p>وصلنا طلب لإعادة تعيين كلمة مرور حسابك في موقع مِشاهدة.</p>
        <p><a href="${resetUrl}" style="background:#C9A227; color:#1a1608; padding:10px 20px; text-decoration:none; border-radius:8px; display:inline-block;">إعادة تعيين كلمة المرور</a></p>
        <p>هذا الرابط صالح لمدة ساعة واحدة فقط.</p>
        <p>إذا لم تطلب هذا، تجاهل هذه الرسالة ببساطة.</p>
      </div>
    `,
  });
}

module.exports = { sendResetEmail };
