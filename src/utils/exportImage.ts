import html2canvas from 'html2canvas';

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
