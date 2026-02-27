const express = require("express");
const { PrismaClient } = require("@prisma/client");
const cors = require("cors");

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

app.post("/identify", async (req, res) => {
  const { email, phoneNumber } = req.body;

  if (!email && !phoneNumber) {
    return res.status(400).json({
      message: "Email or phoneNumber required",
    });
  }

  try {
    // 1️⃣ Find direct matches
    const directMatches = await prisma.contact.findMany({
      where: {
        OR: [
          email ? { email } : undefined,
          phoneNumber ? { phoneNumber } : undefined,
        ].filter(Boolean),
      },
    });

    // 2️⃣ No matches → create primary
    if (directMatches.length === 0) {
      const newContact = await prisma.contact.create({
        data: {
          email: email || null,
          phoneNumber: phoneNumber || null,
          linkPrecedence: "primary",
        },
      });

      return res.json({
        contact: {
          primaryContatctId: newContact.id,
          emails: email ? [email] : [],
          phoneNumbers: phoneNumber ? [phoneNumber] : [],
          secondaryContactIds: [],
        },
      });
    }

    // 3️⃣ Collect all primary IDs
    const primaryIds = new Set();

    for (let contact of directMatches) {
      if (contact.linkPrecedence === "primary") {
        primaryIds.add(contact.id);
      } else if (contact.linkedId) {
        primaryIds.add(contact.linkedId);
      }
    }

    // 4️⃣ Fetch full cluster
    const allRelated = await prisma.contact.findMany({
      where: {
        OR: [
          { id: { in: Array.from(primaryIds) } },
          { linkedId: { in: Array.from(primaryIds) } },
        ],
      },
    });

    // 5️⃣ Determine oldest PRIMARY only
    const primaryContacts = allRelated.filter(
      c => c.linkPrecedence === "primary"
    );

    let primary = primaryContacts.reduce((oldest, current) =>
      oldest.id < current.id ? oldest : current
    );

    // 6️⃣ Convert other primaries to secondary
    for (let contact of primaryContacts) {
      if (contact.id !== primary.id) {
        await prisma.contact.update({
          where: { id: contact.id },
          data: {
            linkPrecedence: "secondary",
            linkedId: primary.id,
          },
        });
      }
    }

    // 7️⃣ Refresh cluster after merge
    const updatedCluster = await prisma.contact.findMany({
      where: {
        OR: [
          { id: primary.id },
          { linkedId: primary.id },
        ],
      },
    });

    const existingEmails = updatedCluster.map(c => c.email);
    const existingPhones = updatedCluster.map(c => c.phoneNumber);

    const isNewEmail = email && !existingEmails.includes(email);
    const isNewPhone = phoneNumber && !existingPhones.includes(phoneNumber);

    // 8️⃣ Create secondary ONLY if new info
    if (isNewEmail || isNewPhone) {
      await prisma.contact.create({
        data: {
          email: email || null,
          phoneNumber: phoneNumber || null,
          linkedId: primary.id,
          linkPrecedence: "secondary",
        },
      });
    }

    // 9️⃣ Final cluster
    const finalCluster = await prisma.contact.findMany({
      where: {
        OR: [
          { id: primary.id },
          { linkedId: primary.id },
        ],
      },
    });

    const emails = [
      ...new Set(finalCluster.map(c => c.email).filter(Boolean)),
    ];

    const phoneNumbers = [
      ...new Set(finalCluster.map(c => c.phoneNumber).filter(Boolean)),
    ];

    const secondaryIds = finalCluster
      .filter(c => c.linkPrecedence === "secondary")
      .map(c => c.id);

    return res.json({
      contact: {
        primaryContatctId: primary.id,
        emails,
        phoneNumbers,
        secondaryContactIds: secondaryIds,
      },
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: "Internal Server Error",
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Graceful shutdown (important for Railway)
process.on("SIGTERM", async () => {
  await prisma.$disconnect();
  process.exit(0);
});