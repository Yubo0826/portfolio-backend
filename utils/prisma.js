import { PrismaClient } from '../generated/prisma/index.js';

// 全專案共用一個 PrismaClient，避免每個檔案各開一個連線池
export default new PrismaClient();
