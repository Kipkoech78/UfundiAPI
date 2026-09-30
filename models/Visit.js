const mongoose = require("mongoose");

// One document per page view. `lastSeen` is refreshed by a heartbeat ping so we can show "online now".
const visitSchema = new mongoose.Schema(
  {
    visitorId: { type: String, index: true }, // persistent anonymous id (localStorage)
    sessionId: { type: String, index: true }, // per-tab session id (sessionStorage)
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    path: { type: String, default: "/" },
    referrer: { type: String, default: "" },
    device: { type: String, default: "Desktop" },
    browser: { type: String, default: "Other" },
    lastSeen: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

visitSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 400 }); // keep ~13 months
visitSchema.index({ lastSeen: 1 });

module.exports = mongoose.model("Visit", visitSchema);
