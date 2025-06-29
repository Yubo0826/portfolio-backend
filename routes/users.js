import express from 'express';
const router = express.Router();

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

export default router;
