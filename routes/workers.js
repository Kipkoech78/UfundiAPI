const express = require("express");
const User = require("../models/User");
const Review = require("../models/Review");
const ContactLog = require("../models/ContactLog");
const { protect, optionalAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

// @route  GET /api/workers/nearby?lng=&lat=&radiusKm=10&category=Plumber&sort=distance|contacts|rating
router.get("/nearby", async (req, res) => {
  try {
    const { lng, lat, radiusKm = 15, category, sort = "distance" } = req.query;
    if (!lng || !lat) {
      return res.status(400).json({ message: "lng and lat query params are required" });
    }

    const geoStage = {
      near: {
        type: "Point",
        coordinates: [Number(lng), Number(lat)],
      },
      distanceField: "distanceMeters",
      maxDistance: Number(radiusKm) * 1000,
      spherical: true,
      query: {
        role: "worker",
        isAvailable: true,
        ...(category ? { category } : {}),
      },
    };

    const pipeline = [{ $geoNear: geoStage }];

    if (sort === "contacts") pipeline.push({ $sort: { contactCount: -1 } });
    else if (sort === "rating") pipeline.push({ $sort: { ratingAvg: -1, ratingCount: -1 } });
    // default: results already sorted by distance from $geoNear

    pipeline.push({ $project: { password: 0 } });
    pipeline.push({ $limit: 100 });

    const workers = await User.aggregate(pipeline);
    const withKm = workers.map((w) => ({ ...w, distanceKm: +(w.distanceMeters / 1000).toFixed(2) }));

    res.json({ count: withKm.length, workers: withKm });
  } catch (err) {
    res.status(500).json({ message: "Search failed", error: err.message });
  }
});

// @route  GET /api/workers/categories
router.get("/categories", (req, res) => {
  const { CATEGORIES } = require("../models/User");
  res.json({ categories: CATEGORIES });
});

// @route  GET /api/workers/:id
router.get("/:id", async (req, res) => {
  try {
    const worker = await User.findOne({ _id: req.params.id, role: "worker" }).select("-password");
    if (!worker) return res.status(404).json({ message: "Worker not found" });

    const reviews = await Review.find({ worker: worker._id })
      .populate("client", "name")
      .sort("-createdAt")
      .limit(50);

    res.json({ worker, reviews });
  } catch (err) {
    res.status(500).json({ message: "Failed to load worker", error: err.message });
  }
});

// @route  PUT /api/workers/me  (worker updates own profile / location / availability)
router.put("/me", protect, requireRole("worker"), async (req, res) => {
  try {
    const { name, phone, whatsapp, bio, category, skills, yearsExperience, isAvailable, lng, lat, address, avatarUrl } = req.body;
    const worker = await User.findById(req.user._id);

    if (name) worker.name = name;
    if (phone) worker.phone = phone;
    if (whatsapp) worker.whatsapp = whatsapp;
    if (bio !== undefined) worker.bio = bio;
    if (category) worker.category = category;
    if (skills) worker.skills = skills;
    if (yearsExperience !== undefined) worker.yearsExperience = yearsExperience;
    if (isAvailable !== undefined) worker.isAvailable = isAvailable;
    if (avatarUrl !== undefined) worker.avatarUrl = avatarUrl;

    if (lng !== undefined && lat !== undefined && lng !== "" && lat !== "") {
      const nLng = Number(lng);
      const nLat = Number(lat);
      const validLng = !Number.isNaN(nLng) && nLng >= -180 && nLng <= 180;
      const validLat = !Number.isNaN(nLat) && nLat >= -90 && nLat <= 90;

      if (!validLng || !validLat) {
        return res.status(400).json({ message: "Invalid coordinates supplied" });
      }

      worker.location = {
        type: "Point",
        coordinates: [nLng, nLat],
        address: address !== undefined ? address : worker.location?.address || "",
      };
      worker.markModified("location"); // belt-and-braces: guarantees Mongoose persists the nested doc
    } else if (address !== undefined) {
      worker.location.address = address;
      worker.markModified("location");
    }

    await worker.save();
    res.json({ worker: worker.toSafeObject() });
  } catch (err) {
    res.status(500).json({ message: "Update failed", error: err.message });
  }
});

// @route  GET /api/workers/me/dashboard  (worker's own stats - contacts, jobs, rating)
router.get("/me/dashboard", protect, requireRole("worker"), async (req, res) => {
  try {
    const logs = await ContactLog.find({ worker: req.user._id }).sort("-createdAt").limit(50);
    res.json({
      contactCount: req.user.contactCount,
      jobsCompleted: req.user.jobsCompleted,
      ratingAvg: req.user.ratingAvg,
      ratingCount: req.user.ratingCount,
      recentContacts: logs,
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to load dashboard", error: err.message });
  }
});

// @route  POST /api/workers/:id/contact  (client taps Call or WhatsApp - Uber-style "most contacted" ranking signal)
router.post("/:id/contact", optionalAuth, async (req, res) => {
  try {
    const { method, lng, lat } = req.body; // method: 'call' | 'whatsapp'
    if (!["call", "whatsapp"].includes(method)) {
      return res.status(400).json({ message: "method must be 'call' or 'whatsapp'" });
    }

    const worker = await User.findOne({ _id: req.params.id, role: "worker" });
    if (!worker) return res.status(404).json({ message: "Worker not found" });

    worker.contactCount += 1;
    await worker.save();

    await ContactLog.create({
      worker: worker._id,
      client: req.user?._id,
      method,
      clientLocation: lng && lat ? { type: "Point", coordinates: [Number(lng), Number(lat)] } : undefined,
    });

    res.json({ message: "Contact logged", contactCount: worker.contactCount, phone: worker.phone, whatsapp: worker.whatsapp });
  } catch (err) {
    res.status(500).json({ message: "Failed to log contact", error: err.message });
  }
});

// @route  PUT /api/workers/contact/:logId/status  (client or worker updates job status - simple work tracking)
router.put("/contact/:logId/status", protect, async (req, res) => {
  try {
    const { status } = req.body; // in_progress | completed | cancelled
    const log = await ContactLog.findById(req.params.logId);
    if (!log) return res.status(404).json({ message: "Contact log not found" });

    const isOwnerWorker = log.worker.toString() === req.user._id.toString();
    const isOwnerClient = log.client?.toString() === req.user._id.toString();
    if (!isOwnerWorker && !isOwnerClient) return res.status(403).json({ message: "Forbidden" });

    log.status = status;
    await log.save();

    if (status === "completed" && isOwnerWorker) {
      await User.findByIdAndUpdate(log.worker, { $inc: { jobsCompleted: 1 } });
    }

    res.json({ log });
  } catch (err) {
    res.status(500).json({ message: "Failed to update status", error: err.message });
  }
});

module.exports = router;
