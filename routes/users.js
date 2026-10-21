import express from 'express';
const router = express.Router();
import { checkAllPortfolios } from '../services/portfolioService.js';
import prisma from '../utils/prisma.js';

// 建立新使用者
router.post('/', async (req, res) => {
  console.log('Received /api/user data:', req.body);

  try {
    const { uid, displayName, portfolioName } = req.body;
    // 只用 token 驗證過的 email；不 fallback 到 body，否則沒 token 時可用任意信箱建帳號、讓提醒信寄給別人
    const email = req.user.email;

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
        display_name: displayName,
        // 新使用者直接帶一個投資組合，登入後就能新增交易，不必先去建立
        portfolios: { create: { name: String(portfolioName || 'My Portfolio').slice(0, 100) } },
      },
    });

    res.status(201).json({ message: 'User created', user: newUser });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// 寄信測試
router.post('/send-test-email', async (req, res) => {
  const { sendEmail } = await import('../utils/emailService.js');
  // 只寄給 token 驗證過的本人信箱，不收 client 指定的收件人（否則就是公開寄信跳板）
  const to = req.user.email;

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
    if (!await sendEmail(emailOptions.to, emailOptions.subject, emailOptions.text)) {
      return res.status(502).json({ message: 'Failed to send test email' });
    }
    res.status(200).json({ message: 'Test email sent successfully' });
  } catch (error) {
    console.error('Error sending test email:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// 寄投資組合偏差警示信測試
router.post('/send-drift-alert-test', async (req, res) => {
  // 會寄信給「所有」使用者，只開放開發環境
  if (process.env.NODE_ENV !== 'development') {
    return res.status(403).json({ message: 'Forbidden' });
  }
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
