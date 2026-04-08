require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const { createClient } = require('redis');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');

const app = express();
app.use(cors());
app.use(express.json());

//connecting database
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('❌ MongoDB Error:', err));

const redisClient = createClient({ url: process.env.REDIS_URL });
redisClient.on('error', (err) => console.error('❌ Redis Error:', err.message));
redisClient.connect()
  .then(() => console.log('✅ Redis Connected'))
  .catch(err => console.log('❌ Redis Connection Failed. Please ensure Redis is running!'));

//razorpay implementation
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

//Mongo schemas
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true }, 
  password: { type: String }, 
  googleId: { type: String },
  isPremium: { type: Boolean, default: false } 
});
const User = mongoose.model('User', UserSchema);

const TaskSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  completed: { type: Boolean, default: false },
  colorCode: { type: String, default: '#ffffff' }, 
  order: { type: Number, default: 0 }
});
const Task = mongoose.model('Task', TaskSchema);

//Jwt auth middleware
const authenticateToken = (req, res, next) => {
  const token = req.header('Authorization');
  if (!token) return res.status(401).json({ message: 'Access Denied: No token provided!' });

  try {
    const verified = jwt.verify(token.replace('Bearer ', ''), process.env.JWT_SECRET);
    req.user = verified; 
    next(); 
  } catch (err) {
    res.status(400).json({ message: 'Invalid Token' });
  }
};

//Auth routes
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  try {
    try {
      const isDuplicate = await redisClient.sIsMember('usernames', username);
      if (isDuplicate) {
        return res.status(400).json({ message: 'Username already exists! Choose another.' });
      }
    } catch (redisError) {
      console.log('Redis check failed, relying on MongoDB...');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, password: hashedPassword });
    await newUser.save();

    redisClient.sAdd('usernames', username).catch(() => {});
    res.status(201).json({ message: 'User registered successfully!' });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Username already exists! Choose another.' });
    }
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

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

app.post('/google-login', async (req, res) => {
  const { token } = req.body;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID, 
    });
    const payload = ticket.getPayload();
    const { email, sub: googleId } = payload;

    let user = await User.findOne({ username: email });

    if (!user) {
      user = new User({ 
        username: email, 
        googleId: googleId 
      });
      await user.save();
      redisClient.sAdd('usernames', email).catch(() => {});
    }

    const jwtToken = jwt.sign(
      { userId: user._id, username: user.username, isPremium: user.isPremium }, 
      process.env.JWT_SECRET, 
      { expiresIn: '24h' }
    );

    res.json({ message: 'Google Login successful', token: jwtToken, isPremium: user.isPremium });
  } catch (error) {
    console.error('Google verification failed:', error);
    res.status(400).json({ message: 'Google Authentication Failed' });
  }
});


//task functionalities
app.get('/tasks', authenticateToken, async (req, res) => {
  try {
    const tasks = await Task.find({ userId: req.user.userId }).sort({ order: 1 });
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching tasks', error });
  }
});

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

app.put('/tasks/reorder', authenticateToken, async (req, res) => {
  try {
    const { items } = req.body;
    await Promise.all(items.map(item => 
      Task.findOneAndUpdate(
        { _id: item._id, userId: req.user.userId },
        { order: item.order }
      )
    ));
    res.json({ message: 'Order updated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error updating task order', error });
  }
});

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

app.delete('/tasks/:id', authenticateToken, async (req, res) => {
  try {
    await Task.findOneAndDelete({ _id: req.params.id, userId: req.user.userId });
    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting task', error });
  }
});

//Razorpay routes for premium
app.post('/premium/create-order', authenticateToken, async (req, res) => {
  try {
    const options = {
      amount: 50000,
      currency: "INR",
      receipt: `receipt_${req.user.userId}`
    };
    const order = await razorpay.orders.create(options);
    res.json(order);
  } catch (error) {
    res.status(500).json({ message: 'Error creating Razorpay order', error });
  }
});

app.post('/premium/verify', authenticateToken, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');
    if (expectedSignature === razorpay_signature) {
      await User.findByIdAndUpdate(req.user.userId, { isPremium: true });
      res.json({ message: 'Payment verified successfully. Welcome to Premium!' });
    } else {
      res.status(400).json({ message: 'Invalid signature. Payment verification failed.' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error verifying payment', error });
  }
});

//server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});