import express from 'express';
const router = express.Router();
import { checkPortfolioDrift } from '../services/portfolioService.js';

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
  const { sendEmail } = await import('../utils/emailService.js');
  const { uid } = req.body;

  if (!uid) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    const prisma = req.prisma;
    const user = await prisma.users.findUnique({
      where: { uid },
    });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    const portfolio = await prisma.portfolios.findFirst({
      where: { uid },
    });
    if (!portfolio) {
      return res.status(404).json({ message: 'Portfolio not found' });
    }
    const drifts = await checkPortfolioDrift(user);
    if (drifts.length === 0) {
      return res.status(200).json({ message: 'No drift detected, no email sent' });
    }
    const html = `
      <h2>投資組合偏差警示 - ${portfolio.name}</h2>
      <p>您的投資組合持股比例與設定值偏差超出閾值</p>
      <table border="1" cellspacing="0" cellpadding="5">
        <tr><th>標的</th><th>實際配置</th><th>目標配置</th><th>偏差</th></tr>
        ${drifts.map(d => `
          <tr>
            <td>${d.symbol}</td>
            <td>${d.actual}</td>
            <td>${d.target}</td>
            <td>${d.deviation}</td>
          </tr>`).join('')}
      </table>
      <p style="margin-top:10px;">請考慮進行再平衡或調整持倉。</p>
    `;

    await sendEmail(user.email, `【Stockbar】投資組合 ${portfolio.name} 偏差超出閾值通知（測試信）`, html);
    res.status(200).json({ message: 'Drift alert test email sent successfully' });
  } catch (error) {
    console.error('Error sending drift alert test email:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
