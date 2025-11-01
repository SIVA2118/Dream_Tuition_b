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

    // Generate PDF receipt
    const pdfPath = path.join(__dirname, `../tmp/receipt_${receipt._id}.pdf`);
    const doc = new PDFDocument({ margin: 40 });

    // Header
    doc.fontSize(20).text('Dream Tution Center', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).text('Door No 50, 1st floor, Pachaiyapan Nagar, 1st street, Rakkiyapalayam pirvu, Tiruppur-641606', {
      align: 'center'
    });
    doc.moveDown(1);
    doc.fontSize(12).text(`📞 Mobile: 8110054961`, { align: 'center' });
    doc.moveDown(1);
    doc.moveTo(40, doc.y).lineTo(550, doc.y).stroke();

    // Body
    doc.moveDown(1.5);
    doc.fontSize(12);
    doc.text(`Name: ${student.name}`);
    doc.text(`Month: ${month}`);
    doc.text(`Amount (Rs): ${amount.toFixed(2)}`);
    doc.text(`Receipt No: ${receipt._id}`);
    doc.text(`Date: ${new Date(receipt.createdAt).toLocaleDateString()}`);
    doc.moveDown(2);
    doc.text(`Receiver's signature: ${receiverSignature || '____________________'}`, { align: 'left' });
    doc.moveDown(3);

    // Footer
    doc.moveTo(40, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.5);
    doc.fontSize(10).text('Thank you for choosing Dream Tution Center!', { align: 'center' });

    doc.end();

    // Save PDF to temporary path
    const pdfStream = fs.createWriteStream(pdfPath);
    doc.pipe(pdfStream);

    pdfStream.on('finish', async () => {
      // Send email with PDF attachment
      const mailOptions = {
        from: `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`,
        to: student.email,
        subject: `Tuition Receipt — ${month} — Dream Tution Center`,
        text: `Dear ${student.name},\n\nPlease find attached your tuition receipt for ${month}.\n\nThank you,\nDream Tution Center`,
        attachments: [
          {
            filename: `Receipt_${month}.pdf`,
            path: pdfPath
          }
        ]
      };

      await transporter.sendMail(mailOptions);

      // Delete temp PDF after sending
      fs.unlink(pdfPath, err => {
        if (err) console.error('Failed to delete temp file:', err);
      });

      res.json({ receipt, message: 'Receipt created and PDF emailed successfully' });
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
