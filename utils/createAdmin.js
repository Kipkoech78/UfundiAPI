// Usage: node utils/createAdmin.js you@email.com "StrongPassword" "Your Name"
require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const User = require("../models/User");

(async () => {
  const [email, password, name = "UfundiHome Admin"] = process.argv.slice(2);
  if (!email || !password) {
    console.error('Usage: node utils/createAdmin.js <email> <password> ["Name"]');
    process.exit(1);
  }
  await connectDB();
  let user = await User.findOne({ email: email.toLowerCase() });
  if (user) {
    user.role = "admin";
    if (password) user.password = password; // re-hashed by the pre-save hook
    await user.save();
    console.log(`Promoted existing user to admin: ${user.email}`);
  } else {
    user = await User.create({ name, email, password, phone: process.env.SUPPORT_PHONE || "0719200522", role: "admin" });
    console.log(`Admin created: ${user.email}`);
  }
  await mongoose.disconnect();
})();
