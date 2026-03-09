import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminPassword = process.env.ADMIN_PASSWORD || "admin";
  const hashed = await bcrypt.hash(adminPassword, 10);

  // Branch: find by name (not unique), create if missing, or update address
  const branchName = "Main Branch";
  let branch = await prisma.branch.findFirst({ where: { name: branchName } });
  if (!branch) {
    branch = await prisma.branch.create({
      data: { name: branchName, address: "Main clinic (seeded)" },
    });
  } else {
    branch = await prisma.branch.update({
      where: { id: branch.id },
      data: { address: "Main clinic (seeded)" },
    });
  }

  // Upsert super_admin user admin@mdent.cloud (production admin account)
  const superAdminEmail = "admin@mdent.cloud";
  const superAdminHash = await bcrypt.hash(adminPassword, 10);
  await prisma.user.upsert({
    where: { email: superAdminEmail },
    update: { password: superAdminHash, role: "super_admin", branchId: branch.id },
    create: {
      email: superAdminEmail,
      password: superAdminHash,
      role: "super_admin",
      name: "Super Admin",
      branchId: branch.id,
    },
  });

  // Seed one user for each role (admin, doctor, receptionist, accountant, nurse, manager, xray, sterilization)
  const roles = [
    { email: "admin@mdent.local", role: "admin", password: adminPassword }, // admin password from ENV
    { email: "doctor@mdent.local", role: "doctor", password: "doctor123" },
    {
      email: "receptionist@mdent.local",
      role: "receptionist",
      password: "reception123",
    },
    {
      email: "accountant@mdent.local",
      role: "accountant",
      password: "accountant123",
    },
    { email: "nurse@mdent.local", role: "nurse", password: "nurse123" },
    { email: "manager@mdent.local", role: "manager", password: "manager123" },
    { email: "xray@mdent.local", role: "xray", password: "xray123" },
    {
      email: "sterilization@mdent.local",
      role: "sterilization",
      password: "sterilization123",
    },
  ];

  for (const user of roles) {
    const passwordHash = await bcrypt.hash(user.password, 10);
    await prisma.user.upsert({
      where: { email: user.email },
      update: { password: passwordHash, role: user.role, branchId: branch.id },
      create: {
        email: user.email,
        password: passwordHash,
        role: user.role,
        name: user.role.charAt(0).toUpperCase() + user.role.slice(1),
        branchId: branch.id,
      },
    });
  }

  // Seed Patient: name is not unique, so findFirst + create/update
  const seedPatientName = "Seed Patient";
  const existingPatient = await prisma.patient.findFirst({
    where: { name: seedPatientName, branchId: branch.id },
  });

  let patient;
  if (!existingPatient) {
    patient = await prisma.patient.create({
      data: {
        regNo: "0000000000",
        name: seedPatientName,
        phone: "70000000",
        branchId: branch.id,

        // ✅ fix: Patient relation field is `patientBook`, not `book`
        patientBook: { create: { bookNumber: `BOOK-${Date.now()}` } },
      },
    });
  } else {
    // Ensure the patient has a book
    const existingBook = await prisma.patientBook.findUnique({
      where: { patientId: existingPatient.id },
    });
    if (!existingBook) {
      await prisma.patientBook.create({
        data: {
          patientId: existingPatient.id,
          bookNumber: `BOOK-${Date.now()}`,
        },
      });
    }
    patient = existingPatient;
  }

  console.log("Seed completed:", {
    branch: branch.name,
    superAdmin: superAdminEmail,
    users: roles.map((u) => u.email),
    patient: patient.name,
  });

  // Seed: PREVIOUS marker service for indicating continuation of previous treatment.
  // Doctors add this service to mark an encounter as continuation of prior treatment.
  // Price is 0 so it does not affect totals. Excluded from income calculations.
  const previousMarkerService = await prisma.service.upsert({
    where: { code: "PREVIOUS_MARKER" },
    update: {
      category: "PREVIOUS",
      name: "Өмнөх үзлэгийн үргэлжлэл",
      price: 0,
      isActive: true,
      description:
        "Өмнөх үзлэгийн үргэлжлэлийн тэмдэглэгч үйлчилгээ (үнэ тооцохгүй)",
    },
    create: {
      code: "PREVIOUS_MARKER",
      category: "PREVIOUS",
      name: "Өмнөх үзлэгийн үргэлжлэл",
      price: 0,
      isActive: true,
      description:
        "Өмнөх үзлэгийн үргэлжлэлийн тэмдэглэгч үйлчилгээ (үнэ тооцохгүй)",
    },
  });

  // Link PREVIOUS_MARKER to all branches
  const allBranches = await prisma.branch.findMany({ select: { id: true } });
  await prisma.serviceBranch.createMany({
    data: allBranches.map((b) => ({
      serviceId: previousMarkerService.id,
      branchId: b.id,
    })),
    skipDuplicates: true,
  });

  // Seed: ServiceCategoryConfig defaults (durationMinutes=30) for all categories
  const serviceCategories = [
  "ORTHODONTIC_TREATMENT",
  "IMAGING",
  "DEFECT_CORRECTION",
  "ADULT_TREATMENT",
  "WHITENING",
  "CHILD_TREATMENT",
  "SURGERY",
  "PREVIOUS",
];

  for (const category of serviceCategories) {
    await prisma.serviceCategoryConfig.upsert({
      where: { category },
      update: {},
      create: { category, durationMinutes: 30, isActive: true },
    });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
