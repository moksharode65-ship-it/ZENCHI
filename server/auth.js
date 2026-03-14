
const { User } = require('./models');
const { v4: uuidv4 } = require('uuid');

// Generate a unique device fingerprint
function generateDeviceFingerprint() {
  // In a real application, you would use a more robust method
  // to generate a device fingerprint. This is just a simple example.
  return uuidv4();
}

// Login with Gmail OAuth
async function login(req, res) {
  const { email, device_id } = req.body;

  // Find the user by email
  const user = await User.findOne({ where: { email } });

  if (!user) {
    return res.status(401).json({ message: 'Invalid email or device ID' });
  }

  // Check if the device ID is valid
  if (user.device_id !== device_id) {
    return res.status(401).json({ message: 'This device is already registered with another account.' });
  }

  // Generate a new session token
  const current_session_token = uuidv4();

  // Update the user's session token
  await user.update({ current_session_token });

  // Set the session token in an HTTP-only cookie
  res.cookie('session_token', current_session_token, {
    httpOnly: true,
    secure: true,
  });

  res.json({ message: 'Logged in successfully' });
}

// Logout
async function logout(req, res) {
  const { session_token } = req.cookies;

  // Find the user by session token
  const user = await User.findOne({ where: { current_session_token: session_token } });

  if (user) {
    // Clear the user's session token
    await user.update({ current_session_token: null });
  }

  // Clear the session token cookie
  res.clearCookie('session_token');

  res.json({ message: 'Logged out successfully' });
}

// Register a new user
async function register(req, res) {
  const { email } = req.body;

  // Check if the user already exists
  const existingUser = await User.findOne({ where: { email } });

  if (existingUser) {
    return res.status(409).json({ message: 'User already exists' });
  }

  // Generate a new device ID
  const device_id = generateDeviceFingerprint();

  // Create a new user
  const user = await User.create({
    email,
    device_id,
  });

  res.json({
    message: 'User registered successfully',
    device_id,
  });
}

module.exports = {
  login,
  logout,
  register,
};
