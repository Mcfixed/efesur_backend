import { betterAuth } from 'better-auth';
import bcrypt from 'bcryptjs';
import pool from './database.js';
import config from './index.js';
import { log } from '../services/audit.service.js';

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
      phone_call: {
        type: 'string',
        required: false,
      },
      phone_whatsapp: {
        type: 'string',
        required: false,
      },
      is_active: {
        type: 'boolean',
        required: false,
        defaultValue: true,
      },
      notify_calls: {
        type: 'boolean',
        required: false,
        defaultValue: false,
      },
      notify_whatsapp: {
        type: 'boolean',
        required: false,
        defaultValue: false,
      },
      notify_email: {
        type: 'boolean',
        required: false,
        defaultValue: false,
      },
      notify_email_address: {
        type: 'string',
        required: false,
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
  databaseHooks: {
    session: {
      create: {
        before: async (data) => {
          // Bloquear el login si el usuario está desactivado (is_active = false)
          try {
            const r = await pool.query('SELECT is_active FROM users WHERE id = $1', [data.userId]);
            if (r.rows[0]?.is_active === false) {
              return false; // cancela la creación de la sesión → no puede iniciar sesión
            }
          } catch {}
          return undefined;
        },
        after: async (session) => {
          let userName = null;
          try {
            const res = await pool.query('SELECT name FROM users WHERE id = $1', [session.userId]);
            userName = res.rows[0]?.name || null;
          } catch {}
          log({
            userId: session.userId,
            userName,
            action: 'login',
            details: { sessionId: session.id },
            ip: session.ipAddress,
          });
        },
      },
      delete: {
        after: async (session) => {
          let userName = null;
          try {
            const res = await pool.query('SELECT name FROM users WHERE id = $1', [session.userId]);
            userName = res.rows[0]?.name || null;
          } catch {}
          log({
            userId: session.userId,
            userName,
            action: 'logout',
            details: { sessionId: session.id },
            ip: session.ipAddress,
          });
        },
      },
    },
  },
  advanced: {
    generateId: () => randomUUID(),
  },
});