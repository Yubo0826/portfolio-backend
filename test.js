import { PrismaClient } from '../generated/prisma/index.js';

const prisma = new PrismaClient();

const main = async () => {
  const users = await prisma.users.findMany();
  console.log(users);
};

main();
