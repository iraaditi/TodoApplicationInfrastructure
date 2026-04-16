require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const redis = require('redis');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');

const app = express();
app.use(cors());
app.use(express.json());

//ENCRYPTION
const algorithm = 'chacha20-poly1305';
const keyHex = process.env.CHACHA20_KEY;
if (!keyHex || keyHex.length !== 64) {
    console.warn('WARNING: CHACHA20_KEY is missing or invalid in .env!');
}
const key = keyHex ? Buffer.from(keyHex, 'hex') : crypto.randomBytes(32);

const encrypt = (text) => {
    const nonce = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(algorithm, key, nonce, { authTagLength: 16 });
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${nonce.toString('hex')}:${authTag}:${encrypted}`;
};

const decrypt = (cipherTextData) => {
    if (!cipherTextData) return '';
    const parts = cipherTextData.split(':');
    if (parts.length !== 3) return cipherTextData;
    
    try {
        const nonce = Buffer.from(parts[0], 'hex');
        const authTag = Buffer.from(parts[1], 'hex');
        const encrypted = parts[2];
        const decipher = crypto.createDecipheriv(algorithm, key, nonce, { authTagLength: 16 });
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (err) {
        return "⚠️ [Encrypted Content]";
    }
};


//connecting database
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('❌ MongoDB Error:', err));

const redisClient = redis.createClient({
    url: `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`,
    socket: {
        reconnectStrategy: false // (or whatever settings we added yesterday)
    },
    disableOfflineQueue: true
});

// The event listeners (this is what prints to the console)
redisClient.on('connect', () => console.log('✅ Redis Connected Successfully to AWS Server!'));
redisClient.on('error', (err) => console.log('❌ Redis Connection Error:', err.message));

// THE CRITICAL MISSING LINE: Tell it to actually connect!
redisClient.connect().catch(console.error);

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
  isPremium: { type: Boolean, default: false },
  mfaSecret: { type: String, default: null },
  mfaEnabled: { type: Boolean, default: false } 
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

    if (user.mfaEnabled) {
        return res.json({ mfaRequired: true, tempUserId: user._id, message: 'MFA code required' });
    }

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
      user = new User({ username: email, googleId: googleId });
      await user.save();
      redisClient.sAdd('usernames', email).catch(() => {});
    }

    if (user.mfaEnabled) {
        return res.json({ mfaRequired: true, tempUserId: user._id, message: 'MFA code required' });
    }

    const jwtToken = jwt.sign(
      { userId: user._id, username: user.username, isPremium: user.isPremium }, 
      process.env.JWT_SECRET, 
      { expiresIn: '24h' }
    );
    res.json({ message: 'Google Login successful', token: jwtToken, isPremium: user.isPremium });
  } catch (error) {
    res.status(400).json({ message: 'Google Authentication Failed' });
  }
});

app.post('/mfa/login-verify', async (req, res) => {
    const { tempUserId, token } = req.body;
    try {
        const user = await User.findById(tempUserId);
        if (!user || !user.mfaEnabled) return res.status(400).json({ message: 'Invalid request' });

        const isVerified = speakeasy.totp.verify({
            secret: user.mfaSecret,
            encoding: 'base32',
            token: token,
            window: 1
        });

        if (isVerified) {
            const jwtToken = jwt.sign(
                { userId: user._id, username: user.username, isPremium: user.isPremium }, 
                process.env.JWT_SECRET, 
                { expiresIn: '24h' }
            );
            res.json({ message: 'Login successful', token: jwtToken, isPremium: user.isPremium });
        } else {
            res.status(400).json({ message: 'Invalid 6-digit code.' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Server error', error });
    }
});

// MFA Routes
app.get('/mfa/status', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId);
        res.json({ mfaEnabled: user.mfaEnabled });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching MFA status', error });
    }
});

app.post('/mfa/disable', authenticateToken, async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.user.userId, { mfaEnabled: false, mfaSecret: null });
        res.json({ message: 'MFA disabled successfully.' });
    } catch (error) {
        res.status(500).json({ message: 'Error disabling MFA', error });
    }
});

app.post('/mfa/setup', authenticateToken, async (req, res) => {
    try {
        const secret = speakeasy.generateSecret({ 
            name: `MyTodoApp (${req.user.username})` 
        });
        
        await User.findByIdAndUpdate(req.user.userId, { mfaSecret: secret.base32 });
        const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);
        
        res.json({ qrCodeUrl });
    } catch (error) {
        res.status(500).json({ message: 'Error setting up MFA', error });
    }
});

app.post('/mfa/verify', authenticateToken, async (req, res) => {
    try {
        const { token } = req.body;
        const user = await User.findById(req.user.userId);
        
        const isVerified = speakeasy.totp.verify({
            secret: user.mfaSecret,
            encoding: 'base32',
            token: token,
            window: 1
        });
        
        if (isVerified) {
            await User.findByIdAndUpdate(req.user.userId, { mfaEnabled: true });
            res.json({ message: 'MFA successfully enabled!' });
        } else {
            res.status(400).json({ message: 'Invalid 6-digit code. Try again.' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Error verifying MFA', error });
    }
});



//task functionalities
app.get('/tasks', authenticateToken, async (req, res) => {
  try {
    const tasks = await Task.find({ userId: req.user.userId }).sort({ order: 1 });
    const decryptedTasks = tasks.map(task => ({
        ...task._doc,
        title: decrypt(task.title) 
    }));
    
    res.json(decryptedTasks);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching tasks', error });
  }
});

app.post('/tasks', authenticateToken, async (req, res) => {
  try {
    const newTask = new Task({
      userId: req.user.userId,
      title: encrypt(req.body.title),
      colorCode: req.body.colorCode || '#ffffff',
      order: req.body.order || 0
    });
    const savedTask = await newTask.save();

    res.status(201).json({ ...savedTask._doc, title: decrypt(savedTask.title) });
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
    let updateData = { ...req.body };
    if (updateData.title) {
        updateData.title = encrypt(updateData.title);
    }

    const updatedTask = await Task.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.userId },
      updateData,
      { new: true }
    );
    
    res.json({ ...updatedTask._doc, title: decrypt(updatedTask.title) });
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