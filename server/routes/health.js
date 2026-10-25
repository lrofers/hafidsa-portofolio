// GET /api/health — pemeriksaan kesehatan untuk platform hosting (tanpa membuka rahasia).
import { Router } from 'express';
import { contactConfigured, config } from '../config.js';

export const healthRouter = Router();

healthRouter.get('/health', (req, res) => {
  res.set('Cache-Control', 'no-store').json({
    ok: true,
    contactForm: contactConfigured ? (config.serviceKey ? 'service-role' : 'rpc') : 'not-configured',
    time: new Date().toISOString(),
  });
});
