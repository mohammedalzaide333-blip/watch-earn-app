const express = require("express");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// يبني رابط الـ Offerwall الخاص بالمستخدم الحالي، بإدخال معرّفه داخل الرابط العام
// المخزّن في OFFERWALL_URL_TEMPLATE (مثال: https://provider.com/wall?pub_id=XXXX&subid={USER_ID})
router.get("/url", requireAuth, (req, res) => {
  const template = process.env.OFFERWALL_URL_TEMPLATE;

  if (!template) {
    return res.json({ configured: false });
  }

  const url = template.replace("{USER_ID}", req.userId);
  res.json({ configured: true, url });
});

module.exports = router;
