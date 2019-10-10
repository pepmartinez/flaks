var winston = require('winston');

module.exports = {
  level: {
    default: 'verbose'
  },
  transports: [
    new winston.transports.Console(),
  ]
};


