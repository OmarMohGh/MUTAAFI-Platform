import jsPDF from 'jspdf';

// ── Brand Colors (RGB arrays) ──────────────────────────────
const GREEN     = [16, 138, 110];
const DARK      = [42, 52, 65];
const GRAY      = [107, 114, 128];
const LIGHT_GRN = [234, 255, 246];
const LIGHT_GRY = [243, 244, 246];
const WHITE     = [255, 255, 255];

// ── Page constants (A4 portrait, mm) ───────────────────────
const PW = 210, PH = 297, M = 15;
const CW = PW - M * 2;            // content width
const BOTTOM = PH - 12;           // footer zone starts here

// ── Helpers ────────────────────────────────────────────────
function ensureSpace(doc, y, needed) {
  if (y + needed > BOTTOM) {
    doc.addPage();
    return M;
  }
  return y;
}

function drawHeader(doc, { title, userName, date, subtitle, logoBase64 }) {
  let y = M;

  // Logo + brand name
  if (logoBase64) {
    try { doc.addImage(logoBase64, 'PNG', M, y - 2, 10, 10); } catch { /* skip */ }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...GREEN);
    doc.text('MUTAAFI', M + 13, y + 5);
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(...GREEN);
    doc.text('MUTAAFI', M, y + 6);
  }
  y += 13;

  // Divider
  doc.setDrawColor(...GREEN);
  doc.setLineWidth(0.7);
  doc.line(M, y, PW - M, y);
  y += 7;

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...DARK);
  doc.text(title, M, y);
  y += 6;

  // User + date
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GRAY);
  doc.text(`${userName}  ·  ${date}`, M, y);
  y += 5;

  // Subtitle
  if (subtitle) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...GREEN);
    doc.text(subtitle, M, y);
    y += 5;
  }

  return y + 4;
}

function addFooters(doc) {
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...GRAY);
    doc.text('MUTAAFI — Your Personal Fitness Companion', M, PH - 7);
    doc.text(`Page ${i} of ${total}`, PW - M, PH - 7, { align: 'right' });
  }
}

function formatDate(dateStr) {
  if (!dateStr) return new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

// ── Load logo as base64 ───────────────────────────────────
export function loadLogoBase64(logoUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      c.getContext('2d').drawImage(img, 0, 0);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = () => resolve(null);
    img.src = logoUrl;
  });
}

// ════════════════════════════════════════════════════════════
//  WORKOUT PDF
// ════════════════════════════════════════════════════════════
export function exportWorkoutPdf({ userName, scheduleType, weeklyPlan, logoBase64 }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const today = todayISO();

  let y = drawHeader(doc, {
    title: 'WEEKLY WORKOUT PLAN',
    userName,
    date: formatDate(today),
    subtitle: scheduleType || null,
    logoBase64,
  });

  // ── Each day ──
  for (const day of weeklyPlan) {
    // Day header needs ~12mm, rest day content ~10mm, exercises vary
    const estHeight = day.is_rest ? 22 : 14 + (day.exercises?.length || 0) * 14;
    y = ensureSpace(doc, y, Math.min(estHeight, 40));

    // Day header bar
    doc.setFillColor(...(day.is_rest ? LIGHT_GRY : LIGHT_GRN));
    doc.roundedRect(M, y, CW, 8, 1.5, 1.5, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...(day.is_rest ? GRAY : GREEN));
    doc.text(`${day.day_name.toUpperCase()}`, M + 4, y + 5.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(day.day_label, M + CW - 4, y + 5.5, { align: 'right' });

    y += 11;

    if (day.is_rest) {
      // Rest day message
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8.5);
      doc.setTextColor(...GRAY);
      doc.text('No workout scheduled — Recovery day', M + 4, y + 3);
      y += 10;
    } else {
      // Exercise list
      const exercises = day.exercises || [];
      for (let i = 0; i < exercises.length; i++) {
        y = ensureSpace(doc, y, 14);
        const ex = exercises[i];

        // Exercise number + name
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(...DARK);
        doc.text(`${i + 1}.  ${ex.name}`, M + 4, y + 3);

        // Muscle group + specific (right side)
        const muscleText = ex.specific_muscle
          ? `${ex.muscle_group} · ${ex.specific_muscle}`
          : ex.muscle_group;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...GRAY);
        doc.text(muscleText, M + CW - 4, y + 3, { align: 'right' });

        y += 5;

        // Sets × Reps / Cardio + Equipment + Weight
        let detailParts = [];
        if (ex.is_cardio) {
          detailParts.push(`Cardio: ${ex.cardio_minutes} min`);
        } else {
          detailParts.push(`${ex.sets || 3} sets × ${ex.reps || 12} reps`);
        }
        if (ex.equipment) detailParts.push(ex.equipment);
        if (ex.weight_lifted != null) detailParts.push(`${ex.weight_lifted} kg`);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...GRAY);
        doc.text(detailParts.join('  ·  '), M + 12, y + 2);

        y += 7;

        // Subtle separator between exercises (not after last)
        if (i < exercises.length - 1) {
          doc.setDrawColor(230, 230, 230);
          doc.setLineWidth(0.2);
          doc.line(M + 4, y - 1, M + CW - 4, y - 1);
        }
      }
    }

    y += 3; // spacing between days
  }

  addFooters(doc);
  doc.save(`MUTAAFI_Workout_Plan_${today}.pdf`);
}

// ════════════════════════════════════════════════════════════
//  MEAL PLAN PDF
// ════════════════════════════════════════════════════════════
export function exportMealPlanPdf({ userName, meals, targets, logoBase64 }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const today = todayISO();

  // Compute totals
  const totalCal   = meals.reduce((s, m) => s + (m.nutrition_data?.calories || 0), 0);
  const totalProt  = meals.reduce((s, m) => s + (parseFloat(m.nutrition_data?.protein) || 0), 0);
  const totalFat   = meals.reduce((s, m) => s + (parseFloat(m.nutrition_data?.fats) || 0), 0);
  const totalCarbs = meals.reduce((s, m) => s + (parseFloat(m.nutrition_data?.carbs) || 0), 0);

  let y = drawHeader(doc, {
    title: "TODAY'S MEAL PLAN",
    userName,
    date: formatDate(today),
    subtitle: null,
    logoBase64,
  });

  // ── Summary stats bar ──
  y = ensureSpace(doc, y, 18);
  doc.setFillColor(...LIGHT_GRN);
  doc.roundedRect(M, y, CW, 14, 2, 2, 'F');

  const statY = y + 6;
  const cols = [
    { label: 'Calories', value: `${totalCal} kcal`, target: targets?.calories ? `/ ${targets.calories}` : '' },
    { label: 'Protein',  value: `${Math.round(totalProt)}g`, target: targets?.protein ? `/ ${targets.protein}g` : '' },
    { label: 'Fat',      value: `${Math.round(totalFat)}g`, target: '' },
    { label: 'Carbs',    value: `${Math.round(totalCarbs)}g`, target: '' },
  ];
  const colW = CW / cols.length;
  cols.forEach((col, i) => {
    const cx = M + colW * i + colW / 2;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...GRAY);
    doc.text(col.label, cx, statY - 1, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...DARK);
    let valText = col.value;
    if (col.target) valText += ` ${col.target}`;
    doc.text(valText, cx, statY + 4, { align: 'center' });
  });

  y += 20;

  // ── Group meals by slot ──
  const slotOrder = ['Breakfast', 'Lunch', 'Snacks', 'Dinner'];
  const groups = {};
  slotOrder.forEach(s => groups[s] = []);
  meals.forEach(m => {
    const group = m.slot_name?.startsWith('Snack') ? 'Snacks' : m.slot_name;
    if (groups[group]) groups[group].push(m);
  });

  for (const slotName of slotOrder) {
    const slotMeals = groups[slotName];

    // Slot header
    y = ensureSpace(doc, y, 18);
    doc.setFillColor(...LIGHT_GRN);
    doc.roundedRect(M, y, CW, 7, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...GREEN);
    doc.text(slotName.toUpperCase(), M + 4, y + 5);
    y += 10;

    if (!slotMeals || slotMeals.length === 0) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(...GRAY);
      doc.text('No meal assigned', M + 4, y + 3);
      y += 8;
      continue;
    }

    for (const m of slotMeals) {
      const nd = m.nutrition_data || {};
      y = ensureSpace(doc, y, 20);

      // Meal name
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(...DARK);
      doc.text(nd.meal_name || 'Unnamed Meal', M + 4, y + 3);
      y += 6;

      // Nutrition row
      const nutParts = [];
      if (nd.calories != null) nutParts.push(`${nd.calories} kcal`);
      if (nd.protein != null) nutParts.push(`${nd.protein}g protein`);
      if (nd.fats != null) nutParts.push(`${Math.round(parseFloat(nd.fats))}g fat`);
      if (nd.carbs != null) nutParts.push(`${Math.round(parseFloat(nd.carbs))}g carbs`);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...GRAY);
      doc.text(nutParts.join('  ·  '), M + 4, y + 2);
      y += 6;

      // Ingredients
      const ingredients = nd.ingredients;
      if (ingredients) {
        y = ensureSpace(doc, y, 10);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(...DARK);
        doc.text('Ingredients:', M + 4, y + 2);
        y += 4;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(...GRAY);
        const ingText = Array.isArray(ingredients) ? ingredients.join(', ') : String(ingredients);
        const ingLines = doc.splitTextToSize(ingText, CW - 12);
        for (const line of ingLines) {
          y = ensureSpace(doc, y, 5);
          doc.text(line, M + 8, y + 2);
          y += 3.5;
        }
        y += 1;
      }

      // Preparation steps
      const prepSteps = nd.preparation_steps || nd.prep_steps;
      if (prepSteps) {
        y = ensureSpace(doc, y, 10);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(...DARK);
        doc.text('Preparation:', M + 4, y + 2);
        y += 4;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(...GRAY);
        const prepText = Array.isArray(prepSteps) ? prepSteps.join(' ') : String(prepSteps);
        const prepLines = doc.splitTextToSize(prepText, CW - 12);
        for (const line of prepLines) {
          y = ensureSpace(doc, y, 5);
          doc.text(line, M + 8, y + 2);
          y += 3.5;
        }
        y += 1;
      }

      // Separator
      y += 2;
      doc.setDrawColor(230, 230, 230);
      doc.setLineWidth(0.2);
      doc.line(M + 4, y, M + CW - 4, y);
      y += 4;
    }
  }

  addFooters(doc);
  doc.save(`MUTAAFI_Meal_Plan_${today}.pdf`);
}
