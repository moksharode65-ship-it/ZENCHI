
const { User } = require('../models');

async function isAuthenticated(req, res, next) {
  const { session_token } = req.cookies;

  if (!session_token) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  // Find the user by session token
  const user = await User.findOne({ where: { current_session_token: session_token } });

  if (!user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  // Attach the user to the request object
  req.user = user;

  next();
}

module.exports = {
  isAuthenticated,
};
