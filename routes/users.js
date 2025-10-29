import express from 'express';
const router = express.Router();
import { checkAllPortfolios } from '../services/portfolioDriftService.js';

// 建立新使用者
router.post('/', async (req, res) => {
  const prisma = req.prisma;
  console.log('Received /api/user data:', req.body);

  try {
    const {
      uid,
      email,
      displayName
    } = req.body;

    if (!uid || !email) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const existingUser = await prisma.users.findUnique({
      where: { uid },
    });

    if (existingUser) {
      return res.status(200).json({ message: 'User already exists' });
    }

    const newUser = await prisma.users.create({
      data: {
        uid,
        email,
        display_name: displayName
      },
    });

    res.status(201).json({ message: 'User created', user: newUser });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// 獲取使用者設定資料
router.get('/settings', async (req, res) => {
  console.log('Received /api/user/settings request with query:', req.query);
  const prisma = req.prisma;
  const { uid } = req.query;

  if (!uid) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    const user = await prisma.users.findUnique({
      where: { uid },
      select: {
        drift_threshold: true
      }
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json({ message: 'User settings retrieved', settings: user });
  } catch (error) {
    console.error('Error retrieving user settings:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// 更改使用者設定
router.put('/settings', async (req, res) => {
  const prisma = req.prisma;
  console.log('Received /api/user/settings data:', req.body);
  try {
    const {
      uid,
      settings: { drift_threshold }
    } = req.body; 
    if (!uid) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    const updatedUser = await prisma.users.update({
      where: { uid },
      data: {
        drift_threshold
      },
    });
    res.status(200).json({ message: 'User settings updated', user: updatedUser });
  } catch (error) {
    console.error('Error updating user settings:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// 寄信測試
router.post('/send-test-email', async (req, res) => {
  const { sendEmail } = await import('../utils/emailService.js');
  const { to } = req.body;

  if (!to) {
    return res.status(400).json({ message: 'Missing recipient email address' });
  }

  try {
    const emailOptions = {
      to,
      subject: 'Test Email',
      text: 'This is a test email sent from the portfolio backend.'
    };
    console.log('Sending test email to:', emailOptions);
    await sendEmail(emailOptions.to, emailOptions.subject, emailOptions.text);
    res.status(200).json({ message: 'Test email sent successfully' });
  } catch (error) {
    console.error('Error sending test email:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// 寄投資組合偏差警示信測試
router.post('/send-drift-alert-test', async (req, res) => {
  try {
    console.log('Sending drift alert test email...');
    await checkAllPortfolios();
    res.status(200).json({ message: 'Drift alert test email sent successfully' });
  } catch (error) {
    console.error('Error sending drift alert test email:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
