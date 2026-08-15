const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const CATEGORIES = [
  "Plumber",
  "Electrician",
  "Fitter",
  "Fixer / Handyman",
  "Painter",
  "General Contractor",
  "Metalworker / Welder",
  "Carpenter",
  "Mason",
  "Roofer",
  "Mover / Casual Labour",
  "Other",
];

const locationSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["Point"], default: "Point" },
    coordinates: { type: [Number], default: [36.8219, -1.2921] }, // [lng, lat] - defaults to Nairobi
    address: { type: String, default: "" },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6 },
    phone: { type: String, required: true, trim: true },
    whatsapp: { type: String, trim: true },
    role: { type: String, enum: ["client", "worker", "admin"], default: "client" },

    // Worker-only fields
    category: { type: String, enum: CATEGORIES, default: undefined },
    bio: { type: String, default: "", maxlength: 600 },
    skills: [{ type: String, trim:true }],
    yearsExperience: { type: Number, default: 0 },
    avatarUrl: { type: String, default: "" },
    isAvailable: { type: Boolean, default: true },
    isVerified: { type: Boolean, default: false },

    location: { type: locationSchema, default: () => ({}) },

    // Ranking / trust signals
    contactCount: { type: Number, default: 0 }, // times a client tapped call/whatsapp
    ratingAvg: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    jobsCompleted: { type: Number, default: 0 },
  },
  { timestamps: true }
);

userSchema.index({ location: "2dsphere" });

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.matchPassword = function (entered) {
  return bcrypt.compare(entered, this.password);
};

userSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model("User", userSchema);
module.exports.CATEGORIES = CATEGORIES;
