const mongoose = require("mongoose");

const contactLogSchema = new mongoose.Schema(
  {
    worker: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    client: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // optional - guests can contact too
    method: { type: String, enum: ["call", "whatsapp"], required: true },
    status: {
      type: String,
      enum: ["contacted", "in_progress", "completed", "cancelled"],
      default: "contacted",
    },
    clientLocation: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], default: undefined },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ContactLog", contactLogSchema);
