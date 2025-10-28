import express from 'express';
const router = express.Router();

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

export default router;
