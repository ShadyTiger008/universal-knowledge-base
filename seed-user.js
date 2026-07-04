const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

prisma.user.upsert({
  where: {
    platform_platformUserId: { platform: 'WEB', platformUserId: 'shomorichedirji' }
  },
  update: {},
  create: {
    id: 'usr_shomorichedirji_001',
    platform: 'WEB',
    platformUserId: 'shomorichedirji',
    name: 'Shomorichedirji'
  }
}).then(u => {
  console.log('User created:', JSON.stringify(u, null, 2));
  return prisma.$disconnect();
}).catch(e => {
  console.error('Error:', e);
  prisma.$disconnect();
});
