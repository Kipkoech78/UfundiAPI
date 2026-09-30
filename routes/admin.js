const express = require("express");
const User = require("../models/User");
const Visit = require("../models/Visit");
const ContactLog = require("../models/ContactLog");
const Review = require("../models/Review");
const { protect, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(protect, requireRole("admin"));

const TZ = "Africa/Nairobi"; // UTC+3, no DST
const DAY = 864e5;
const dayKey = (t) => new Date(t).toLocaleDateString("en-CA", { timeZone: TZ }); // YYYY-MM-DD
const dstr = { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: TZ } };
const grp = (f) => [{ $group: { _id: f, n: { $sum: 1 } } }, { $sort: { n: -1 } }];
const top = (a = []) => a.map((x) => ({ label: x._id || "Unknown", n: x.n }));
const first = (a) => a?.[0]?.n || 0;
const h = (fn) => (req, res) => fn(req, res).catch((e) => res.status(500).json({ message: e.message }));

const uniqueSince = async (ms) =>
  first(await Visit.aggregate([
    { $match: { createdAt: { $gte: new Date(Date.now() - ms) } } },
    { $group: { _id: "$visitorId" } },
    { $count: "n" },
  ]));

// @route GET /api/admin/stats?days=30 — everything the dashboard needs in one call
router.get("/stats", h(async (req, res) => {
  const days = Math.min(Math.max(parseInt(req.query.days) || 30, 1), 365);
  const keys = Array.from({ length: days }, (_, i) => dayKey(Date.now() - (days - 1 - i) * DAY));
  const since = new Date(`${keys[0]}T00:00:00+03:00`);
  const inRange = { $match: { createdAt: { $gte: since } } };

  const [vis, wau, mau, online, users, contacts, reviews, recentUsers, recentContacts] = await Promise.all([
    Visit.aggregate([inRange, { $facet: {
      total: [{ $count: "n" }],
      unique: [{ $group: { _id: "$visitorId" } }, { $count: "n" }],
      sessions: [{ $group: { _id: "$sessionId" } }, { $count: "n" }],
      daily: [
        { $group: { _id: { d: dstr, v: "$visitorId" }, n: { $sum: 1 } } },
        { $group: { _id: "$_id.d", views: { $sum: "$n" }, visitors: { $sum: 1 } } },
      ],
      pages: [...grp("$path"), { $limit: 8 }],
      devices: grp("$device"),
      browsers: [...grp("$browser"), { $limit: 6 }],
      referrers: [{ $match: { referrer: { $ne: "" } } }, ...grp("$referrer"), { $limit: 6 }],
    } }]),
    uniqueSince(7 * DAY),
    uniqueSince(30 * DAY),
    Visit.distinct("visitorId", { lastSeen: { $gte: new Date(Date.now() - 2 * 60e3) } }),
    User.aggregate([{ $facet: {
      roles: grp("$role"),
      categories: [{ $match: { role: "worker" } }, ...grp("$category"), { $limit: 8 }],
      verified: [{ $match: { role: "worker", isVerified: true } }, { $count: "n" }],
      available: [{ $match: { role: "worker", isAvailable: true } }, { $count: "n" }],
      signups: [inRange, { $group: { _id: { d: dstr, r: "$role" }, n: { $sum: 1 } } }],
      jobs: [{ $group: { _id: null, n: { $sum: "$jobsCompleted" } } }],
    } }]),
    ContactLog.aggregate([{ $facet: {
      total: [{ $count: "n" }],
      daily: [inRange, { $group: { _id: dstr, n: { $sum: 1 } } }],
      methods: grp("$method"),
      statuses: grp("$status"),
    } }]),
    Review.aggregate([{ $group: { _id: null, n: { $sum: 1 }, avg: { $avg: "$rating" } } }]),
    User.find({ role: { $ne: "admin" } }).sort("-createdAt").limit(6).select("name role category createdAt isVerified"),
    ContactLog.find().sort("-createdAt").limit(6).populate("worker", "name category").populate("client", "name"),
  ]);

  const v = vis[0], u = users[0], c = contacts[0];
  const dv = Object.fromEntries(v.daily.map((x) => [x._id, x]));
  const cd = Object.fromEntries(c.daily.map((x) => [x._id, x.n]));
  const sg = {};
  u.signups.forEach(({ _id, n }) => {
    if (_id.r === "admin") return;
    (sg[_id.d] ??= { workers: 0, clients: 0 })[_id.r === "worker" ? "workers" : "clients"] += n;
  });

  const series = keys.map((k) => ({
    date: k,
    views: dv[k]?.views || 0,
    visitors: dv[k]?.visitors || 0,
    workers: sg[k]?.workers || 0,
    clients: sg[k]?.clients || 0,
    contacts: cd[k] || 0,
  }));
  const today = series[series.length - 1];
  const roles = Object.fromEntries(u.roles.map((x) => [x._id, x.n]));
  const workers = roles.worker || 0;

  res.json({
    days, series,
    traffic: {
      views: first(v.total), visitors: first(v.unique), sessions: first(v.sessions),
      pagesPerSession: +(first(v.total) / (first(v.sessions) || 1)).toFixed(1),
      today, dau: today.visitors, wau, mau,
      stickiness: mau ? Math.round((today.visitors / mau) * 100) : 0,
      online: online.length,
      pages: top(v.pages), devices: top(v.devices), browsers: top(v.browsers), referrers: top(v.referrers),
    },
    users: {
      total: workers + (roles.client || 0), workers, clients: roles.client || 0,
      verified: first(u.verified), pending: workers - first(u.verified), available: first(u.available),
      jobsCompleted: u.jobs[0]?.n || 0, categories: top(u.categories),
    },
    contacts: { total: first(c.total), methods: top(c.methods), statuses: top(c.statuses) },
    reviews: { total: reviews[0]?.n || 0, avg: +(reviews[0]?.avg || 0).toFixed(2) },
    recent: { users: recentUsers, contacts: recentContacts },
  });
}));

// @route GET /api/admin/users?role=&q=&page=
router.get("/users", h(async (req, res) => {
  const { role, q, page = 1 } = req.query;
  const limit = 12;
  const filter = {};
  if (["client", "worker", "admin"].includes(role)) filter.role = role;
  if (q) {
    const rx = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ name: rx }, { email: rx }, { phone: rx }];
  }
  const p = Math.max(parseInt(page) || 1, 1);
  const [items, total] = await Promise.all([
    User.find(filter).select("-password").sort("-createdAt").skip((p - 1) * limit).limit(limit),
    User.countDocuments(filter),
  ]);
  res.json({ items, total, page: p, pages: Math.max(Math.ceil(total / limit), 1) });
}));

// @route PATCH /api/admin/users/:id   body: { isVerified?, isAvailable? }
router.patch("/users/:id", h(async (req, res) => {
  const update = {};
  ["isVerified", "isAvailable"].forEach((k) => { if (typeof req.body[k] === "boolean") update[k] = req.body[k]; });
  const user = await User.findByIdAndUpdate(req.params.id, update, { new: true }).select("-password");
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json({ user });
}));

// @route DELETE /api/admin/users/:id  (removes the user plus their reviews and contact history)
router.delete("/users/:id", h(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: "User not found" });
  if (user.role === "admin") return res.status(400).json({ message: "Admin accounts can't be deleted here" });
  await Promise.all([
    Review.deleteMany({ $or: [{ worker: user._id }, { client: user._id }] }),
    ContactLog.deleteMany({ $or: [{ worker: user._id }, { client: user._id }] }),
    user.deleteOne(),
  ]);
  res.json({ message: "User deleted" });
}));

module.exports = router;
