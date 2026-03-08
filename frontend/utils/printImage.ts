/**
 * Opens a dedicated print-preview window for an image (e.g. XRAY).
 * Auto-detects orientation: landscape if naturalWidth > naturalHeight, else portrait.
 * Uses A4 page size with the correct orientation and scales the image to fit.
 */
export function printImage(imageUrl: string): void {
  const win = window.open("", "_blank", "width=900,height=700,noopener,noreferrer");
  if (!win) return;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>XRAY хэвлэх</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; background: #fff; }
    .container {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100vh;
    }
    img {
      max-width: 100%;
      max-height: 100vh;
      object-fit: contain;
      display: block;
    }
    @media print {
      html, body { width: 100%; height: 100%; }
      .container {
        width: 100%;
        height: 100%;
        page-break-inside: avoid;
      }
      img {
        max-width: 100%;
        max-height: 100%;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <img id="xray-img" src="${imageUrl.replace(/"/g, "&quot;")}" alt="XRAY" />
  </div>
  <script>
    var img = document.getElementById('xray-img');
    window.addEventListener('afterprint', function() { window.close(); }, { once: true });
    function applyOrientation(orientation) {
      var style = document.createElement('style');
      style.textContent = '@page { size: A4 ' + orientation + '; margin: 10mm; }';
      document.head.appendChild(style);
    }
    function doPrint() {
      var orientation = img.naturalWidth > img.naturalHeight ? 'landscape' : 'portrait';
      applyOrientation(orientation);
      window.print();
    }
    if (img.complete && img.naturalWidth > 0) {
      doPrint();
    } else {
      img.addEventListener('load', doPrint);
      img.addEventListener('error', function() {
        applyOrientation('portrait');
        window.print();
      });
    }
  </script>
</body>
</html>`;

  win.document.write(html);
  win.document.close();
}
