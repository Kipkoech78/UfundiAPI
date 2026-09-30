const express = require("express");
const Visit = require("../models/Visit");
const { optionalAuth } = require("../middleware/auth");

const router = express.Router();

const parseUA = (ua = "") => ({
  device: /tablet|ipad/i.test(ua) ? "Tablet" : /mobi|android|iphone/i.test(ua) ? "Mobile" : "Desktop",
  browser: /edg\//i.test(ua) ? "Edge" : /opr\/|opera/i.test(ua) ? "Opera"
    : /chrome|crios/i.test(ua) ? "Chrome" : /firefox|fxios/i.test(ua) ? "Firefox"
    : /safari/i.test(ua) ? "Safari" : "Other",
});

// @route  POST /api/analytics/track   body: { visitorId, sessionId, path, referrer, type: "view" | "ping" }
// Public + fire-and-forget: always answers 204 so tracking can never break the site.
router.post("/track", optionalAuth, async (req, res) => {
  try {
    const { visitorId, sessionId, path, referrer, type } = req.body || {};
    const ua = req.headers["user-agent"] || "";
    if (!visitorId || !sessionId || /bot|crawl|spider|headless|lighthouse|preview/i.test(ua)) {
      return res.sendStatus(204);
    }

    if (type === "ping") {
      await Visit.findOneAndUpdate({ sessionId }, { lastSeen: new Date() }, { sort: { createdAt: -1 } });
      return res.sendStatus(204);
    }

    let ref = "";
    try { ref = referrer ? new URL(referrer).hostname.replace(/^www\./, "") : ""; } catch { /* ignore */ }

    await Visit.create({
      visitorId: String(visitorId).slice(0, 64),
      sessionId: String(sessionId).slice(0, 64),
      user: req.user?._id,
      path: String(path || "/").slice(0, 200),
      referrer: ref,
      ...parseUA(ua),
    });
  } catch (err) {
    /* swallow */
  }
  res.sendStatus(204);
});

module.exports = router;
