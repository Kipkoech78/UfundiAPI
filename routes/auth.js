const express = require("express");
const { body, validationResult } = require("express-validator");
const User = require("../models/User");
const generateToken = require("../utils/generateToken");
const { protect } = require("../middleware/auth");

const router = express.Router();

// @route  POST /api/auth/register
router.post(
  "/register",
  [
    body("name").trim().notEmpty().withMessage("Name is required"),
    body("email").isEmail().withMessage("Valid email required"),
    body("password").isLength({ min: 6 }).withMessage("Password min 6 chars"),
    body("phone").trim().notEmpty().withMessage("Phone is required"),
    body("role").isIn(["client", "worker"]).withMessage("Role must be client or worker"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const {
      name, email, password, phone, whatsapp, role,
      category, bio, skills, yearsExperience,
      lng, lat, address,
    } = req.body;

    try {
      const existing = await User.findOne({ email: email.toLowerCase() });
      if (existing) return res.status(400).json({ message: "Email already registered" });

      if (role === "worker" && !category) {
        return res.status(400).json({ message: "Category is required for workers (e.g. Plumber, Painter)" });
      }

      const user = await User.create({
        name, email, password, phone,
        whatsapp: whatsapp || phone,
        role,
        category: role === "worker" ? category : undefined,
        bio, skills, yearsExperience,
        location: {
          type: "Point",
          coordinates: lng && lat ? [Number(lng), Number(lat)] : [36.8219, -1.2921],
          address: address || "",
        },
      });

      res.status(201).json({
        user: user.toSafeObject(),
        token: generateToken(user._id),
      });
    } catch (err) {
      res.status(500).json({ message: "Registration failed", error: err.message });
    }
  }
);

// @route  POST /api/auth/login
router.post(
  "/login",
  [body("email").isEmail(), body("password").notEmpty()],
  async (req, res) => {
    const { email, password } = req.body;
    try {
      const user = await User.findOne({ email: email.toLowerCase() });
      if (!user || !(await user.matchPassword(password))) {
        return res.status(401).json({ message: "Invalid email or password" });
      }
      res.json({ user: user.toSafeObject(), token: generateToken(user._id) });
    } catch (err) {
      res.status(500).json({ message: "Login failed", error: err.message });
    }
  }
);

// @route  GET /api/auth/me
router.get("/me", protect, async (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
