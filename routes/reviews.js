const express = require("express");
const Review = require("../models/Review");
const User = require("../models/User");
const { protect, requireRole } = require("../middleware/auth");

const router = express.Router();

async function recalcRating(workerId) {
  const stats = await Review.aggregate([
    { $match: { worker: workerId } },
    { $group: { _id: "$worker", avg: { $avg: "$rating" }, count: { $sum: 1 } } },
  ]);
  const { avg = 0, count = 0 } = stats[0] || {};
  await User.findByIdAndUpdate(workerId, { ratingAvg: +avg.toFixed(2), ratingCount: count });
}

// @route  POST /api/reviews/:workerId  (client leaves/updates a review)
router.post("/:workerId", protect, requireRole("client"), async (req, res) => {
  try {
    const { rating, comment } = req.body;
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: "Rating must be between 1 and 5" });
    }

    const worker = await User.findOne({ _id: req.params.workerId, role: "worker" });
    if (!worker) return res.status(404).json({ message: "Worker not found" });

    const review = await Review.findOneAndUpdate(
      { worker: worker._id, client: req.user._id },
      { rating, comment },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await recalcRating(worker._id);

    res.status(201).json({ review });
  } catch (err) {
    res.status(500).json({ message: "Failed to save review", error: err.message });
  }
});

// @route  GET /api/reviews/:workerId
router.get("/:workerId", async (req, res) => {
  try {
    const reviews = await Review.find({ worker: req.params.workerId })
      .populate("client", "name")
      .sort("-createdAt");
    res.json({ reviews });
  } catch (err) {
    res.status(500).json({ message: "Failed to load reviews", error: err.message });
  }
});

// @route  DELETE /api/reviews/:id  (client removes own review)
router.delete("/:id", protect, async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ message: "Review not found" });
    if (review.client.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Forbidden" });
    }
    await review.deleteOne();
    await recalcRating(review.worker);
    res.json({ message: "Review deleted" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete review", error: err.message });
  }
});

module.exports = router;
