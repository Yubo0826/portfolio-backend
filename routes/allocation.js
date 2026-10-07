import express from 'express';
const router = express.Router();

import prisma from '../utils/prisma.js';

// 目標配置的格式檢查，不合法回傳錯誤訊息，合法回傳 null
// 空陣列代表清空；非空時總和要是 100%（容許 0.01 的浮點誤差），symbol 不可重複（DB 有 unique）
export function validateAllocation(assets) {
    if (!Array.isArray(assets)) return 'assets must be an array';
    const seen = new Set();
    for (const a of assets) {
        if (typeof a?.symbol !== 'string' || !/^\S{1,10}$/.test(a.symbol)) return 'symbol must be 1-10 non-blank characters';
        if (seen.has(a.symbol)) return `duplicate symbol ${a.symbol}`;
        seen.add(a.symbol);
        if (!(Number(a.target) >= 0 && Number(a.target) <= 100)) return 'target must be between 0 and 100';
    }
    const total = assets.reduce((sum, a) => sum + Number(a.target), 0);
    if (assets.length && Math.abs(total - 100) > 0.01) return 'targets must add up to 100';
    return null;
}

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
    const { assets, uid } = req.body;
    const portfolio_id = Number(req.body.portfolio_id);

    if (!Number.isInteger(portfolio_id)) {
        return res.status(400).json({ message: 'Missing required fields' });
    }
    const invalid = validateAllocation(assets);
    if (invalid) return res.status(400).json({ message: invalid });


    try {
        if (!await prisma.portfolios.findFirst({ where: { id: portfolio_id, uid } })) {
            return res.status(404).json({ message: 'Portfolio not found' });
        }

        // 刪舊、建新、同步 holdings 在同一個 DB transaction 內，避免目標配置被清空卻沒寫回
        const [, allocations] = await prisma.$transaction([
            // 刪除舊的 allocations
            prisma.allocation.deleteMany({
                where: { uid, portfolio_id },
            }),

            // 新增新的 allocations
            prisma.allocation.createMany({
                data: assets.map(asset => ({
                    uid,
                    portfolio_id,
                    symbol: asset.symbol,
                    name: asset.name,
                    target: asset.target,
                })),
            }),

            // 同步 target 到 holdings
            ...assets.map(asset =>
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
            ),
        ]);

        if (assets.length === 0) {
            return res.status(200).json({ message: 'Clean allocations successfully' });
        }

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