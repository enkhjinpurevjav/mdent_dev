export function printImage(imageUrl: string) {
  const win = window.open('', '_blank', 'width=800,height=1000');
  if (!win) return;
  win.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>XRAY хэвлэх</title>
        <style>
          html, body { margin: 0; padding: 0; width: 210mm; height: 297mm; background: #fff; }
          .container { width: 100vw; height: 100vh; display: flex; align-items: center; justify-content: center; }
          img { max-width: 200mm; max-height: 280mm; }
          @media print { @page { size: A4 portrait; margin: 0; } }
        </style>
      </head>
      <body>
        <div class="container">
          <img src="${imageUrl}" alt="XRAY" onload="window.print();window.close();" />
        </div>
      </body>
    </html>
  `);
  win.document.close();
}
