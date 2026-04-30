require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('./User');
const Request = require('./Request');
const Admin = require('./admin');

const app = express();

// ================= MIDDLEWARE =================
app.use(cors());
app.use(express.json());

// ================= AUTH MIDDLEWARE =================
function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Invalid or expired token' });
    }

    req.user = decoded;
    next();
  });
}

function authenticateAdmin(req, res, next) {
  authenticateToken(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    next();
  });
}

// ================= EMAIL SETUP =================
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});


// ================= DATABASE =================
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('Database connected');
    createAdmin();
  })
  .catch(err => console.log(err));

// ================= CREATE DEFAULT ADMIN =================
async function createAdmin() {
  const existing = await Admin.findOne({ username: 'ivanov-admin' });

  if (!existing) {
    const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'ChangeThisNow123!', 10);

    const admin = new Admin({
      username: 'ivanov-admin',
      password: hashedPassword
    });

    await admin.save();
    console.log('Default admin created');
  }
}

// ================= ROUTES =================
app.get('/', (req, res) => {
  res.send('API is running...');
});

// ================= SIGNUP =================
app.post('/signup', async (req, res) => {
  try {
    const { email, username, password } = req.body;

    if (!email || !username || !password) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    const existingUser = await User.findOne({
      $or: [{ email }, { username }]
    });

    if (existingUser) {
      return res.status(409).json({ success: false, message: 'Email or username already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ email, username, password: hashedPassword });
    await user.save();

    res.status(201).json({ success: true, message: 'Account created successfully!' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error during signup' });
  }
});

// ================= LOGIN =================
app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Wrong password' });
    }

    const token = jwt.sign(
      {
        userId: user._id,
        username: user.username,
        role: 'user'
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error during login' });
  }
});

// ================= ADMIN LOGIN =================
app.post('/admin-login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const admin = await Admin.findOne({ username });
    if (!admin) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      {
        adminId: admin._id,
        username: admin.username,
        role: 'admin'
      },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.json({
      success: true,
      token
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error during admin login' });
  }
});

// ================= SERVICE REQUEST =================
app.post('/request', async (req, res) => {
  try {
    const { name, email, phone, address, budget, service, description } = req.body;

    const request = await Request.create({
      name,
      email,
      phone,
      address,
      budget: Number(budget),
      service,
      description: (description || '').trim()
    });

    let emailSent = true;

    try {
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: process.env.EMAIL_USER,
        replyTo: email,
        subject: `New ${service} Request from ${name}`,
        html: `
          <h2>New Service Request</h2>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Phone:</strong> ${phone}</p>
          <p><strong>Address:</strong> ${address}</p>
          <p><strong>Budget:</strong> £${Number(budget).toLocaleString()}</p>
          <p><strong>Service:</strong> ${service}</p>
          <p><strong>Description:</strong> ${description || 'No description provided'}</p>
        `
      });
    } 
    catch (err) {
  console.error("EMAIL ERROR:", err);
  emailSent = false;
}


    res.status(201).json({
      success: true,
      emailSent,
      message: emailSent
        ? 'Request submitted successfully!'
        : 'Request saved but email failed.'
    });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ================= PROTECTED ROUTES =================

// USER PROFILE
app.get('/user-profile', authenticateToken, (req, res) => {
  res.json(req.user);
});

// ADMIN: GET ALL REQUESTS
app.get('/requests', authenticateAdmin, async (req, res) => {
  try {
    const requests = await Request.find().sort({ createdAt: -1 });
    res.json({ success: true, data: requests });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Unable to fetch requests' });
  }
});

// ================= SERVER =================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
