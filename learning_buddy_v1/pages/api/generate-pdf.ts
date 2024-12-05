import { NextApiRequest, NextApiResponse } from 'next';
import PDFDocument from 'pdfkit';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const reportData = req.body;
    const doc = new PDFDocument();
    
    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=claim_report_${new Date().toISOString()}.pdf`);

    // Pipe the PDF document to the response
    doc.pipe(res);

    // Add content to PDF
    doc.fontSize(16).text('Claim Report', { align: 'center' });
    doc.moveDown();

    // Add sections
    Object.entries(reportData).forEach(([section, data]) => {
      doc.fontSize(14).text(section.replace(/([A-Z])/g, ' $1').trim(), { underline: true });
      doc.moveDown(0.5);
      
      Object.entries(data as Record<string, unknown>).forEach(([key, value]) => {
        doc.fontSize(12).text(`${key.replace(/([A-Z])/g, ' $1').trim()}: ${value}`);
      });
      
      doc.moveDown();
    });

    // Finalize PDF
    doc.end();
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ message: 'Error generating PDF' });
  }
} 