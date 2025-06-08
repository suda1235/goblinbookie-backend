import winston from 'winston';
import path from 'path';

const logPath = path.join(__dirname, '../../logs/sync.log');

export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(
      ({ timestamp, level, message }) => `[${timestamp}] ${level.toUpperCase()}: ${message}`
    )
  ),
  transports: [
    new winston.transports.File({ filename: logPath }),
    new winston.transports.Console(),
  ],
});
