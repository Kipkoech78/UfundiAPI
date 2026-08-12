require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const User = require("../models/User");

// A spread of demo fundis around Nairobi so /api/workers/nearby has real results to return
const demoWorkers = [
  { name: "James Mwangi", category: "Plumber", coords: [36.8219, -1.2921], area: "CBD" },
  { name: "Grace Wanjiru", category: "Electrician", coords: [36.8095, -1.2833], area: "Westlands" },
  { name: "Peter Otieno", category: "Painter", coords: [36.7856, -1.3197], area: "Kawangware" },
  { name: "Samuel Kiptoo", category: "General Contractor", coords: [36.8859, -1.3032], area: "Buruburu" },
  { name: "Mary Achieng", category: "Fixer / Handyman", coords: [36.7692, -1.2649], area: "Kangemi" },
  { name: "David Kamau", category: "Metalworker / Welder", coords: [36.9083, -1.2206], area: "Kasarani" },
  { name: "Faith Njeri", category: "Fitter", coords: [36.8500, -1.3300], area: "South B" },
  { name: "John Ochieng", category: "Carpenter", coords: [36.7500, -1.3050], area: "Dagoretti" },
  { name: "Lucy Wambui", category: "Mason", coords: [36.9000, -1.2800], area: "Ruaraka" },
  { name: "Brian Mutiso", category: "Roofer", coords: [36.8000, -1.2500], area: "Parklands" },
];

async function seed() {
  await connectDB();
  await User.deleteMany({ role: "worker", email: /@demo.ufundihome.co.ke$/ });

  for (const w of demoWorkers) {
    const email = `${w.name.toLowerCase().replace(/\s+/g, ".")}@demo.ufundihome.co.ke`;
    await User.create({
      name: w.name,
      email,
      password: "password123",
      phone: "0700000000",
      whatsapp: "0700000000",
      role: "worker",
      category: w.category,
      bio: `Experienced ${w.category.toLowerCase()} based in ${w.area}, Nairobi. Reliable, fast response, fair pricing.`,
      yearsExperience: Math.floor(Math.random() * 10) + 1,
      isAvailable: true,
      isVerified: true,
      contactCount: Math.floor(Math.random() * 50),
      ratingAvg: +(3.5 + Math.random() * 1.5).toFixed(1),
      ratingCount: Math.floor(Math.random() * 30) + 1,
      jobsCompleted: Math.floor(Math.random() * 40),
      location: { type: "Point", coordinates: w.coords, address: `${w.area}, Nairobi` },
    });
  }

  console.log(`Seeded ${demoWorkers.length} demo workers.`);
  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
