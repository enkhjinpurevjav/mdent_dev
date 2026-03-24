export function printImage(imageUrl: string) {
  const win = window.open('', '_blank', 'width=900,height=1200');
  if (!win) return;
  win.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>XRAY хэвлэх</title>
        <style>
          body, html { margin: 0; padding: 0; width: 210mm; height: 297mm; background: #fff; }
          .container { width: 100vw; height: 100vh; display: flex; align-items: center; justify-content: center; }
          img { max-width: 200mm; max-height: 280mm; margin: 0 auto; display: block; }
          @media print {
            @page { size: A4 portrait; margin: 0; }
            html, body { width: 210mm; height: 297mm; }
            .container { min-height: 270mm; min-width: 190mm; }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <img src="${imageUrl.replace(/"/g, '&quot;')}" alt="XRAY" onload="window.print();window.close();" />
        </div>
      </body>
    </html>
  `);
  win.document.close();
}
