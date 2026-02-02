const Receipt = require('../models/Receipt');
const Student = require('../models/Student');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Email transporter setup
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT || '587', 10),
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// ✅ HELPER: Generate Professional Receipt PDF
const generateReceiptPDF = (doc, receipt, student) => {
  const primaryColor = '#4CAF50'; // Green brand color
  const secondaryColor = '#333333';
  const lightGray = '#f5f5f5';

  // --- HEADER ---
  // Logo Background
  doc.rect(0, 0, 612, 100).fill(primaryColor); // Top banner

  // Title
  doc.fontSize(26).fillColor('white').font('Helvetica-Bold')
    .text('DREAM TUITION CENTER', 0, 30, { align: 'center' });

  doc.fontSize(10).fillColor('white').font('Helvetica')
    .text('Excellence in Education Management', 0, 65, { align: 'center' });

  // Address Section (Below banner)
  doc.moveDown(4);
  doc.fillColor(secondaryColor);
  doc.fontSize(10).text(
    'Door No 50, 1st floor, Pachaiyapan Nagar, 1st street,\nRakkiyapalayam pirvu, Tiruppur-641606',
    { align: 'center' }
  );
  doc.moveDown(0.5);
  doc.fontSize(11).font('Helvetica-Bold').text('Mobile: +91 81100 54961', { align: 'center' });

  // Divider
  doc.moveDown(1);
  doc.moveTo(50, doc.y).lineTo(562, doc.y).strokeColor('#e0e0e0').stroke();

  // --- RECEIPT TITLE ---
  doc.moveDown(2);
  doc.fontSize(20).font('Helvetica-Bold').fillColor(primaryColor)
    .text('PAYMENT RECEIPT', { align: 'center', characterSpacing: 2 });
  doc.moveDown(1.5);

  // --- RECEIPT DETAILS BOX ---
  const boxTop = doc.y;
  const boxLeft = 50;
  const boxWidth = 512;
  const boxHeight = 180;

  // Draw Box
  doc.rect(boxLeft, boxTop, boxWidth, boxHeight).lineWidth(1).strokeColor('#e0e0e0').stroke();

  // Background for labels column
  doc.rect(boxLeft, boxTop, 150, boxHeight).fill(lightGray);

  // Content
  const startY = boxTop + 25;
  const lineHeight = 35;
  const valueX = boxLeft + 170;

  // Labels
  doc.fontSize(11).font('Helvetica-Bold').fillColor(secondaryColor);
  doc.text('Receipt No:', boxLeft + 20, startY);
  doc.text('Date:', boxLeft + 20, startY + lineHeight);
  doc.text('Student Name:', boxLeft + 20, startY + lineHeight * 2);
  doc.text('Month:', boxLeft + 20, startY + lineHeight * 3);
  doc.text('Amount Paid:', boxLeft + 20, startY + lineHeight * 4);

  // Values
  doc.font('Helvetica').fillColor('black');
  doc.text(`# ${receipt._id.toString().slice(-6).toUpperCase()}`, valueX, startY);
  doc.text(new Date(receipt.createdAt).toLocaleDateString('en-IN', {
    year: 'numeric', month: 'long', day: 'numeric'
  }), valueX, startY + lineHeight);

  doc.font('Helvetica-Bold').text(student.name, valueX, startY + lineHeight * 2);
  doc.font('Helvetica').text(receipt.month, valueX, startY + lineHeight * 3);

  // Amount with highlight
  doc.fontSize(14).fillColor(primaryColor).font('Helvetica-Bold')
    .text(`Rs. ${receipt.amount.toFixed(2)}`, valueX, startY + lineHeight * 4 - 2);

  // --- TOTAL ---
  doc.moveDown(8);
  const totalY = doc.y;
  doc.moveTo(50, totalY).lineTo(562, totalY).lineWidth(2).strokeColor(primaryColor).stroke();

  doc.moveDown(1);
  doc.fontSize(12).font('Helvetica-Bold').fillColor(secondaryColor)
    .text('Payment Mode: CASH/ONLINE', 50, doc.y);

  // --- FOOTER / SIGNATURE ---
  const bottomY = 650;

  doc.fontSize(10).font('Helvetica').fillColor(secondaryColor)
    .text("Receiver's Signature", 400, bottomY - 40, { align: 'center' });

  if (receipt.receiverSignature) {
    doc.font('Helvetica-Oblique').fontSize(12)
      .text(receipt.receiverSignature, 400, bottomY - 20, { align: 'center' });
  } else {
    doc.moveTo(400, bottomY - 10).lineTo(550, bottomY - 10).strokeColor(secondaryColor).stroke();
  }

  // Bottom Branding
  doc.fontSize(9).fillColor('#888888')
    .text('Thank you for choosing Dream Tuition Center!', 0, 700, { align: 'center' });
  doc.text('This is a computer-generated receipt.', 0, 715, { align: 'center' });
};


// ✅ CREATE RECEIPT + SEND EMAIL + SAVE PDF
exports.createReceipt = async (req, res) => {
  try {
    const { studentId, month, amount, receiverSignature } = req.body;
    const student = await Student.findById(studentId);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const receipt = new Receipt({
      student: student._id,
      month,
      amount,
      receiverSignature
    });
    await receipt.save();

    // PDF path and creation
    const pdfPath = path.join(__dirname, `../tmp/receipt_${receipt._id}.pdf`);
    const doc = new PDFDocument({ margin: 0, size: 'A4' }); // Zero margin for full header
    const pdfStream = fs.createWriteStream(pdfPath);
    doc.pipe(pdfStream);

    // Generate content
    generateReceiptPDF(doc, receipt, student);

    doc.end();

    // When PDF writing finishes
    pdfStream.on('finish', async () => {
      const mailOptions = {
        from: `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`,
        to: student.email,
        subject: `Tuition Receipt — ${month} — Dream Tution Center`,
        text: `Dear ${student.name},\n\nPlease find attached your tuition receipt for ${month}.\n\nThank you,\nDream Tution Center`,
        attachments: [
          { filename: `Receipt_${month}.pdf`, path: pdfPath }
        ]
      };

      try {
        await transporter.sendMail(mailOptions);
      } catch (emailErr) {
        console.error("Email failed:", emailErr);
        // Continue to respond success even if email fails, but log it
      }

      fs.unlink(pdfPath, err => {
        if (err) console.error('Failed to delete temp file:', err);
      });

      res.json({ receipt, message: 'Receipt created and emailed successfully' });
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// ✅ FETCH ALL STUDENTS PAYMENT STATUS
exports.getStudentsPaymentStatus = async (req, res) => {
  try {
    const { month } = req.query; // frontend will send ?month=January

    const students = await Student.find();
    const receipts = await Receipt.find(month ? { month } : {});

    // find paid students for the selected month
    const paidIds = receipts.map(r => r.student.toString());

    const payable = students
      .filter(s => !paidIds.includes(s._id.toString()))
      .map(s => ({ studentName: s.name }));

    const nonPayable = students
      .filter(s => paidIds.includes(s._id.toString()))
      .map(s => ({ studentName: s.name }));

    res.json({ payable, nonPayable });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch payment data" });
  }
};

// ✅ DOWNLOAD RECEIPT PDF
exports.downloadReceipt = async (req, res) => {
  try {
    const { id } = req.params;
    const receipt = await Receipt.findById(id).populate('student');

    if (!receipt) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    const student = receipt.student;

    // Create PDF
    const doc = new PDFDocument({ margin: 0, size: 'A4' });

    // Set headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Receipt_${student.name}_${receipt.month}.pdf`);

    doc.pipe(res);

    // Generate content
    generateReceiptPDF(doc, receipt, student);

    doc.end();

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to download receipt" });
  }
};
