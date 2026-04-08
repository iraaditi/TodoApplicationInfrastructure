require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const { createClient } = require('redis');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Razorpay = require('razorpay');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

// --- DATABASE CONNECTIONS ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('❌ MongoDB Error:', err));

const redisClient = createClient({ url: process.env.REDIS_URL });
redisClient.on('error', (err) => console.log('❌ Redis Error', err));
redisClient.connect().then(() => console.log('✅ Redis Connected'));

// --- RAZORPAY INITIALIZATION ---
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// --- MONGODB MODELS ---
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  isPremium: { type: Boolean, default: false } // Added to track premium status
});
const User = mongoose.model('User', UserSchema);

const TaskSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  completed: { type: Boolean, default: false },
  colorCode: { type: String, default: '#ffffff' }, // Premium feature
  order: { type: Number, default: 0 } // For drag and drop ordering
});
const Task = mongoose.model('Task', TaskSchema);

// --- JWT AUTHENTICATION MIDDLEWARE ---
// This acts as a bouncer. It checks if the user has a valid token before letting them see tasks.
const authenticateToken = (req, res, next) => {
  const token = req.header('Authorization');
  if (!token) return res.status(401).json({ message: 'Access Denied: No token provided!' });

  try {
    const verified = jwt.verify(token.replace('Bearer ', ''), process.env.JWT_SECRET);
    req.user = verified; // Attach user info to the request
    next(); // Pass to the next function
  } catch (err) {
    res.status(400).json({ message: 'Invalid Token' });
  }
};

// --- AUTHENTICATION ROUTES ---

app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  try {
    // Redis Indexing for O(1) duplicate checks
    const isDuplicate = await redisClient.sIsMember('usernames', username);
    if (isDuplicate) {
      return res.status(400).json({ message: 'Username already exists! Choose another.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, password: hashedPassword });
    await newUser.save();

    await redisClient.sAdd('usernames', username);
    res.status(201).json({ message: 'User registered successfully!' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ message: 'User not found!' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid credentials!' });

    // Include isPremium in the token payload so frontend knows
    const token = jwt.sign(
      { userId: user._id, username: user.username, isPremium: user.isPremium }, 
      process.env.JWT_SECRET, 
      { expiresIn: '24h' }
    );

    res.json({ message: 'Login successful', token, isPremium: user.isPremium });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
});

// --- TASK CRUD ROUTES (Protected by Middleware) ---

// Get all tasks for the logged-in user
app.get('/tasks', authenticateToken, async (req, res) => {
  try {
    const tasks = await Task.find({ userId: req.user.userId }).sort({ order: 1 });
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching tasks', error });
  }
});

// Add a new task
app.post('/tasks', authenticateToken, async (req, res) => {
  try {
    const newTask = new Task({
      userId: req.user.userId,
      title: req.body.title,
      colorCode: req.body.colorCode || '#ffffff',
      order: req.body.order || 0
    });
    const savedTask = await newTask.save();
    res.status(201).json(savedTask);
  } catch (error) {
    res.status(500).json({ message: 'Error creating task', error });
  }
});

// Update a task (edit title, complete status, or color/order)
app.put('/tasks/:id', authenticateToken, async (req, res) => {
  try {
    const updatedTask = await Task.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.userId }, // Ensure they only edit THEIR task
      req.body,
      { new: true }
    );
    res.json(updatedTask);
  } catch (error) {
    res.status(500).json({ message: 'Error updating task', error });
  }
});

// Delete a task
app.delete('/tasks/:id', authenticateToken, async (req, res) => {
  try {
    await Task.findOneAndDelete({ _id: req.params.id, userId: req.user.userId });
    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting task', error });
  }
});

// --- RAZORPAY PREMIUM ROUTES ---

// 1. Create an Order
app.post('/premium/create-order', authenticateToken, async (req, res) => {
  try {
    const options = {
      amount: 50000, // Amount is in the smallest currency unit (e.g., 50000 paise = ₹500)
      currency: "INR",
      receipt: `receipt_${req.user.userId}`
    };
    const order = await razorpay.orders.create(options);
    res.json(order);
  } catch (error) {
    res.status(500).json({ message: 'Error creating Razorpay order', error });
  }
});

// 2. Verify Payment and Upgrade User
app.post('/premium/verify', authenticateToken, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    
    // Create the expected signature using your secret key
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    // Compare signatures to ensure the payment is legit
    if (expectedSignature === razorpay_signature) {
      // Upgrade user in MongoDB
      await User.findByIdAndUpdate(req.user.userId, { isPremium: true });
      res.json({ message: 'Payment verified successfully. Welcome to Premium!' });
    } else {
      res.status(400).json({ message: 'Invalid signature. Payment verification failed.' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error verifying payment', error });
  }
});

// --- START SERVER ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});