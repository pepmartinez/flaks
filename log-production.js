var winston = require('winston');

module.exports = {
  level: {
    default: 'info'
  },
  transports: [
    new winston.transports.Console(),
  ]
};

