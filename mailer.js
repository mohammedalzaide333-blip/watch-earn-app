// نستخدم Brevo (واجهة HTTPS) بدل SMTP التقليدي، لأن Render يحظر اتصالات SMTP الصادرة
// في الخطة المجانية. HTTPS غير محظور، لذا هذا الحل يعمل من أي منصة استضافة مجانية.

async function sendResetEmail(toEmail, resetUrl) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    throw new Error("خدمة البريد الإلكتروني غير مُهيّأة على الخادم بعد");
  }

  const fromEmail = process.env.BREVO_FROM_EMAIL || "no-reply@mishahda.app";

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      sender: { email: fromEmail, name: "مِشاهدة" },
      to: [{ email: toEmail }],
      subject: "استعادة كلمة المرور — مِشاهدة",
      htmlContent: `
        <div dir="rtl" style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>استعادة كلمة المرور</h2>
          <p>وصلنا طلب لإعادة تعيين كلمة مرور حسابك في موقع مِشاهدة.</p>
          <p><a href="${resetUrl}" style="background:#C9A227; color:#1a1608; padding:10px 20px; text-decoration:none; border-radius:8px; display:inline-block;">إعادة تعيين كلمة المرور</a></p>
          <p>هذا الرابط صالح لمدة ساعة واحدة فقط.</p>
          <p>إذا لم تطلب هذا، تجاهل هذه الرسالة ببساطة.</p>
        </div>
      `,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error("فشل إرسال البريد عبر Brevo: " + errText);
  }
}

module.exports = { sendResetEmail };
