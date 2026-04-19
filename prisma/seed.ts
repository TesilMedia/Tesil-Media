import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding Tesil Media…");

  await prisma.liveStream.deleteMany();
  await prisma.video.deleteMany();
  await prisma.channel.deleteMany();
  await prisma.user.deleteMany();

  const demoPassword = await bcrypt.hash("password123", 10);

  await prisma.user.create({
    data: {
      email: "becknerd@tesil.media",
      name: "becknerd",
      hashedPassword: demoPassword,
    },
  });

  console.log("Seed complete.");
  console.log("Demo login: becknerd@tesil.media / password123");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
