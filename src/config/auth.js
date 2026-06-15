import { betterAuth } from 'better-auth';
import bcrypt from 'bcryptjs';
import pool from './database.js';
import config from './index.js';

import { randomUUID } from 'crypto';

export const auth = betterAuth({
  database: pool,
  user: {
    modelName: 'users',
    fields: {
      emailVerified: 'email_verified',
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    },
    additionalFields: {
      role: {
        type: 'string',
        required: false,
        defaultValue: 'visualizador',
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    modelName: 'sessions',
    fields: {
      userId: 'user_id',
      expiresAt: 'expires_at',
      ipAddress: 'ip_address',
      userAgent: 'user_agent',
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    }
  },
  account: {
    modelName: 'accounts',
    fields: {
      userId: 'user_id',
      accountId: 'account_id',
      providerId: 'provider_id',
      accessToken: 'access_token',
      refreshToken: 'refresh_token',
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    }
  },
  verification: {
    modelName: 'verifications',
    fields: {
      expiresAt: 'expires_at',
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    }
  },
  emailAndPassword: {
    enabled: true,
    password: {
      hash: (password) => bcrypt.hash(password, 10),
      verify: ({ password, hash }) => bcrypt.compare(password, hash),
    },
  },

  secret: config.betterAuth.secret,
  baseURL: config.betterAuth.url,
  trustedOrigins: config.allowedOrigins,
  advanced: {
    generateId: () => randomUUID(),
  },
});