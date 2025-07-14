import express from 'express';
const router = express.Router();

import { PrismaClient } from '../generated/prisma/index.js';
const prisma = new PrismaClient();

router.get('/', async (req, res) => {
    try {
        const { uid, portfolio_id } = req.query;
        if (!uid || !portfolio_id) {
            return res.status(400).json({ message: 'Missing required fields' });
        }
        const allocations = await prisma.allocation.findMany({
            where: { uid, portfolio_id: Number(portfolio_id) },
        });
        res.json(allocations);
    } catch (error) {
        console.error('Error fetching allocations:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.post('/', async (req, res) => {
    console.log('Received /api/allocation update request:', req.body);
    const { assets, uid, portfolioId } = req.body;

    if (!assets || !Array.isArray(assets) || assets.length === 0) {
        return res.status(400).json({ message: 'Missing required fields' });
    }

    try {
        // 刪除舊的 allocations
        await prisma.allocation.deleteMany({
            where: { uid, portfolio_id: portfolioId },
        });

        // 新增新的 allocations
        const allocations = await prisma.allocation.createMany({
            data: assets.map(asset => ({
                uid,
                portfolio_id: portfolioId,
                symbol: asset.symbol,
                name: asset.name,
                rate: asset.rate,
            })),
        });

        res.status(200).json({
            message: 'Allocations updated successfully',
            allocations,
        });
    } catch (error) {
        console.error('Error updating allocations:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

export default router;