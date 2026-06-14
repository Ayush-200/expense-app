import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting seed...');

  const hashedPassword = await bcrypt.hash('password123', 10);

  const users = [
    { name: 'Aisha', email: 'aisha@example.com' },
    { name: 'Rohan', email: 'rohan@example.com' },
    { name: 'Priya', email: 'priya@example.com' },
    { name: 'Meera', email: 'meera@example.com' },
    { name: 'Dev', email: 'dev@example.com' },
    { name: 'Sam', email: 'sam@example.com' },
  ];

  const createdUsers = [];
  for (const userData of users) {
    const user = await prisma.user.upsert({
      where: { email: userData.email },
      update: {},
      create: {
        name: userData.name,
        email: userData.email,
        password: hashedPassword,
      },
    });
    createdUsers.push(user);
    console.log(`Created user: ${user.name} (${user.email})`);
  }

  // Create sample groups
  const group1 = await prisma.group.create({
    data: {
      name: 'Trip to Goa',
      description: 'Beach vacation expenses',
      createdById: createdUsers[0].id, // Aisha
      members: {
        create: [
          { userId: createdUsers[0].id }, // Aisha
          { userId: createdUsers[1].id }, // Rohan
          { userId: createdUsers[2].id }, // Priya
        ],
      },
    },
  });
  console.log(`Created group: ${group1.name}`);

  const group2 = await prisma.group.create({
    data: {
      name: 'Apartment Rent',
      description: 'Monthly rent and utilities',
      createdById: createdUsers[3].id, // Meera
      members: {
        create: [
          { userId: createdUsers[3].id }, // Meera
          { userId: createdUsers[4].id }, // Dev
          { userId: createdUsers[5].id }, // Sam
        ],
      },
    },
  });
  console.log(`Created group: ${group2.name}`);

  console.log('Seed completed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
