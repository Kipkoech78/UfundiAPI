const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
  {
    worker: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    client: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true }
);

// one review per client per worker (edit instead of duplicate)
reviewSchema.index({ worker: 1, client: 1 }, { unique: true });

module.exports = mongoose.model("Review", reviewSchema);
