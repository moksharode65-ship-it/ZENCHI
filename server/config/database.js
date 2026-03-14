
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: 'c:/Users/Pradnya Rode/OneDrive/Desktop/VS CODE/ZENCHI/data/zenchi-db.json',
});

module.exports = sequelize;
