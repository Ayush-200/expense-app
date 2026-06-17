import jwt from 'jsonwebtoken';
import { config } from '../config/env';

export const generateToken = (payload: { id: string; email: string }): string => {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn as any,
  });
};

export const verifyToken = (token: string): { id: string; email: string } => {
  return jwt.verify(token, config.jwtSecret) as { id: string; email: string };
};
