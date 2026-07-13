import { Router } from 'express';
import { getGpsDevices, sendCommand, getCommands } from '../controllers/chirpstack.controller.js';
import { chirpstackAuth } from '../controllers/chirpstack-auth.controller.js';

const router = Router();

router.post('/auth', chirpstackAuth);
router.get('/commands', getCommands);
router.get('/devices', getGpsDevices);
router.post('/send-command', sendCommand);

export default router;
