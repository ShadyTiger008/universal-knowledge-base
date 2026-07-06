import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.upsert({
    where: {
      platform_platformUserId: {
        platform: 'WEB',
        platformUserId: 'shomorichedirji',
      },
    },
    update: {},
    create: {
      id: 'usr_shomorichedirji_001',
      platform: 'WEB',
      platformUserId: 'shomorichedirji',
      name: 'Shomorichedirji',
    },
  });

  console.log('User created:', JSON.stringify(user, null, 2));
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
