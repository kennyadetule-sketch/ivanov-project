require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');

const User = require('./models/User');
const Request = require('./models/Request');
const Admin = require('./models/admin');

const app = express();

// ================= MIDDLEWARE =================
app.use(cors());
app.use(express.json());

// ================= EMAIL SETUP =================
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
  user: process.env.EMAIL_USER,
  pass: process.env.EMAIL_PASS
}
});

// ================= DATABASE =================
mongoose.connect(process.env.MONGO_URI)
.then(() => {
  console.log("Database connected");
  createAdmin(); // ensure admin exists
})
.catch(err => console.log(err));

// ================= CREATE DEFAULT ADMIN =================
async function createAdmin() {
  const existing = await Admin.findOne({ username: "admin" });

  if (!existing) {
    const hashedPassword = await bcrypt.hash("1234", 10);

    const admin = new Admin({
      username: "admin",
      password: hashedPassword
    });

    await admin.save();
    console.log("Admin created");
  }
}

// ================= ROUTES =================

// Test
app.get('/', (req, res) => {
  res.send('API is running...');
});

// SIGNUP
app.post('/signup', async (req, res) => {
  const { email, username, password } = req.body;

  if (!email || !username || !password) {
    return res.send("All fields are required");
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(email)) {
    return res.send("Invalid email format");
  }

  if (password.length < 6) {
    return res.send("Password must be at least 6 characters");
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = new User({ email, username, password: hashedPassword });
  await user.save();

  res.send("User registered");
});

// LOGIN
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.send({ success: false, message: "Fill all fields" });
  }

  const user = await User.findOne({ username });

  if (!user) {
    return res.send({ success: false, message: "User not found" });
  }

  const isMatch = await bcrypt.compare(password, user.password);

  if (isMatch) {
    res.send({ success: true });
  } else {
    res.send({ success: false, message: "Wrong password" });
  }
});

// ADMIN LOGIN
app.post('/admin-login', async (req, res) => {
  const { username, password } = req.body;

  const admin = await Admin.findOne({ username });

  if (!admin) {
    return res.send({ success: false });
  }

  const isMatch = await bcrypt.compare(password, admin.password);

  if (isMatch) {
    res.send({ success: true });
  } else {
    res.send({ success: false });
  }
});

// SERVICE REQUEST
app.post('/request', async (req, res) => {
  const { name, email, phone, address, budget, service } = req.body;

  if (!name || !email || !phone || !address || !budget || !service) {
    return res.send("All fields are required");
  }

  if (isNaN(budget)) {
    return res.send("Budget must be a number");
  }

  const request = new Request({
    name,
    email,
    phone,
    address,
    budget,
    service
  });

  await request.save();

  const mailOptions = {
    from: 'Ivosioncreativesystem.lightweb@gmail.com',
    to: 'Ivosioncreativesystem.lightweb@gmail.com',
    subject: 'New Service Request',
    html: `
      <h3>New Request Received</h3>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Phone:</strong> ${phone}</p>
      <p><strong>Address:</strong> ${address}</p>
      <p><strong>Budget:</strong> ${budget}</p>
      <p><strong>Service:</strong> ${service}</p>
    `
  };

  transporter.sendMail(mailOptions, (error) => {
    if (error) {
      console.log(error);
      res.send("Saved but email failed");
    } else {
      res.send("Request saved & email sent");
    }
  });
});

// GET REQUESTS
app.get('/requests', async (req, res) => {
  const requests = await Request.find();
  res.json(requests);
});

// ================= START SERVER =================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});