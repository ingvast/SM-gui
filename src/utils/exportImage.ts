import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

export async function copyImageToClipboard(element: HTMLElement): Promise<void> {
  const canvas = await html2canvas(element, { backgroundColor: '#e8e8e8', scale: 2 });
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b);
      else reject(new Error('Failed to create blob'));
    }, 'image/png');
  });
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}

export async function exportToPdf(element: HTMLElement, fileName: string): Promise<void> {
  const canvas = await html2canvas(element, { backgroundColor: '#e8e8e8', scale: 2 });
  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({
    orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
    unit: 'px',
    format: [canvas.width, canvas.height],
  });
  pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
  const blob = pdf.output('blob');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
