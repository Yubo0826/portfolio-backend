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
        allocations.forEach(allocation => {
            allocation.target = parseFloat(allocation.target.toFixed(2)); // 確保 target 精度為兩位小數
        });
        res.json(allocations);
    } catch (error) {
        console.error('Error fetching allocations:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.post('/', async (req, res) => {
    console.log('Received /api/allocation update request:', req.body);
    const { assets, uid, portfolio_id } = req.body;

    if (!assets || !Array.isArray(assets)) {
        return res.status(400).json({ message: 'Missing required fields' });
    }


    try {
        // 刪除舊的 allocations
        await prisma.allocation.deleteMany({
            where: { uid, portfolio_id },
        });

        if (assets.length === 0) {
            return res.status(200).json({ message: 'Clean allocations successfully' });
        }

        // 新增新的 allocations
        const allocations = await prisma.allocation.createMany({
            data: assets.map(asset => ({
                uid,
                portfolio_id,
                symbol: asset.symbol,
                name: asset.name,
                target: asset.target,
            })),
        });

        // 同步 target 到 holdings
        await Promise.all(assets.map(asset =>
            prisma.holdings.updateMany({
                where: {
                    uid,
                    portfolio_id,
                    symbol: asset.symbol,
                },
                data: {
                    target_percentage: asset.target,
                },
            })
        ));

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