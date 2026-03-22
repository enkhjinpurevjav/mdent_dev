import express from "express";
import prisma from "../db.js";

const router = express.Router();


function parseYmdToLocalMidnight(ymd) {
  const [y, m, d] = String(ymd || "").split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function isValidHHmm(s) {
  return /^\d{2}:\d{2}$/.test(String(s || ""));
}
/**
 * Helper: build minimal unique prefix for each branch.
 * Example:
 *  - Maral -> M (if no other branch starts with M)
 *  - Maral + Mandakh -> MA and MN (2 letters, may expand if needed)
 */
function computeBranchPrefixes(branches) {
  const normalized = branches.map((b) => ({
    id: b.id,
    name: String(b.name || "").trim(),
    upper: String(b.name || "").trim().toUpperCase(),
  }));

  // start with 1 letter, expand until unique for all
  const prefixes = {};
  let len = 1;

  while (len <= 10) {
    const used = new Map(); // prefix -> branchId
    let ok = true;

    for (const b of normalized) {
      const p = b.upper.slice(0, Math.min(len, b.upper.length || 1));
      if (!p) continue;

      if (used.has(p) && used.get(p) !== b.id) {
        ok = false;
      } else {
        used.set(p, b.id);
      }
    }

    if (ok) {
      for (const b of normalized) {
        const p = b.upper.slice(0, Math.min(len, b.upper.length || 1));
        prefixes[b.id] = p || "X";
      }
      return prefixes;
    }

    len += 1;
  }

  // fallback
  for (const b of normalized) prefixes[b.id] = (b.upper.slice(0, 3) || "X");
  return prefixes;
}

// GET nurses (specialists)
router.get("/sterilization/specialists", async (_req, res) => {
  const users = await prisma.user.findMany({
    where: { role: "nurse" },
    select: { id: true, name: true, ovog: true, email: true, branchId: true },
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });
  res.json(users);
});

// GET branch code prefixes
router.get("/sterilization/branch-prefixes", async (_req, res) => {
  const branches = await prisma.branch.findMany({ select: { id: true, name: true } });
  const prefixes = computeBranchPrefixes(branches);
  res.json(prefixes); // { [branchId]: "M" or "MA" ... }
});

router.get("/sterilization/doctors", async (_req, res) => {
  const users = await prisma.user.findMany({
    where: { role: "doctor" },
    select: { id: true, name: true, ovog: true, email: true, branchId: true },
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });
  res.json(users);
});


router.post("/sterilization/returns", async (req, res) => {
  try {
    const branchId = Number(req.body?.branchId);
    const dateStr = String(req.body?.date || "").trim();
    const time = String(req.body?.time || "").trim();
    const doctorId = Number(req.body?.doctorId);
    const nurseName = String(req.body?.nurseName || "").trim();
    const notes = req.body?.notes ? String(req.body.notes).trim() : null;

    const lines = Array.isArray(req.body?.lines) ? req.body.lines : [];

    if (!branchId) return res.status(400).json({ error: "branchId is required" });

    const date = parseYmdToLocalMidnight(dateStr);
    if (!date) return res.status(400).json({ error: "date is required (YYYY-MM-DD)" });

    if (!isValidHHmm(time)) return res.status(400).json({ error: "time is required (HH:mm)" });

    if (!doctorId) return res.status(400).json({ error: "doctorId is required" });
    if (!nurseName) return res.status(400).json({ error: "nurseName is required" });

    if (lines.length === 0) {
      return res.status(400).json({ error: "lines are required" });
    }

    // Validate doctor exists and is doctor
    const doctor = await prisma.user.findUnique({ where: { id: doctorId }, select: { id: true, role: true } });
    if (!doctor || doctor.role !== "doctor") {
      return res.status(400).json({ error: "Invalid doctorId" });
    }

    // Keep only qty>0 (your requirement)
    const normalized = [];
    for (const ln of lines) {
      const toolId = Number(ln?.toolId);
      const returnedQty = Number(ln?.returnedQty);

      if (!toolId || !Number.isInteger(returnedQty) || returnedQty < 0) {
        return res.status(400).json({ error: "Each line must have valid toolId and returnedQty >= 0 integer" });
      }
      if (returnedQty > 0) normalized.push({ toolId, returnedQty });
    }

    if (normalized.length === 0) {
      return res.status(400).json({ error: "At least one returnedQty must be > 0" });
    }

    // Ensure tools belong to branch (SterilizationItem is branch-scoped)
    const toolIds = [...new Set(normalized.map((x) => x.toolId))];
    const tools = await prisma.sterilizationItem.findMany({
      where: { id: { in: toolIds } },
      select: { id: true, branchId: true },
    });

    if (tools.length !== toolIds.length) {
      return res.status(400).json({ error: "One or more toolId is invalid" });
    }
    if (tools.some((t) => t.branchId !== branchId)) {
      return res.status(400).json({ error: "All tools must belong to the selected branch" });
    }

    const created = await prisma.sterilizationReturn.create({
      data: {
        branchId,
        date,
        time,
        doctorId,
        nurseName,
        notes,
        lines: {
          create: normalized.map((x) => ({
            toolId: x.toolId,
            returnedQty: x.returnedQty,
          })),
        },
      },
      include: {
        branch: { select: { id: true, name: true } },
        doctor: { select: { id: true, name: true, ovog: true, email: true } },
        lines: { include: { tool: { select: { id: true, name: true } } } },
      },
    });

    res.json(created);
  } catch (err) {
    console.error("POST /api/sterilization/returns error:", err);
    return res.status(500).json({ error: "Failed to create return record" });
  }
});

router.get("/sterilization/returns", async (req, res) => {
  try {
    const branchId = req.query.branchId ? Number(req.query.branchId) : null;
    const fromStr = req.query.from ? String(req.query.from) : "";
    const toStr = req.query.to ? String(req.query.to) : "";
    const doctorId = req.query.doctorId ? Number(req.query.doctorId) : null;

    if (!branchId) return res.status(400).json({ error: "branchId is required" });

    let rangeStart = null;
    let rangeEnd = null;

    if (fromStr) {
      rangeStart = parseYmdToLocalMidnight(fromStr);
      if (!rangeStart) return res.status(400).json({ error: "from is invalid (YYYY-MM-DD)" });
    }
    if (toStr) {
      const toMid = parseYmdToLocalMidnight(toStr);
      if (!toMid) return res.status(400).json({ error: "to is invalid (YYYY-MM-DD)" });
      rangeEnd = new Date(toMid.getFullYear(), toMid.getMonth(), toMid.getDate(), 23, 59, 59, 999);
    }

    const where = {
      branchId,
      ...(doctorId ? { doctorId } : {}),
      ...(rangeStart || rangeEnd
        ? {
            date: {
              ...(rangeStart ? { gte: rangeStart } : {}),
              ...(rangeEnd ? { lte: rangeEnd } : {}),
            },
          }
        : {}),
    };

    const rows = await prisma.sterilizationReturn.findMany({
      where,
      orderBy: [{ date: "desc" }, { id: "desc" }],
      include: {
        branch: { select: { id: true, name: true } },
        doctor: { select: { id: true, name: true, ovog: true, email: true } },
        lines: { include: { tool: { select: { id: true, name: true } } } },
      },
    });

    res.json(rows);
  } catch (err) {
    console.error("GET /api/sterilization/returns error:", err);
    return res.status(500).json({ error: "Failed to list return records" });
  }
});


// POST create indicator
router.post("/sterilization/indicators", async (req, res) => {
  const branchId = Number(req.body?.branchId);
  const packageName = String(req.body?.packageName || "").trim();
  const code = String(req.body?.code || "").trim();
  const specialistUserId = Number(req.body?.specialistUserId);
  const packageQuantity = Number(req.body?.packageQuantity ?? 1);
  const indicatorDateRaw = req.body?.indicatorDate;

  const items = Array.isArray(req.body?.items) ? req.body.items : [];

  if (!branchId) return res.status(400).json({ error: "branchId is required" });
  if (!packageName) return res.status(400).json({ error: "packageName is required" });
  if (!code) return res.status(400).json({ error: "code is required" });
  if (!specialistUserId) return res.status(400).json({ error: "specialistUserId is required" });

  if (!Number.isFinite(packageQuantity) || packageQuantity < 1) {
    return res.status(400).json({ error: "packageQuantity must be >= 1" });
  }

  const indicatorDate = new Date(indicatorDateRaw || "");
  if (Number.isNaN(indicatorDate.getTime())) {
    return res.status(400).json({ error: "indicatorDate is invalid" });
  }

  // items must be item ids
  const itemIds = items.map((x) => Number(x)).filter(Boolean);
  if (itemIds.length === 0) {
    return res.status(400).json({ error: "At least 1 item is required" });
  }

  try {
    const created = await prisma.sterilizationIndicator.create({
      data: {
        branchId,
        packageName, // ✅ REQUIRED FIELD
        code,
        indicatorDate,
        specialistUserId,
        packageQuantity: Math.floor(packageQuantity),
        items: { create: itemIds.map((itemId) => ({ itemId })) },
      },
      include: {
        branch: { select: { id: true, name: true } },
        specialist: { select: { id: true, name: true, ovog: true, email: true } },
        items: { include: { item: true } },
      },
    });
    res.json(created);
  } catch (e) {
    res.status(400).json({ error: "Indicator create failed" });
  }
});

// --- Sterilization settings: Categories ---
// --- Sterilization settings: Items (Branch-Scoped Tool Master) ---
router.get("/sterilization/items", async (req, res) => {
  const branchId = req.query.branchId ? Number(req.query.branchId) : null;
  
  const where = branchId ? { branchId } : {};
  
  const items = await prisma.sterilizationItem.findMany({
    where,
    orderBy: [{ branchId: "asc" }, { name: "asc" }],
    include: {
      branch: { select: { id: true, name: true } },
    },
  });
  res.json(items);
});

router.post("/sterilization/items", async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const branchId = Number(req.body?.branchId);
  const baselineAmountRaw = req.body?.baselineAmount;
  const baselineAmount = baselineAmountRaw === undefined || baselineAmountRaw === null ? 1 : Number(baselineAmountRaw);

  if (!name) return res.status(400).json({ error: "name is required" });
  if (!branchId) return res.status(400).json({ error: "branchId is required" });
  if (!Number.isFinite(baselineAmount) || baselineAmount < 1) {
    return res.status(400).json({ error: "baselineAmount must be >= 1" });
  }

  try {
    const created = await prisma.sterilizationItem.create({
      data: { name, branchId, baselineAmount: Math.floor(baselineAmount) },
      include: {
        branch: { select: { id: true, name: true } },
      },
    });
    res.json(created);
  } catch {
    res.status(400).json({ error: "Item already exists in this branch or invalid" });
  }
});

router.patch("/sterilization/items/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "invalid id" });

  const name = req.body?.name !== undefined ? String(req.body?.name || "").trim() : undefined;
  const baselineAmountRaw = req.body?.baselineAmount;
  const baselineAmount = baselineAmountRaw === undefined ? undefined : Number(baselineAmountRaw);

  if (name !== undefined && !name) return res.status(400).json({ error: "name cannot be empty" });
  if (baselineAmount !== undefined && (!Number.isFinite(baselineAmount) || baselineAmount < 1)) {
    return res.status(400).json({ error: "baselineAmount must be >= 1" });
  }

  try {
    const updated = await prisma.sterilizationItem.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(baselineAmount !== undefined ? { baselineAmount: Math.floor(baselineAmount) } : {}),
      },
      include: {
        branch: { select: { id: true, name: true } },
      },
    });
    res.json(updated);
  } catch {
    res.status(400).json({ error: "Item update failed (possibly duplicate name in branch)" });
  }
});

router.delete("/sterilization/items/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "invalid id" });

  try {
    await prisma.sterilizationItem.delete({ where: { id } });
    res.json({ ok: true });
  } catch (error) {
    // Check if it's a foreign key constraint error (P2003)
    if (error && typeof error === "object" && error.code === "P2003") {
      return res.status(409).json({ 
        error: "Cannot delete this tool as it is referenced by existing indicators, cycles, or other records. Please remove those references first." 
      });
    }
    // For other errors, return a generic error
    res.status(400).json({ error: "Failed to delete item" });
  }
});

// GET active indicators (produced/used/current)
router.get("/sterilization/indicators/active", async (req, res) => {
  const branchId = req.query.branchId ? Number(req.query.branchId) : null;
  const q = String(req.query.q || "").trim().toLowerCase();

  const where = {
    ...(branchId ? { branchId } : {}),
    ...(q
      ? {
          OR: [
            { packageName: { contains: q, mode: "insensitive" } },
            { code: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const indicators = await prisma.sterilizationIndicator.findMany({
    where,
    orderBy: [{ indicatorDate: "desc" }, { id: "desc" }],
    select: {
      id: true,
      branchId: true,
      packageName: true,
      code: true,
      indicatorDate: true,
      packageQuantity: true,
      branch: { select: { id: true, name: true } },
      specialist: { select: { id: true, name: true, ovog: true, email: true } },
      uses: { select: { usedQuantity: true } },
    },
  });

  const rows = indicators
    .map((it) => {
      const used = (it.uses || []).reduce((sum, u) => sum + (u.usedQuantity || 0), 0);
      const produced = it.packageQuantity || 0;
      const current = Math.max(0, produced - used);

      return {
        id: it.id,
        branch: it.branch,
        branchId: it.branchId,
        packageName: it.packageName,
        code: it.code,
        indicatorDate: it.indicatorDate,
        produced,
        used,
        current,
        specialist: it.specialist,
      };
    })
    // Active = current > 0
    .filter((x) => x.current > 0);

  res.json(rows);
});

// GET sterilization report
// /api/sterilization/reports?from=YYYY-MM-DD&to=YYYY-MM-DD&branchId=optional
// - todayCards: ALWAYS today's usage (calendar date) per branch
// - rows: usage summary per indicator within [from..to] (calendar dates) and optional branch filter
router.get("/sterilization/reports", async (req, res) => {
  try {
    const from = String(req.query.from || "");
    const to = String(req.query.to || "");
    const branchIdParam = req.query.branchId ? Number(req.query.branchId) : null;

    if (!from || !to) {
      return res.status(400).json({ error: "from and to are required (YYYY-MM-DD)" });
    }

    const [fy, fm, fd] = from.split("-").map(Number);
    const [ty, tm, td] = to.split("-").map(Number);
    if (!fy || !fm || !fd || !ty || !tm || !td) {
      return res.status(400).json({ error: "invalid date format" });
    }

    // Date range boundaries (calendar dates)
    const rangeStart = new Date(fy, fm - 1, fd, 0, 0, 0, 0);
    const rangeEnd = new Date(ty, tm - 1, td, 23, 59, 59, 999);

    // Today's boundaries (calendar date, server time)
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const todayYmd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
      now.getDate()
    ).padStart(2, "0")}`;

    const branches = await prisma.branch.findMany({
      select: { id: true, name: true },
      orderBy: { id: "asc" },
    });

    const allowedBranchIds = branchIdParam
      ? branches.filter((b) => b.id === branchIdParam).map((b) => b.id)
      : branches.map((b) => b.id);

    // 1) TODAY CARDS: sum usedQuantity per branch where createdAt is today
    const todayUses = await prisma.encounterSterilizationPackageUse.findMany({
      where: {
        createdAt: { gte: todayStart, lte: todayEnd },
        indicator: { branchId: { in: allowedBranchIds } },
      },
      select: {
        usedQuantity: true,
        indicator: { select: { branchId: true } },
      },
    });

    const usedByBranchToday = new Map();
    for (const u of todayUses) {
      const bid = u.indicator?.branchId;
      if (!bid) continue;
      usedByBranchToday.set(bid, (usedByBranchToday.get(bid) || 0) + Number(u.usedQuantity || 0));
    }

    const todayCards = branches
      .filter((b) => allowedBranchIds.includes(b.id))
      .map((b) => ({
        branchId: b.id,
        branchName: b.name,
        usedTotal: usedByBranchToday.get(b.id) || 0,
      }));

    // 2) RANGE ROWS: group by indicator within date range
    const rangeUses = await prisma.encounterSterilizationPackageUse.findMany({
      where: {
        createdAt: { gte: rangeStart, lte: rangeEnd },
        indicator: { branchId: { in: allowedBranchIds } },
      },
      select: {
        usedQuantity: true,
        indicator: {
          select: {
            id: true,
            branchId: true,
            packageName: true,
            code: true,
            indicatorDate: true,
            packageQuantity: true,
            specialist: { select: { id: true, name: true, ovog: true, email: true } },
            branch: { select: { id: true, name: true } },
          },
        },
      },
    });

    const byIndicator = new Map();
    for (const u of rangeUses) {
      const ind = u.indicator;
      if (!ind) continue;

      const key = ind.id;
      const prev =
        byIndicator.get(key) || {
          indicatorId: ind.id,
          branchId: ind.branchId,
          branchName: ind.branch?.name || "",
          packageName: ind.packageName,
          code: ind.code,
          indicatorDate: ind.indicatorDate,
          createdQuantity: ind.packageQuantity || 0,
          usedQuantity: 0,
          specialist: ind.specialist || null,
        };

      prev.usedQuantity += Number(u.usedQuantity || 0);
      byIndicator.set(key, prev);
    }

    const rows = Array.from(byIndicator.values()).sort((a, b) => {
      const ad = new Date(a.indicatorDate).getTime();
      const bd = new Date(b.indicatorDate).getTime();
      return bd - ad;
    });

    return res.json({
      today: todayYmd,
      todayCards,
      from: rangeStart.toISOString(),
      to: rangeEnd.toISOString(),
      rows,
    });
  } catch (err) {
    console.error("GET /api/sterilization/reports error:", err);
    return res.status(500).json({ error: "internal server error" });
  }
});

// ==========================================================
// V1 STERILIZATION: Autoclave Cycles
// ==========================================================

// POST create autoclave cycle with tool lines
router.post("/sterilization/cycles", async (req, res) => {
  try {
    const branchId = Number(req.body?.branchId);
    const code = String(req.body?.code || "").trim();
    const sterilizationRunNumber = req.body?.sterilizationRunNumber ? String(req.body?.sterilizationRunNumber).trim() : null;
    const machineId = req.body?.machineId ? Number(req.body?.machineId) : null;
    const startedAtRaw = req.body?.startedAt;
    
    // Sanitize pressure: keep only digits and spaces, normalize spacing
    let pressure = null;
    if (req.body?.pressure) {
      const pressureStr = String(req.body.pressure).trim();
      if (pressureStr) {
        // First replace hyphens with spaces, then extract only digits and spaces, then normalize multiple spaces to single space
        pressure = pressureStr.replace(/-/g, ' ').replace(/[^\d\s]/g, '').replace(/\s+/g, ' ').trim();
        // If empty after sanitization, set to null
        if (!pressure) pressure = null;
      }
    }
    
    const temperature = req.body?.temperature ? Number(req.body?.temperature) : null;
    const finishedAtRaw = req.body?.finishedAt;
    const removedFromAutoclaveAtRaw = req.body?.removedFromAutoclaveAt;
    const result = String(req.body?.result || "").toUpperCase();
    const operator = String(req.body?.operator || "").trim();
    const notes = req.body?.notes ? String(req.body?.notes).trim() : null;
    const toolLines = Array.isArray(req.body?.toolLines) ? req.body.toolLines : [];

    if (!branchId) return res.status(400).json({ error: "branchId is required" });
    if (!code) return res.status(400).json({ error: "code is required" });
    if (!machineId) return res.status(400).json({ error: "machineId is required" });
    if (!startedAtRaw) return res.status(400).json({ error: "startedAt is required" });
    if (!finishedAtRaw) return res.status(400).json({ error: "finishedAt is required" });
    if (!operator) return res.status(400).json({ error: "operator is required" });
    if (result !== "PASS" && result !== "FAIL") {
      return res.status(400).json({ error: "result must be PASS or FAIL" });
    }
    if (toolLines.length === 0) {
      return res.status(400).json({ error: "At least one tool line is required" });
    }

    // Look up machine to get machineNumber
    const machine = await prisma.autoclaveMachine.findUnique({
      where: { id: machineId },
    });
    if (!machine) {
      return res.status(400).json({ error: "Invalid machineId" });
    }
    if (machine.branchId !== branchId) {
      return res.status(400).json({ error: "Machine does not belong to the selected branch" });
    }
    const machineNumber = machine.machineNumber;

    // Parse dates
    const startedAt = new Date(startedAtRaw);
    if (Number.isNaN(startedAt.getTime())) {
      return res.status(400).json({ error: "startedAt is invalid" });
    }

    const finishedAt = new Date(finishedAtRaw);
    if (Number.isNaN(finishedAt.getTime())) {
      return res.status(400).json({ error: "finishedAt is invalid" });
    }

    // Use finishedAt as completedAt for backward compatibility
    const completedAt = finishedAt;

    const removedFromAutoclaveAt = removedFromAutoclaveAtRaw ? new Date(removedFromAutoclaveAtRaw) : null;
    if (removedFromAutoclaveAt && Number.isNaN(removedFromAutoclaveAt.getTime())) {
      return res.status(400).json({ error: "removedFromAutoclaveAt is invalid" });
    }

    // Validate tool lines
    const validatedLines = [];
    for (const line of toolLines) {
      const toolId = Number(line.toolId);
      const producedQty = Number(line.producedQty);
      
      if (!toolId || !Number.isFinite(producedQty) || producedQty < 1) {
        return res.status(400).json({ error: "Each tool line must have valid toolId and producedQty >= 1" });
      }
      
      validatedLines.push({ toolId, producedQty: Math.floor(producedQty) });
    }

    const cycle = await prisma.autoclaveCycle.create({
      data: {
        branchId,
        code,
        sterilizationRunNumber,
        machineNumber,
        startedAt,
        pressure,
        temperature,
        finishedAt,
        removedFromAutoclaveAt,
        completedAt,
        result,
        operator,
        notes,
        toolLines: {
          create: validatedLines,
        },
      },
      include: {
        branch: { select: { id: true, name: true } },
        toolLines: {
          include: {
            tool: { select: { id: true, name: true, baselineAmount: true } },
          },
        },
      },
    });

    res.json(cycle);
  } catch (err) {
    console.error("POST /api/sterilization/cycles error:", err);
    if (err.code === "P2002") {
      return res.status(400).json({ error: "Cycle code already exists for this branch" });
    }
    return res.status(500).json({ error: "Failed to create cycle" });
  }
});


router.post("/sterilization/disinfection-logs", async (req, res) => {
  try {
    const branchId = Number(req.body?.branchId);
    const dateStr = String(req.body?.date || "").trim();
    const startTime = String(req.body?.startTime || "").trim();
    const endTime = String(req.body?.endTime || "").trim();

    const rinsedWithDistilledWater = req.body?.rinsedWithDistilledWater;
    const driedInUVCabinet = req.body?.driedInUVCabinet;

    const nurseName = String(req.body?.nurseName || "").trim();
    const notes = req.body?.notes ? String(req.body.notes).trim() : null;

    if (!branchId) return res.status(400).json({ error: "branchId is required" });

    const date = parseYmdToLocalMidnight(dateStr);
    if (!date) return res.status(400).json({ error: "date is required (YYYY-MM-DD)" });

    if (!isValidHHmm(startTime)) return res.status(400).json({ error: "startTime is required (HH:mm)" });
    if (!isValidHHmm(endTime)) return res.status(400).json({ error: "endTime is required (HH:mm)" });

    if (typeof rinsedWithDistilledWater !== "boolean") {
      return res.status(400).json({ error: "rinsedWithDistilledWater must be boolean" });
    }
    if (typeof driedInUVCabinet !== "boolean") {
      return res.status(400).json({ error: "driedInUVCabinet must be boolean" });
    }
    if (!nurseName) return res.status(400).json({ error: "nurseName is required" });

    // Qty fields (13)
    const qtyFields = [
      "qtyPolishingRubber",
      "qtyBrush",
      "qtyCup",
      "qtyLine",
      "qtyShoeCutter",
      "qtyPlasticMedicineTray",
      "qtyPlasticSpatula",
      "qtyTongueDepressor",
      "qtyMouthOpener",
      "qtyRootmeterTip",
      "qtyTighteningTip",
      "qtyBurContainer",
      "qtyPlasticSpoon",
    ];

    const qtyData = {};
    let anyPositive = false;

    for (const f of qtyFields) {
      const n = Number(req.body?.[f] ?? 0);
      if (!Number.isInteger(n) || n < 0) {
        return res.status(400).json({ error: `${f} must be an integer >= 0` });
      }
      qtyData[f] = n;
      if (n > 0) anyPositive = true;
    }

    if (!anyPositive) {
      return res.status(400).json({ error: "At least one quantity must be > 0" });
    }

    const created = await prisma.disinfectionLog.create({
      data: {
        branchId,
        date,
        startTime,
        endTime,
        rinsedWithDistilledWater,
        driedInUVCabinet,
        nurseName,
        notes,
        ...qtyData,
      },
      include: {
        branch: { select: { id: true, name: true } },
      },
    });

    res.json(created);
  } catch (err) {
    console.error("POST /api/sterilization/disinfection-logs error:", err);
    return res.status(500).json({ error: "Failed to create disinfection log" });
  }
});


router.get("/sterilization/disinfection-logs", async (req, res) => {
  try {
    const branchId = req.query.branchId ? Number(req.query.branchId) : null;
    const fromStr = req.query.from ? String(req.query.from) : "";
    const toStr = req.query.to ? String(req.query.to) : "";

    if (!branchId) {
      return res.status(400).json({ error: "branchId is required" });
    }

    let rangeStart = null;
    let rangeEnd = null;

    if (fromStr) {
      rangeStart = parseYmdToLocalMidnight(fromStr);
      if (!rangeStart) return res.status(400).json({ error: "from is invalid (YYYY-MM-DD)" });
    }

    if (toStr) {
      const toMidnight = parseYmdToLocalMidnight(toStr);
      if (!toMidnight) return res.status(400).json({ error: "to is invalid (YYYY-MM-DD)" });
      rangeEnd = new Date(toMidnight.getFullYear(), toMidnight.getMonth(), toMidnight.getDate(), 23, 59, 59, 999);
    }

    const where = {
      branchId,
      ...(rangeStart || rangeEnd
        ? {
            date: {
              ...(rangeStart ? { gte: rangeStart } : {}),
              ...(rangeEnd ? { lte: rangeEnd } : {}),
            },
          }
        : {}),
    };

    const rows = await prisma.disinfectionLog.findMany({
      where,
      orderBy: [{ date: "desc" }, { id: "desc" }],
      include: {
        branch: { select: { id: true, name: true } },
      },
    });

    res.json(rows);
  } catch (err) {
    console.error("GET /api/sterilization/disinfection-logs error:", err);
    return res.status(500).json({ error: "Failed to list disinfection logs" });
  }
});



// GET check if cycle code (cycleNumber) exists for a branch
router.get("/sterilization/cycles/check-code", async (req, res) => {
  try {
    const branchId = req.query.branchId ? Number(req.query.branchId) : null;
    const code = req.query.code ? String(req.query.code).trim() : "";
    
    if (!branchId || !code) {
      return res.status(400).json({ error: "branchId and code are required" });
    }
    
    const existing = await prisma.autoclaveCycle.findFirst({
      where: { branchId, code },
      select: { id: true, code: true },
    });
    
    res.json({ exists: !!existing, code });
  } catch (err) {
    console.error("GET /api/sterilization/cycles/check-code error:", err);
    return res.status(500).json({ error: "Failed to check code" });
  }
});

// GET list cycles by branch
router.get("/sterilization/cycles", async (req, res) => {
  try {
    const branchId = req.query.branchId ? Number(req.query.branchId) : null;
    const result = req.query.result ? String(req.query.result).toUpperCase() : null;
    
    const where = {
      ...(branchId ? { branchId } : {}),
      ...(result ? { result } : {}),
    };

    const cycles = await prisma.autoclaveCycle.findMany({
      where,
      orderBy: [{ completedAt: "desc" }, { id: "desc" }],
      include: {
        branch: { select: { id: true, name: true } },
        toolLines: {
          include: {
            tool: { select: { id: true, name: true, baselineAmount: true } },
          },
        },
      },
    });

    res.json(cycles);
  } catch (err) {
    console.error("GET /api/sterilization/cycles error:", err);
    return res.status(500).json({ error: "Failed to list cycles" });
  }
});

// GET active indicators for doctor selection (PASS only, remaining > 0)
router.get("/sterilization/cycles/active-indicators", async (req, res) => {
  try {
    const branchId = req.query.branchId ? Number(req.query.branchId) : null;
    const toolId = req.query.toolId ? Number(req.query.toolId) : null;
    
    if (!branchId) {
      return res.status(400).json({ error: "branchId is required" });
    }

    // Build where clause for cycles
    const cycleWhere = {
      branchId,
      result: "PASS", // Only PASS cycles
      ...(toolId ? { toolLines: { some: { toolId } } } : {}),
    };

    const cycles = await prisma.autoclaveCycle.findMany({
      where: cycleWhere,
      include: {
        toolLines: {
          ...(toolId ? { where: { toolId } } : {}),
          include: {
            tool: { select: { id: true, name: true } },
            finalizedUsages: { select: { usedQty: true } },
          },
        },
      },
      orderBy: [{ completedAt: "desc" }],
    });

    // Compute remaining for each tool line
    const activeLines = [];
    for (const cycle of cycles) {
      for (const line of cycle.toolLines) {
        const produced = line.producedQty || 0;
        const used = (line.finalizedUsages || []).reduce((sum, u) => sum + (u.usedQty || 0), 0);
        const remaining = Math.max(0, produced - used);
        
        if (remaining > 0) {
          activeLines.push({
            cycleId: cycle.id,
            cycleCode: cycle.code,
            machineNumber: cycle.machineNumber,
            completedAt: cycle.completedAt,
            toolLineId: line.id,
            toolId: line.tool.id,
            toolName: line.tool.name,
            produced,
            used,
            remaining,
          });
        }
      }
    }

    res.json(activeLines);
  } catch (err) {
    console.error("GET /api/sterilization/cycles/active-indicators error:", err);
    return res.status(500).json({ error: "Failed to get active indicators" });
  }
});

// ==========================================================
// V1 STERILIZATION: Draft Attachments
// ==========================================================

// POST create draft attachment
router.post("/sterilization/draft-attachments", async (req, res) => {
  try {
    const encounterDiagnosisId = Number(req.body?.encounterDiagnosisId);
    const cycleId = Number(req.body?.cycleId);
    const toolId = Number(req.body?.toolId);
    const requestedQty = Number(req.body?.requestedQty) || 1;

    if (!encounterDiagnosisId) {
      return res.status(400).json({ error: "encounterDiagnosisId is required" });
    }
    if (!cycleId) {
      return res.status(400).json({ error: "cycleId is required" });
    }
    if (!toolId) {
      return res.status(400).json({ error: "toolId is required" });
    }
    if (!Number.isFinite(requestedQty) || requestedQty < 1) {
      return res.status(400).json({ error: "requestedQty must be >= 1" });
    }

    const draft = await prisma.sterilizationDraftAttachment.create({
      data: {
        encounterDiagnosisId,
        cycleId,
        toolId,
        requestedQty: Math.floor(requestedQty),
      },
      include: {
        cycle: {
          select: {
            id: true,
            code: true,
            machineNumber: true,
            completedAt: true,
          },
        },
        tool: { select: { id: true, name: true } },
      },
    });

    res.json(draft);
  } catch (err) {
    console.error("POST /api/sterilization/draft-attachments error:", err);
    return res.status(500).json({ error: "Failed to create draft attachment" });
  }
});

// DELETE remove draft attachment
router.delete("/sterilization/draft-attachments/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "invalid id" });

    await prisma.sterilizationDraftAttachment.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/sterilization/draft-attachments error:", err);
    return res.status(404).json({ error: "Draft attachment not found" });
  }
});

// ==========================================================
// V1 STERILIZATION: Mismatch Management
// ==========================================================

// GET mismatches by encounter
router.get("/sterilization/mismatches", async (req, res) => {
  try {
    const encounterId = req.query.encounterId ? Number(req.query.encounterId) : null;
    const status = req.query.status ? String(req.query.status).toUpperCase() : null;
    
    const where = {
      ...(encounterId ? { encounterId } : {}),
      ...(status ? { status } : {}),
    };

    const mismatches = await prisma.sterilizationMismatch.findMany({
      where,
      include: {
        encounter: {
          select: {
            id: true,
            visitDate: true,
            patientBook: {
              select: {
                patient: { select: { id: true, name: true, ovog: true } },
              },
            },
          },
        },
        branch: { select: { id: true, name: true } },
        tool: { select: { id: true, name: true } },
        adjustments: {
          include: {
            resolvedBy: { select: { id: true, name: true, ovog: true } },
          },
        },
      },
      orderBy: [{ createdAt: "desc" }],
    });

    res.json(mismatches);
  } catch (err) {
    console.error("GET /api/sterilization/mismatches error:", err);
    return res.status(500).json({ error: "Failed to get mismatches" });
  }
});

// POST resolve mismatches for an encounter
router.post("/sterilization/mismatches/:encounterId/resolve", async (req, res) => {
  try {
    const encounterId = Number(req.params.encounterId);
    const resolvedByName = String(req.body?.resolvedByName || "").trim();
    const resolvedByUserId = req.body?.resolvedByUserId ? Number(req.body.resolvedByUserId) : null;
    const note = req.body?.note ? String(req.body.note).trim() : null;

    if (!encounterId) {
      return res.status(400).json({ error: "Invalid encounterId" });
    }
    if (!resolvedByName) {
      return res.status(400).json({ error: "resolvedByName is required" });
    }

    // TODO: Add role checking (nurse, manager, admin only)
    // For now, we'll allow any request with a resolvedByName

    // Get all unresolved mismatches for this encounter
    const unresolvedMismatches = await prisma.sterilizationMismatch.findMany({
      where: {
        encounterId,
        status: "UNRESOLVED",
      },
    });

    if (unresolvedMismatches.length === 0) {
      return res.status(400).json({ error: "No unresolved mismatches for this encounter" });
    }

    // Use transaction to resolve all mismatches
    const result = await prisma.$transaction(async (tx) => {
      const adjustments = [];
      const updatedMismatches = [];

      for (const mismatch of unresolvedMismatches) {
        // Create adjustment consumption
        const adjustment = await tx.sterilizationAdjustmentConsumption.create({
          data: {
            mismatchId: mismatch.id,
            encounterId: mismatch.encounterId,
            branchId: mismatch.branchId,
            toolId: mismatch.toolId,
            code: mismatch.code,
            quantity: mismatch.mismatchQty,
            resolvedByUserId,
            resolvedByName,
            note,
          },
        });
        adjustments.push(adjustment);

        // Mark mismatch as resolved
        const updated = await tx.sterilizationMismatch.update({
          where: { id: mismatch.id },
          data: { status: "RESOLVED" },
        });
        updatedMismatches.push(updated);
      }

      return { adjustments, mismatches: updatedMismatches };
    });

    res.json({
      message: `Resolved ${result.mismatches.length} mismatch(es)`,
      adjustments: result.adjustments,
      mismatches: result.mismatches,
    });
  } catch (err) {
    console.error("POST /api/sterilization/mismatches/:encounterId/resolve error:", err);
    return res.status(500).json({ error: "Failed to resolve mismatches" });
  }
});

// ==========================================================
// AUTOCLAVE MACHINES SETTINGS
// ==========================================================

// GET machines for a branch
router.get("/sterilization/machines", async (req, res) => {
  try {
    const branchId = req.query.branchId ? Number(req.query.branchId) : null;
    
    const where = branchId ? { branchId } : {};
    
    const machines = await prisma.autoclaveMachine.findMany({
      where,
      orderBy: [{ branchId: "asc" }, { machineNumber: "asc" }],
      include: {
        branch: { select: { id: true, name: true } },
      },
    });
    
    res.json(machines);
  } catch (err) {
    console.error("GET /api/sterilization/machines error:", err);
    return res.status(500).json({ error: "Failed to list machines" });
  }
});

// POST create a machine
router.post("/sterilization/machines", async (req, res) => {
  try {
    const branchId = Number(req.body?.branchId);
    const machineNumber = String(req.body?.machineNumber || "").trim();
    const name = req.body?.name ? String(req.body?.name).trim() : null;
    
    if (!branchId) return res.status(400).json({ error: "branchId is required" });
    if (!machineNumber) return res.status(400).json({ error: "machineNumber is required" });
    
    const machine = await prisma.autoclaveMachine.create({
      data: { branchId, machineNumber, name },
      include: {
        branch: { select: { id: true, name: true } },
      },
    });
    
    res.json(machine);
  } catch (err) {
    console.error("POST /api/sterilization/machines error:", err);
    if (err.code === "P2002") {
      return res.status(400).json({ error: "Machine number already exists for this branch" });
    }
    return res.status(500).json({ error: "Failed to create machine" });
  }
});

// PATCH update a machine
router.patch("/sterilization/machines/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "invalid id" });
    
    const machineNumber = req.body?.machineNumber !== undefined 
      ? String(req.body?.machineNumber || "").trim() 
      : undefined;
    const name = req.body?.name !== undefined 
      ? (req.body?.name ? String(req.body?.name).trim() : null)
      : undefined;
    
    if (machineNumber !== undefined && !machineNumber) {
      return res.status(400).json({ error: "machineNumber cannot be empty" });
    }
    
    const updated = await prisma.autoclaveMachine.update({
      where: { id },
      data: {
        ...(machineNumber !== undefined ? { machineNumber } : {}),
        ...(name !== undefined ? { name } : {}),
      },
      include: {
        branch: { select: { id: true, name: true } },
      },
    });
    
    res.json(updated);
  } catch (err) {
    console.error("PATCH /api/sterilization/machines/:id error:", err);
    if (err.code === "P2002") {
      return res.status(400).json({ error: "Machine number already exists for this branch" });
    }
    return res.status(404).json({ error: "Machine not found" });
  }
});

// DELETE a machine
router.delete("/sterilization/machines/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "invalid id" });
    
    await prisma.autoclaveMachine.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/sterilization/machines/:id error:", err);
    return res.status(404).json({ error: "Machine not found" });
  }
});

// ==========================================================
// BUR STERILIZATION CYCLES (Compliance-Only Tracking)
// ==========================================================

// POST create bur sterilization cycle
router.post("/sterilization/bur-cycles", async (req, res) => {
  try {
    const branchId = Number(req.body?.branchId);
    const code = String(req.body?.code || "").trim();
    const sterilizationRunNumber = String(req.body?.sterilizationRunNumber || "").trim();
    const machineId = Number(req.body?.machineId);
    const startedAt = req.body?.startedAt ? new Date(req.body.startedAt) : null;
    // Sanitize pressure: keep only digits and spaces (expected format: "90 230")
    const pressure = String(req.body?.pressure || "").trim().replace(/[^\d\s]/g, "");
    const temperature = req.body?.temperature ? Number(req.body.temperature) : null;
    const finishedAt = req.body?.finishedAt ? new Date(req.body.finishedAt) : null;
    const removedFromAutoclaveAt = req.body?.removedFromAutoclaveAt ? new Date(req.body.removedFromAutoclaveAt) : null;
    const result = String(req.body?.result || "").trim();
    const operator = String(req.body?.operator || "").trim();
    const notes = req.body?.notes ? String(req.body.notes).trim() : null;
    const fastBurQty = Number(req.body?.fastBurQty) || 0;
    const slowBurQty = Number(req.body?.slowBurQty) || 0;

    // Validation
    if (!branchId) return res.status(400).json({ error: "branchId is required" });
    if (!code) return res.status(400).json({ error: "code is required" });
    if (!sterilizationRunNumber) return res.status(400).json({ error: "sterilizationRunNumber is required" });
    if (!machineId) return res.status(400).json({ error: "machineId is required" });
    if (!startedAt || isNaN(startedAt.getTime())) return res.status(400).json({ error: "startedAt is required and must be valid" });
    if (!finishedAt || isNaN(finishedAt.getTime())) return res.status(400).json({ error: "finishedAt is required and must be valid" });
    if (!result || !["PASS", "FAIL"].includes(result)) return res.status(400).json({ error: "result must be PASS or FAIL" });
    if (!operator) return res.status(400).json({ error: "operator is required" });

    // Check fastBurQty and slowBurQty
    if (!Number.isInteger(fastBurQty) || fastBurQty < 0) {
      return res.status(400).json({ error: "fastBurQty must be >= 0" });
    }
    if (!Number.isInteger(slowBurQty) || slowBurQty < 0) {
      return res.status(400).json({ error: "slowBurQty must be >= 0" });
    }
    if (fastBurQty === 0 && slowBurQty === 0) {
      return res.status(400).json({ error: "At least one of fastBurQty or slowBurQty must be > 0" });
    }

    const burCycle = await prisma.burSterilizationCycle.create({
      data: {
        branchId,
        code,
        sterilizationRunNumber,
        machineId,
        startedAt,
        pressure: pressure || null,
        temperature,
        finishedAt,
        removedFromAutoclaveAt,
        result,
        operator,
        notes,
        fastBurQty,
        slowBurQty,
      },
      include: {
        branch: { select: { id: true, name: true } },
      },
    });

    res.json(burCycle);
  } catch (err) {
    console.error("POST /api/sterilization/bur-cycles error:", err);
    if (err.code === "P2002") {
      const target = err.meta?.target || [];
      if (target.includes("code")) {
        return res.status(409).json({ error: "Cycle code already exists for this branch" });
      }
      if (target.includes("sterilizationRunNumber")) {
        return res.status(409).json({ error: "Sterilization run number already exists for this machine" });
      }
      return res.status(409).json({ error: "Unique constraint violation" });
    }
    return res.status(500).json({ error: "Failed to create bur sterilization cycle" });
  }
});

// GET list bur cycles (with date range filter)
router.get("/sterilization/bur-cycles", async (req, res) => {
  try {
      const branchId = req.query.branchId ? Number(req.query.branchId) : null;

    const fromStr = req.query.from ? String(req.query.from) : "";
    const toStr = req.query.to ? String(req.query.to) : "";

    let rangeStart = null;
    let rangeEnd = null;

    if (fromStr) {
      const [fy, fm, fd] = fromStr.split("-").map(Number);
      if (fy && fm && fd) rangeStart = new Date(fy, fm - 1, fd, 0, 0, 0, 0);
    }

    if (toStr) {
      const [ty, tm, td] = toStr.split("-").map(Number);
      if (ty && tm && td) rangeEnd = new Date(ty, tm - 1, td, 23, 59, 59, 999);
    }

    const where = {
      ...(branchId ? { branchId } : {}),
      ...(rangeStart || rangeEnd
        ? {
            startedAt: {
              ...(rangeStart ? { gte: rangeStart } : {}),
              ...(rangeEnd ? { lte: rangeEnd } : {}),
            },
          }
        : {}),
    };

    const burCycles = await prisma.burSterilizationCycle.findMany({
      where,
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      include: {
        branch: { select: { id: true, name: true } },
      },
    });

    // Fetch machine details for each cycle
    const machineIds = [...new Set(burCycles.map(c => c.machineId))];
    const machines = await prisma.autoclaveMachine.findMany({
      where: { id: { in: machineIds } },
      select: { id: true, machineNumber: true, name: true },
    });

    const machineMap = new Map(machines.map(m => [m.id, m]));

    // Enrich cycles with machine details
    const enrichedCycles = burCycles.map(cycle => ({
      ...cycle,
      machine: machineMap.get(cycle.machineId) || null,
    }));

    res.json(enrichedCycles);
  } catch (err) {
    console.error("GET /api/sterilization/bur-cycles error:", err);
    return res.status(500).json({ error: "Failed to retrieve bur cycles" });
  }
});

// GET check if cycle code exists for a branch
router.get("/sterilization/bur-cycles/check-code", async (req, res) => {
  try {
    const branchId = req.query.branchId ? Number(req.query.branchId) : null;
    const code = req.query.code ? String(req.query.code).trim() : "";

    if (!branchId || !code) {
      return res.status(400).json({ error: "branchId and code are required" });
    }

    const existing = await prisma.burSterilizationCycle.findFirst({
      where: { branchId, code },
      select: { id: true, code: true },
    });

    res.json({ exists: !!existing, code });
  } catch (err) {
    console.error("GET /api/sterilization/bur-cycles/check-code error:", err);
    return res.status(500).json({ error: "Failed to check code" });
  }
});

// GET check if sterilization run number exists for a machine
router.get("/sterilization/bur-cycles/check-run-number", async (req, res) => {
  try {
    const machineId = req.query.machineId ? Number(req.query.machineId) : null;
    const sterilizationRunNumber = req.query.sterilizationRunNumber ? String(req.query.sterilizationRunNumber).trim() : "";

    if (!machineId || !sterilizationRunNumber) {
      return res.status(400).json({ error: "machineId and sterilizationRunNumber are required" });
    }

    const existing = await prisma.burSterilizationCycle.findFirst({
      where: { machineId, sterilizationRunNumber },
      select: { id: true, sterilizationRunNumber: true },
    });

    res.json({ exists: !!existing, sterilizationRunNumber });
  } catch (err) {
    console.error("GET /api/sterilization/bur-cycles/check-run-number error:", err);
    return res.status(500).json({ error: "Failed to check run number" });
  }
});

// ==========================================================
// ACTIVE CYCLES & DISPOSAL ENDPOINTS
// ==========================================================

// GET active cycles report (PASS only, remaining > 0)
// Query params: branchId (required)
router.get("/sterilization/active-cycles", async (req, res) => {
  try {
    const branchId = req.query.branchId ? Number(req.query.branchId) : null;
    
    if (!branchId) {
      return res.status(400).json({ error: "branchId is required" });
    }

    // Today's boundaries (calendar date, server time)
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    // 1) TODAY CARDS: sum SterilizationFinalizedUsage.usedQty per branch where encounter.visitDate is today
    // Get all branches for cards
    const branches = await prisma.branch.findMany({
      select: { id: true, name: true },
      orderBy: { id: "asc" },
    });

    // Get today's usages grouped by branch
    const todayUsages = await prisma.sterilizationFinalizedUsage.groupBy({
      by: ["toolLineId"],
      _sum: { usedQty: true },
      where: {
        encounter: {
          visitDate: { gte: todayStart, lte: todayEnd },
        },
      },
    });

    // Map toolLineId -> total used
    const usedByToolLine = new Map();
    for (const u of todayUsages) {
      usedByToolLine.set(u.toolLineId, u._sum.usedQty || 0);
    }

    // Get tool lines with their cycles to map to branches
    const toolLines = await prisma.autoclaveCycleToolLine.findMany({
      where: {
        id: { in: Array.from(usedByToolLine.keys()) },
      },
      select: {
        id: true,
        cycle: { select: { branchId: true } },
      },
    });

    // Sum by branch
    const usedByBranchToday = new Map();
    for (const line of toolLines) {
      const bid = line.cycle.branchId;
      const qty = usedByToolLine.get(line.id) || 0;
      usedByBranchToday.set(bid, (usedByBranchToday.get(bid) || 0) + qty);
    }

    const todayCards = branches.map((b) => ({
      branchId: b.id,
      branchName: b.name,
      usedTotal: usedByBranchToday.get(b.id) || 0,
    }));

    // 2) ACTIVE CYCLES: PASS only, with remaining > 0, for selected branch
    const cycles = await prisma.autoclaveCycle.findMany({
      where: {
        branchId,
        result: "PASS",
      },
      include: {
        branch: { select: { id: true, name: true } },
        toolLines: {
          include: {
            tool: { select: { id: true, name: true, baselineAmount: true } },
            finalizedUsages: { select: { usedQty: true } },
            disposalLines: { select: { quantity: true } },
          },
        },
      },
      orderBy: [{ completedAt: "desc" }],
    });

    // Filter cycles with at least one active tool line (remaining > 0)
    const activeCycles = [];
    for (const cycle of cycles) {
      const toolLinesData = [];
      let cycleProduced = 0;
      let cycleUsed = 0;
      let cycleDisposed = 0;
      let cycleRemaining = 0;

      for (const line of cycle.toolLines) {
        const produced = line.producedQty || 0;
        const used = (line.finalizedUsages || []).reduce((sum, u) => sum + (u.usedQty || 0), 0);
        const disposed = (line.disposalLines || []).reduce((sum, d) => sum + (d.quantity || 0), 0);
        const remaining = Math.max(0, produced - used - disposed);

        cycleProduced += produced;
        cycleUsed += used;
        cycleDisposed += disposed;
        cycleRemaining += remaining;

        toolLinesData.push({
          toolLineId: line.id,
          toolId: line.tool.id,
          toolName: line.tool.name,
          produced,
          used,
          disposed,
          remaining,
        });
      }

      // Include cycle if any tool line has remaining > 0
      if (cycleRemaining > 0) {
        activeCycles.push({
          cycleId: cycle.id,
          branchId: cycle.branchId,
          branchName: cycle.branch.name,
          code: cycle.code,
          machineNumber: cycle.machineNumber,
          completedAt: cycle.completedAt,
          operator: cycle.operator,
          result: cycle.result,
          notes: cycle.notes,
          totals: {
            produced: cycleProduced,
            used: cycleUsed,
            disposed: cycleDisposed,
            remaining: cycleRemaining,
          },
          toolLines: toolLinesData,
        });
      }
    }

    res.json({
      todayCards,
      activeCycles,
    });
  } catch (err) {
    console.error("GET /api/sterilization/active-cycles error:", err);
    return res.status(500).json({ error: "Failed to load active cycles" });
  }
});

// POST create disposal
// Body: { branchId, disposedAt, disposedByName, reason?, notes?, lines: [{ toolLineId, quantity }] }
router.post("/sterilization/disposals", async (req, res) => {
  try {
    const branchId = Number(req.body?.branchId);
    const disposedAt = req.body?.disposedAt ? new Date(req.body.disposedAt) : new Date();
    const disposedByName = String(req.body?.disposedByName || "").trim();
    const reason = req.body?.reason ? String(req.body.reason).trim() : null;
    const notes = req.body?.notes ? String(req.body.notes).trim() : null;
    const lines = Array.isArray(req.body?.lines) ? req.body.lines : [];

    if (!branchId) {
      return res.status(400).json({ error: "branchId is required" });
    }
    if (!disposedByName) {
      return res.status(400).json({ error: "disposedByName is required" });
    }
    if (lines.length === 0) {
      return res.status(400).json({ error: "At least one disposal line is required" });
    }

    // Validate each line
    for (const line of lines) {
      const toolLineId = Number(line.toolLineId);
      const quantity = Number(line.quantity);

      if (!toolLineId || !quantity || quantity <= 0) {
        return res.status(400).json({ error: "Invalid line: toolLineId and quantity must be positive" });
      }

      // Check remaining availability
      const toolLine = await prisma.autoclaveCycleToolLine.findUnique({
        where: { id: toolLineId },
        include: {
          finalizedUsages: { select: { usedQty: true } },
          disposalLines: { select: { quantity: true } },
        },
      });

      if (!toolLine) {
        return res.status(400).json({ error: `Tool line ${toolLineId} not found` });
      }

      const produced = toolLine.producedQty || 0;
      const used = (toolLine.finalizedUsages || []).reduce((sum, u) => sum + (u.usedQty || 0), 0);
      const disposed = (toolLine.disposalLines || []).reduce((sum, d) => sum + (d.quantity || 0), 0);
      const remaining = Math.max(0, produced - used - disposed);

      if (quantity > remaining) {
        return res.status(400).json({
          error: `Disposal quantity ${quantity} exceeds remaining ${remaining} for tool line ${toolLineId}`,
        });
      }
    }

    // Create disposal with lines in a transaction
    const disposal = await prisma.sterilizationDisposal.create({
      data: {
        branchId,
        disposedAt,
        disposedByName,
        reason,
        notes,
        lines: {
          create: lines.map((line) => ({
            toolLineId: Number(line.toolLineId),
            quantity: Number(line.quantity),
          })),
        },
      },
      include: {
        branch: { select: { id: true, name: true } },
        lines: {
          include: {
            toolLine: {
              include: {
                tool: { select: { id: true, name: true } },
                cycle: { select: { id: true, code: true } },
              },
            },
          },
        },
      },
    });

    res.json(disposal);
  } catch (err) {
    console.error("POST /api/sterilization/disposals error:", err);
    return res.status(500).json({ error: "Failed to create disposal" });
  }
});

// GET disposal history
// Query params: branchId (required), from (optional YYYY-MM-DD), to (optional YYYY-MM-DD)
router.get("/sterilization/disposals", async (req, res) => {
  try {
    const branchId = req.query.branchId ? Number(req.query.branchId) : null;
    const from = String(req.query.from || "");
    const to = String(req.query.to || "");

    if (!branchId) {
      return res.status(400).json({ error: "branchId is required" });
    }

    const where = { branchId };

    // Optional date range filter
    if (from && to) {
      const [fy, fm, fd] = from.split("-").map(Number);
      const [ty, tm, td] = to.split("-").map(Number);
      
      if (fy && fm && fd && ty && tm && td) {
        const rangeStart = new Date(fy, fm - 1, fd, 0, 0, 0, 0);
        const rangeEnd = new Date(ty, tm - 1, td, 23, 59, 59, 999);
        where.disposedAt = { gte: rangeStart, lte: rangeEnd };
      }
    }

    const disposals = await prisma.sterilizationDisposal.findMany({
      where,
      orderBy: { disposedAt: "desc" },
      include: {
        branch: { select: { id: true, name: true } },
        lines: {
          include: {
            toolLine: {
              include: {
                tool: { select: { id: true, name: true } },
                cycle: { select: { id: true, code: true, machineNumber: true } },
              },
            },
          },
        },
      },
    });

    // Add total quantity per disposal
    const result = disposals.map((d) => ({
      ...d,
      totalQuantity: d.lines.reduce((sum, line) => sum + (line.quantity || 0), 0),
    }));

    res.json(result);
  } catch (err) {
    console.error("GET /api/sterilization/disposals error:", err);
    return res.status(500).json({ error: "Failed to load disposals" });
  }
});

/**
 * POST /api/sterilization/draft-attachments
 * Create or increment a draft attachment for a diagnosis row
 * Body: { encounterDiagnosisId, toolLineId }
 */
router.post("/sterilization/draft-attachments", async (req, res) => {
  try {
    const encounterDiagnosisId = Number(req.body?.encounterDiagnosisId);
    const toolLineId = Number(req.body?.toolLineId);

    if (!encounterDiagnosisId || !toolLineId) {
      return res.status(400).json({ error: "encounterDiagnosisId and toolLineId are required" });
    }

    // Verify diagnosis exists
    const diagnosis = await prisma.encounterDiagnosis.findUnique({
      where: { id: encounterDiagnosisId },
    });
    if (!diagnosis) {
      return res.status(404).json({ error: "Encounter diagnosis not found" });
    }

    // Get tool line to extract cycleId and toolId
    const toolLine = await prisma.autoclaveCycleToolLine.findUnique({
      where: { id: toolLineId },
      select: { cycleId: true, toolId: true },
    });
    if (!toolLine) {
      return res.status(404).json({ error: "Tool line not found" });
    }

    // Check if a draft already exists for this diagnosis + cycle + tool
    const existing = await prisma.sterilizationDraftAttachment.findFirst({
      where: {
        encounterDiagnosisId,
        cycleId: toolLine.cycleId,
        toolId: toolLine.toolId,
      },
    });

    if (existing) {
      // Increment requestedQty
      const updated = await prisma.sterilizationDraftAttachment.update({
        where: { id: existing.id },
        data: { requestedQty: existing.requestedQty + 1 },
        include: {
          cycle: { select: { id: true, code: true } },
          tool: { select: { id: true, name: true } },
        },
      });
      return res.json(updated);
    }

    // Create new draft
    const draft = await prisma.sterilizationDraftAttachment.create({
      data: {
        encounterDiagnosisId,
        cycleId: toolLine.cycleId,
        toolId: toolLine.toolId,
        requestedQty: 1,
      },
      include: {
        cycle: { select: { id: true, code: true } },
        tool: { select: { id: true, name: true } },
      },
    });

    res.status(201).json(draft);
  } catch (err) {
    console.error("POST /api/sterilization/draft-attachments error:", err);
    return res.status(500).json({ error: "Failed to create draft attachment" });
  }
});

/**
 * DELETE /api/sterilization/draft-attachments/:id/decrement
 * Decrement requestedQty of a draft attachment by 1, delete if reaches 0
 */
router.delete("/sterilization/draft-attachments/:id/decrement", async (req, res) => {
  try {
    const draftId = Number(req.params.id);
    if (!draftId || Number.isNaN(draftId)) {
      return res.status(400).json({ error: "Invalid draft id" });
    }

    const draft = await prisma.sterilizationDraftAttachment.findUnique({
      where: { id: draftId },
    });

    if (!draft) {
      return res.status(404).json({ error: "Draft attachment not found" });
    }

    if (draft.requestedQty <= 1) {
      // Delete the draft
      await prisma.sterilizationDraftAttachment.delete({
        where: { id: draftId },
      });
      return res.json({ deleted: true });
    }

    // Decrement by 1
    const updated = await prisma.sterilizationDraftAttachment.update({
      where: { id: draftId },
      data: { requestedQty: draft.requestedQty - 1 },
      include: {
        cycle: { select: { id: true, code: true } },
        tool: { select: { id: true, name: true } },
      },
    });

    res.json(updated);
  } catch (err) {
    console.error("DELETE /api/sterilization/draft-attachments/:id/decrement error:", err);
    return res.status(500).json({ error: "Failed to decrement draft attachment" });
  }
});

/**
 * GET /api/sterilization/draft-attachments/by-diagnosis/:diagnosisId
 * Get all draft attachments for a diagnosis row
 */
router.get("/sterilization/draft-attachments/by-diagnosis/:diagnosisId", async (req, res) => {
  try {
    const diagnosisId = Number(req.params.diagnosisId);
    if (!diagnosisId || Number.isNaN(diagnosisId)) {
      return res.status(400).json({ error: "Invalid diagnosis id" });
    }

    const drafts = await prisma.sterilizationDraftAttachment.findMany({
      where: { encounterDiagnosisId: diagnosisId },
      include: {
        cycle: { select: { id: true, code: true } },
        tool: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    res.json(drafts);
  } catch (err) {
    console.error("GET /api/sterilization/draft-attachments/by-diagnosis/:diagnosisId error:", err);
    return res.status(500).json({ error: "Failed to load draft attachments" });
  }
});

/**
 * GET /api/sterilization/tool-lines/search
 * Search for available tool lines for encounter sterilization selection
 * Query params: branchId (required), query (optional search text)
 * Returns: Array of tool lines with cycleId, cycleCode, toolId, toolName, toolLineId, remaining
 */
router.get("/sterilization/tool-lines/search", async (req, res) => {
  try {
    const branchId = req.query.branchId ? Number(req.query.branchId) : null;
    const searchQuery = (req.query.query ?? "").toString().trim().toLowerCase();

    if (!branchId) {
      return res.status(400).json({ error: "branchId is required" });
    }

    // Get all PASS cycles for this branch with tool lines
    const cycles = await prisma.autoclaveCycle.findMany({
      where: {
        branchId,
        result: "PASS",
      },
      include: {
        toolLines: {
          include: {
            tool: { select: { id: true, name: true } },
            finalizedUsages: { select: { usedQty: true } },
            disposalLines: { select: { quantity: true } },
          },
        },
      },
      orderBy: [{ completedAt: "desc" }],
    });

    // Build searchable tool line items
    const toolLineItems = [];
    
    for (const cycle of cycles) {
      for (const line of cycle.toolLines) {
        const produced = line.producedQty || 0;
        const used = (line.finalizedUsages || []).reduce((sum, u) => sum + (u.usedQty || 0), 0);
        const disposed = (line.disposalLines || []).reduce((sum, d) => sum + (d.quantity || 0), 0);
        const remaining = Math.max(0, produced - used - disposed);

        // Only include if remaining > 0
        if (remaining > 0) {
          const toolName = line.tool.name || "";
          const cycleCode = cycle.code || "";
          
          // Filter by search query if provided: match on tool name OR cycle code independently
          if (searchQuery) {
            const nameMatch = toolName.toLowerCase().includes(searchQuery);
            const codeMatch = cycleCode.toLowerCase().includes(searchQuery);
            if (!nameMatch && !codeMatch) {
              continue;
            }
          }

          toolLineItems.push({
            toolLineId: line.id,
            cycleId: cycle.id,
            cycleCode: cycle.code,
            toolId: line.tool.id,
            toolName: line.tool.name,
            remaining,
          });
        }
      }
    }

    // Limit results to 200 for performance
    res.json(toolLineItems.slice(0, 200));
  } catch (err) {
    console.error("GET /api/sterilization/tool-lines/search error:", err);
    return res.status(500).json({ error: "Failed to search tool lines" });
  }
});

export default router;
